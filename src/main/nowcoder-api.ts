import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { RequestQueue } from './cf-api';
import type { NowcoderUser } from '../shared/types';

/**
 * 牛客数据层 (Phase 1b)
 *
 * 重要前提 (见 docs/multi-platform-integration-spec.md §2):
 *   牛客没有公开的个人数据 API。个人 rating / 通过数等只能逆向 ac.nowcoder.com 的页面接口,
 *   且必须携带用户自己的 session cookie (如 _nowcoder_*)。无 cookie 时接口重定向到登录页, 取不到数据。
 *
 * 因此本模块的设计是「可降级、容错优先」:
 *   - 无 cookie -> 直接抛 NowcoderNoCookieError, 由上层标记该平台不可用、不阻断其它平台。
 *   - cookie 失效 (302 到登录页) / 解析失败 -> 抛错, 上层标记 unavailable。
 *   - cookie 有效时: 拉取 acm/contest/profile/{id} 页面 HTML, 从中抽取内嵌的
 *     window.__INITIAL_STATE__ JSON, 递归查找用户对象并映射为 NowcoderUser。
 *
 * 接口路径与 __INITIAL_STATE__ 内部结构随牛客前端改版可能变化 (牛客「脆弱」的根本原因),
 * 因此解析采用「递归搜索任意含 id + 名称字段的对象」而非硬编码某一路径, 最大化兼容性。
 * 真实字段映射若与预期不符, 仅调整 mapNowcoderUser 即可, 不影响整体容错结构。
 */

const NC_BASE = 'https://ac.nowcoder.com';
// 真实浏览器 UA, 降低被风控直接拦截的概率
const NC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 限速队列: 牛客接口较轻, 1 次/秒足够 (与 CF 的 2s、洛谷的 1s 同思路)
export const nowcoderQueue = new RequestQueue(1000);

/** 无 cookie / cookie 失效时抛出, 上层据此标记平台不可用 */
export class NowcoderNoCookieError extends Error {
  constructor() {
    super('NO_COOKIE');
    this.name = 'NowcoderNoCookieError';
  }
}

/** 牛客页面请求: 带 cookie; 遇 302 (登录页) 视为 cookie 失效 */
async function ncGetHtml(path: string, cookie: string): Promise<string> {
  return nowcoderQueue.enqueue(async () => {
    const resp: AxiosResponse<string> = await axios.get<string>(`${NC_BASE}${path}`, {
      headers: {
        'User-Agent': NC_UA,
        Referer: 'https://ac.nowcoder.com/',
        Cookie: cookie,
        Accept: 'text/html,application/xhtml+xml',
      },
      maxRedirects: 0,
      // 只接受 200 (正常页面) / 302 (登录重定向 = cookie 失效)
      validateStatus: (s) => s === 200 || s === 302,
      timeout: 20000,
    });
    if (resp.status === 302) {
      throw new NowcoderNoCookieError();
    }
    return typeof resp.data === 'string' ? resp.data : String(resp.data);
  });
}

/**
 * 从 HTML 中抽取 window.__INITIAL_STATE__ 的 JSON 对象。
 * 用括号配平扫描, 兼容内层嵌套的 { } 与字符串中的括号, 避免非贪婪匹配误截。
 */
function extractInitialState(html: string): unknown | null {
  const marker = 'window.__INITIAL_STATE__';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf('=', idx);
  if (eq < 0) return null;
  const start = html.indexOf('{', eq);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let strCh = '';
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      strCh = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const json = html.slice(start, i + 1);
        try {
          return JSON.parse(json);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// 判断一个对象是否「像」用户对象: 同时含 id 类字段与名称类字段
function looksLikeUser(o: Record<string, unknown>): boolean {
  const hasId = 'userId' in o || 'uid' in o || 'id' in o;
  const hasName =
    'nickname' in o ||
    'userName' in o ||
    'name' in o ||
    'realName' in o ||
    'nickName' in o;
  return hasId && hasName;
}

/** 递归查找第一个「像用户」的对象 (深度优先, 优先顶层) */
function findUserObject(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findUserObject(item);
      if (r) return r;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  if (looksLikeUser(rec)) return rec;
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    if (v && typeof v === 'object') {
      const r = findUserObject(v);
      if (r) return r;
    }
  }
  return null;
}

/** 把任意「像用户」的对象映射为规范的 NowcoderUser (字段缺失则留 undefined) */
function mapNowcoderUser(o: Record<string, unknown>): NowcoderUser {
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return undefined;
  };
  const id = num(o.userId ?? o.uid ?? o.id);
  const name =
    (o.nickname ?? o.nickName ?? o.userName ?? o.name ?? o.realName) as string | undefined;
  return {
    id: id ?? 0,
    name: typeof name === 'string' ? name : '',
    avatar: typeof o.avatar === 'string' ? o.avatar : undefined,
    rating: num(o.rating ?? o.score ?? o.ability ?? o.ratingScore),
    accepted: num(o.accepted ?? o.acceptCount ?? o.solved ?? o.solvedCount),
    solved: num(o.solved ?? o.solvedCount ?? o.accepted ?? o.acceptCount),
  };
}

/**
 * 拉取牛客用户资料。必须传 cookie, 否则抛 NowcoderNoCookieError。
 * 成功返回 NowcoderUser; 页面无内嵌数据 / 找不到用户对象 / 用户名为空 -> 抛错 (上层标记 unavailable)。
 */
export async function fetchNowcoderUser(id: number, cookie: string): Promise<NowcoderUser> {
  if (!cookie || !cookie.trim()) {
    throw new NowcoderNoCookieError();
  }
  const html = await ncGetHtml(`/acm/contest/profile/${id}`, cookie);
  const state = extractInitialState(html);
  if (!state || typeof state !== 'object') {
    throw new Error('牛客数据解析失败: 页面未内嵌用户数据 (可能 cookie 已失效)');
  }
  const userObj = findUserObject(state);
  if (!userObj) {
    throw new Error('牛客数据解析失败: 未在页面状态中找到用户对象 (接口结构可能已变更)');
  }
  const mapped = mapNowcoderUser(userObj);
  if (!mapped.name) {
    throw new Error('牛客数据解析失败: 解析到的用户名为空');
  }
  return mapped;
}
