import axios from 'axios';
import crypto from 'crypto';
import type {
  CFUser,
  CFRatingChange,
  CFSubmission,
  CFApiResponse,
  CFContest,
  CFContestStandings,
  ContestPerformance,
} from '../shared/types';

const API_BASE = 'https://codeforces.com/api';
const MIN_INTERVAL_MS = 2000; // CF 限制:1次/2秒

/**
 * 请求队列:保证任意两次请求间隔 >= MIN_INTERVAL_MS
 */
export class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(private intervalMs: number = MIN_INTERVAL_MS) {}

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.intervalMs) {
        await new Promise((r) => setTimeout(r, this.intervalMs - elapsed));
      }
      this.lastRequestTime = Date.now();
      const task = this.queue.shift()!;
      await task();
    }

    this.processing = false;
  }
}

export const requestQueue = new RequestQueue();

/**
 * 判断是否为可重试的网络错误(超时、连接重置、TLS 断开、5xx 等)。
 * CF API 经常因网络波动失败, 对这类错误重试可显著提升成功率。
 */
function isRetryableNetworkError(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false;
  const code = (e as { code?: string }).code;
  if (code && ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN'].includes(code)) {
    return true;
  }
  const status = e.response?.status ?? 0;
  if (status >= 500 && status < 600) {
    return true;
  }
  // 无 response 的网络错误(TLS 握手失败、socket 断开等)可重试
  if (!e.response) {
    return true;
  }
  return false;
}

async function cfRequest<T>(
  method: string,
  params: Record<string, string>,
  auth?: { apiKey: string; apiSecret: string }
): Promise<T> {
  return requestQueue.enqueue(async () => {
    const allParams: Record<string, string> = { ...params };

    if (auth) {
      const time = Math.floor(Date.now() / 1000).toString();
      allParams.apiKey = auth.apiKey;
      allParams.time = time;

      // 生成 apiSig
      const rand = crypto.randomBytes(3).toString('hex');
      const sortedParams = Object.keys(allParams)
        .sort()
        .map((k) => `${k}=${allParams[k]}`)
        .join('&');
      const sigBase = `${rand}/${method}?${sortedParams}#${auth.apiSecret}`;
      const hash = crypto.createHash('sha512').update(sigBase).digest('hex');
      allParams.apiSig = rand + hash;
    }

    const query = new URLSearchParams(allParams).toString();
    const url = `${API_BASE}/${method}?${query}`;

    let lastError: Error | null = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const resp = await axios.get<CFApiResponse<T>>(url, { timeout: 15000 });
        if (resp.data.status === 'OK' && resp.data.result !== undefined) {
          return resp.data.result;
        }
        // Call limit exceeded -> 退避后重试
        if (resp.data.comment === 'Call limit exceeded' && attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(resp.data.comment || 'API request failed');
      } catch (e) {
        // 非 axios 错误(主动 throw 的业务错误)直接抛出, 不进入重试
        if (!axios.isAxiosError(e)) throw e;
        lastError = e as Error;

        const status = e.response?.status ?? 0;
        const cfError = e.response?.data as CFApiResponse<T> | undefined;
        const comment = cfError?.comment;

        // 5xx(服务器繁忙/不稳定) 或 限流: 指数退避重试。
        // 注意: 必须先于 cfError.comment 判断——CF 偶发 500 时 body 会带
        // comment(如 "Internal Server Error"), 若先抛 comment 就永远不重试,
        // 一次 500 就会让整个刷新失败(表现为"点击刷新卡住, 加载不出好友信息")。
        const isServerError = status >= 500 && status < 600;
        const isRateLimited = comment === 'Call limit exceeded' || status === 429;
        if ((isServerError || isRateLimited) && attempt < MAX_ATTEMPTS - 1) {
          const backoff = 1000 * Math.pow(2, attempt); // 1s, 2s
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        // CF API 返回明确业务错误(如 User not found), 不重试
        if (cfError?.comment) {
          throw new Error(cfError.comment);
        }

        // 纯网络错误(超时、TLS 断开、ECONNRESET 等): 指数退避重试
        if (isRetryableNetworkError(e) && attempt < MAX_ATTEMPTS - 1) {
          const backoff = 1000 * Math.pow(2, attempt); // 1s, 2s
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`网络错误: ${(e as Error).message}`);
      }
    }
    throw lastError ?? new Error('API request failed');
  });
}

export async function fetchUserInfo(handles: string[]): Promise<CFUser[]> {
  return cfRequest<CFUser[]>('user.info', { handles: handles.join(';') });
}

/**
 * 容错版批量获取用户信息。
 *
 * CF 的 user.info 接口是"一损俱损"的：handles 中只要有一个无效
 * （已注销 / 改名 / 大小写不符），整个请求就返回 FAILED，导致全部好友
 * 都无法刷新。因此这里先整批请求；若整批失败，再降级为逐 handle 请求，
 * 把无效的 handle 单独挑出来（放入 failed），其余正常返回。
 *
 * 注意：降级路径每个 handle 单独请求，在队列限速下会比较慢（2s/handle），
 * 仅当整批失败（即确实存在无效 handle）时才触发，正常情况仍是一次请求。
 */
export async function fetchUserInfoSafe(
  handles: string[]
): Promise<{ infos: CFUser[]; failed: string[] }> {
  if (handles.length === 0) return { infos: [], failed: [] };
  try {
    const infos = await fetchUserInfo(handles);
    return { infos, failed: [] };
  } catch {
    const infos: CFUser[] = [];
    const failed: string[] = [];
    for (const handle of handles) {
      try {
        const one = await fetchUserInfo([handle]);
        if (one.length > 0) infos.push(one[0]);
        else failed.push(handle);
      } catch {
        failed.push(handle);
      }
    }
    return { infos, failed };
  }
}

export async function fetchUserRating(handle: string): Promise<CFRatingChange[]> {
  return cfRequest<CFRatingChange[]>('user.rating', { handle });
}

export async function fetchUserStatus(handle: string, count = 50): Promise<CFSubmission[]> {
  return cfRequest<CFSubmission[]>('user.status', { handle, count: count.toString() });
}

export async function fetchFriends(
  handle: string,
  apiKey: string,
  apiSecret: string
): Promise<string[]> {
  return cfRequest<string[]>('user.friends', { handle }, { apiKey, apiSecret });
}

export async function fetchContests(): Promise<CFContest[]> {
  return cfRequest<CFContest[]>('contest.list', {});
}

export async function fetchContestStandings(
  contestId: number
): Promise<CFContestStandings> {
  // 重要: CF 规定非 gym 比赛, 非管理员用户调用 contest.standings 只能带 contestId 一个参数,
  // 不能附带 from / count / showUnofficial, 否则报
  // "Non-gym contest standings ... only via anonymous GET requests with no extra parameters"。
  // 因此这里统一只传 contestId, 由 API 返回完整榜单(适用于评级预测与比赛表现统计)。
  // (gym 比赛也能正常返回, 默认仅官方参赛行。)
  return cfRequest<CFContestStandings>('contest.standings', {
    contestId: contestId.toString(),
  });
}

/**
 * 计算给定 handles 在某场比赛中的表现(AC 题数 / 排名 / 得分)。
 * 复用 contest.standings: 仅保留目标 handles 的行, 通过 problemResults 中 points>0 的题数得到 AC。
 * 注意: standings 返回完整榜单, 但 CF 对超大型比赛(数万参赛者)的返回可能受服务端上限约束,
 * 排名极靠后的参赛者可能无法出现在结果中, 此时对应 handle 不会有数据。
 */
export async function fetchContestPerformance(
  contestId: number,
  handles: string[]
): Promise<Record<string, ContestPerformance>> {
  const handleSet = new Set(handles);
  const standings = await fetchContestStandings(contestId);
  const result: Record<string, ContestPerformance> = {};
  for (const row of standings.rows) {
    const handle = row.party.members[0]?.handle;
    if (!handle || !handleSet.has(handle)) continue;
    const acCount = row.problemResults.filter((pr) => pr.points > 0).length;
    result[handle] = { acCount, rank: row.rank, points: row.points };
  }
  return result;
}

// 获取单场比赛的题目清单（按比赛顺序 A, B, C...）。
// 复用 contest.standings（只传 contestId）返回的 problems 数组, 该数组即本场比赛全部题目且顺序正确。
export async function fetchContestProblems(contestId: number): Promise<import('../shared/types').ProblemListItem[]> {
  const standings = await fetchContestStandings(contestId);
  const cid = standings.contest?.id ?? contestId;
  return standings.problems.map((p) => ({
    contestId: cid,
    index: p.index,
    name: p.name,
    rating: p.rating,
    tags: p.tags ?? [],
    type: p.type,
    solvedCount: undefined,
  }));
}

// problemset.problems 的返回（result 部分）
export interface CFProblemStat {
  contestId?: number;
  index: string;
  solvedCount: number;
}
export interface CFProblemsetResult {
  problems: import('../shared/types').CFProblem[];
  problemStatistics: CFProblemStat[];
}

// 获取全部题目元信息（含标签/难度/通过人数）。数据量较大, 由调用方负责缓存。
export async function fetchProblemset(): Promise<CFProblemsetResult> {
  return cfRequest<CFProblemsetResult>('problemset.problems', {});
}

// ---- 好友博客 ----
// CF user.blogEntries 返回的单条博客原始结构(不含正文)
interface CFBlogEntry {
  id: number;
  title: string;
  authorHandle: string;
  creationTimeSeconds: number;
  commentCount?: number;
  rating?: number;
  tags?: string[];
}

/**
 * 获取某 handle 的博客/题解列表。
 * 注意: 该接口返回的是博客元信息(标题/时间/标签), 不含正文正文;
 * 正文页面同样受 Cloudflare 保护, 只能由用户在系统浏览器打开。
 * 受 2 秒限速影响, 多人时调用方应分批串行。
 */
export async function fetchBlogEntries(handle: string): Promise<import('../shared/types').BlogEntry[]> {
  const entries = await cfRequest<CFBlogEntry[]>('user.blogEntries', { handle });
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    handle: e.authorHandle ?? handle,
    creationTimeSeconds: e.creationTimeSeconds,
    commentCount: e.commentCount,
    rating: e.rating,
    tags: e.tags,
  }));
}