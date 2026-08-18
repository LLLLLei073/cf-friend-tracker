import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { RequestQueue } from './cf-api';
import type { LuoguUser, PlatformAccount } from '../shared/types';

/**
 * 洛谷数据层 (Phase 0/1a)
 *
 * 匿名只读 API 实测范围 (2026-08-16 真实联调):
 *   ✅ /api/user/info/{uid}   用户详情 (通过数/提交数/CCF 等级/颜色/经验等)
 *   ✅ /api/user/search?keyword=  按用户名搜索候选 (解析 uid)
 *   ❌ /api/user/record/list/{uid}  提交记录 —— 匿名 404, 需登录态
 *   ❌ /api/contest/list           比赛列表 —— 匿名 404, 需登录态
 *
 * 因此本期仅集成「用户数据」(user/info + user/search):
 * 支撑 AddFriend 洛谷、好友列表洛谷徽章、跨平台榜单。
 * 提交记录 / 比赛列表待登录态支持 (keytar 存 cookie) 后再做 (Phase 1b/二期)。
 *
 * 反爬关键: 洛谷对无头客户端/数据中心出口会返回 302 重定向到自身并下发 C3VK cookie
 * (nginx 层风控)。处理方式见 luoguGet: 不跟随重定向, 遇 302 提取 cookie 后重试一次。
 * 真实家用 IP 通常直接 200, 不会触发 302。
 */
const LUOGU_BASE = 'https://www.luogu.com.cn/api';
// 真实浏览器 UA, 降低被洛谷反爬 (C3VK) 拦截的概率
const LUOGU_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 限速队列: 洛谷建议 ~1 次/秒 (与 CF 的 2s 不同)
export const luoguQueue = new RequestQueue(1000);

// 会话 cookie (C3VK 握手后获得)。真实家用 IP 通常不触发 302, 此时为空, 请求照常工作。
let sessionCookie = '';

function ingestCookies(resp: AxiosResponse): void {
  const sc = resp.headers['set-cookie'];
  if (!sc) return;
  const parts = sc.map((c) => c.split(';')[0]);
  sessionCookie = sessionCookie ? `${sessionCookie}; ${parts.join('; ')}` : parts.join('; ');
}

// 洛谷 user/info 接口返回的 user 对象 (仅取我们关心的字段)
interface LuoguRawUser {
  uid: number;
  name: string;
  avatar?: string | null;
  slogan?: string | null;
  passedProblemCount?: number;
  submittedProblemCount?: number;
  ccfLevel?: number;
  xcpcLevel?: number;
  color?: string | null;
  ranking?: number | null;
  followerCount?: number;
  followingCount?: number;
  elo?: number | null;
  registerTime?: number;
}

interface LuoguRawSearchUser {
  uid: number;
  name: string;
  avatar?: string | null;
  slogan?: string | null;
  badge?: unknown;
  ccfLevel?: number;
  xcpcLevel?: number;
  color?: string | null;
}

/**
 * 统一的洛谷 GET 请求: 带真实 UA + _contentOnly=1 + C3VK cookie 握手。
 *
 * 反爬关键: 洛谷对无头客户端/数据中心出口会返回 302 重定向到自身并下发 C3VK cookie
 * (nginx 层风控)。处理方式是手动不跟随重定向, 遇到 302 时提取 cookie 后重试一次;
 * 重试成功即拿到匿名会话 (__client_id/_uid), 后续请求带全套 cookie 直接 200。
 * 真实家用 IP 通常直接 200, 不会触发 302。
 */
async function luoguGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  return luoguQueue.enqueue(async () => {
    const requestOnce = (withCookie: boolean) =>
      axios.get<T>(`${LUOGU_BASE}${path}`, {
        headers: {
          'User-Agent': LUOGU_UA,
          'Referer': 'https://www.luogu.com.cn/',
          'x-lentille-request': 'content-only',
          ...(withCookie && sessionCookie ? { Cookie: sessionCookie } : {}),
        },
        params: { _contentOnly: 1, ...params },
        maxRedirects: 0,
        // 只接受 200/302; 其余 (404/403/5xx) 由调用方按 data 判断或抛错
        validateStatus: (s) => s === 200 || s === 302,
        timeout: 20000,
      });

    let resp: AxiosResponse<T> = await requestOnce(!!sessionCookie);
    // 触发 C3VK 质询 -> 取 cookie 重试一次
    if (resp.status === 302) {
      ingestCookies(resp);
      resp = await requestOnce(true);
    }
    if (resp.status === 302) {
      throw new Error('洛谷反爬质询未通过 (C3VK), 请改用真实网络或在浏览器打开 luogu.com.cn');
    }
    return resp.data;
  });
}

/** 按洛谷用户名搜索用户, 返回候选列表 (uid + name)。添加好友时用于解析 uid。 */
export async function searchLuoguUser(name: string): Promise<PlatformAccount[]> {
  const data = await luoguGet<{ users?: LuoguRawSearchUser[] }>('/user/search', {
    keyword: name,
  });
  return (data.users || []).map((u) => ({ uid: u.uid, name: u.name }));
}

/** 拉取洛谷用户详情 (通过数/提交数/CCF 等级等)。Phase 0 核心打通点。 */
export async function fetchLuoguUserDetail(uid: number): Promise<LuoguUser> {
  const data = await luoguGet<{ user?: LuoguRawUser }>(`/user/info/${uid}`);
  if (!data.user) {
    throw new Error(`洛谷用户 ${uid} 不存在或接口返回异常`);
  }
  const u = data.user;
  return {
    uid: u.uid,
    name: u.name,
    avatar: u.avatar ?? undefined,
    slogan: u.slogan ?? undefined,
    passed: u.passedProblemCount ?? 0,
    submitted: u.submittedProblemCount ?? 0,
    ccfLevel: u.ccfLevel,
    xcpcLevel: u.xcpcLevel,
    color: u.color ?? undefined,
    ranking: u.ranking ?? undefined,
    followerCount: u.followerCount,
    followingCount: u.followingCount,
    elo: u.elo ?? undefined,
    registerTime: u.registerTime,
  };
}
