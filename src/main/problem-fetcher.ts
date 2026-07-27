import { fetchProblemset, fetchContestProblems } from './cf-api';
import { getProblemList, setProblemList, getStatement, isListFresh } from './problem-store';
import type { ProblemListItem, ProblemStatement } from '../shared/types';

// 单场比赛题目清单的内存缓存（避免每次搜索都请求 CF）
const CONTEST_LIST_TTL_MS = 24 * 3600 * 1000;
const contestListCache = new Map<number, { list: ProblemListItem[]; cachedAt: number }>();

// 把 problemset.problems 的返回映射为浏览用的轻量列表, 并合并通过人数
async function mapProblemList(): Promise<ProblemListItem[]> {
  const data = await fetchProblemset();
  const statMap = new Map<string, number>();
  for (const s of data.problemStatistics) {
    if (s.contestId !== undefined) {
      statMap.set(`${s.contestId}_${s.index}`, s.solvedCount);
    }
  }
  return data.problems.map((p) => ({
    contestId: p.contestId ?? 0,
    index: p.index,
    name: p.name,
    rating: p.rating,
    tags: p.tags ?? [],
    type: p.type,
    solvedCount: p.contestId !== undefined ? statMap.get(`${p.contestId}_${p.index}`) : undefined,
  }));
}

// 获取题面: Codeforces 对页面域（contest/.../problem/...）启用了 Cloudflare 反爬,
// 应用内（Electron 内置浏览器 / Node 网络栈）均无法通过验证, 只有用户本机浏览器能正常打开。
// 因此题面只从本地缓存读取; 没有缓存时抛出 OPEN_BROWSER 信号, 由渲染进程改用系统浏览器打开原题。
export async function fetchProblemStatement(
  contestId: number,
  index: string,
): Promise<ProblemStatement> {
  const cached = getStatement(contestId, index);
  if (cached) return cached;
  throw new Error('OPEN_BROWSER');
}

// 获取题目列表: 优先返回本地缓存（未过期）, 否则拉取并缓存
export async function fetchProblemList(force = false): Promise<ProblemListItem[]> {
  if (!force && isListFresh()) {
    const cached = getProblemList();
    if (cached) return cached.list;
  }
  const list = await mapProblemList();
  setProblemList(list);
  return list;
}

// 强制刷新题目列表
export async function refreshProblemList(): Promise<ProblemListItem[]> {
  return fetchProblemList(true);
}

// 获取单场比赛的题目清单（按比赛顺序 A, B, C...）。
// 优先返回内存缓存（未过期），否则从 CF 拉取并缓存。force 时忽略缓存重新拉取。
export async function fetchContestProblemList(
  contestId: number,
  force = false,
): Promise<ProblemListItem[]> {
  if (!force) {
    const cached = contestListCache.get(contestId);
    if (cached && Date.now() - cached.cachedAt < CONTEST_LIST_TTL_MS) {
      return cached.list;
    }
  }
  const list = await fetchContestProblems(contestId);
  contestListCache.set(contestId, { list, cachedAt: Date.now() });
  return list;
}
