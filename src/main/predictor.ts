import { fetchContestStandings, fetchUserInfoSafe } from './cf-api';
import type { ContestPrediction, PredictionResult, CFRanklistRow } from '../shared/types';

/**
 * 预期的胜率: 玩家 A (rating rA) 对玩家 B (rating rB) 的胜率
 * E(A beats B) = 1 / (1 + 10^((rB - rA) / 400))
 */
function expectedWin(rA: number, rB: number): number {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * 计算种子(预期排名)。
 * seed = 1 + sum_{j != i} P(j beats i)
 * 这里 P(j beats i) = 1 - E(i beats j) = expectedWin(rj, ri)
 */
export function computeSeed(targetRating: number, allRatings: number[]): number {
  let seed = 1;
  for (const r of allRatings) {
    seed += expectedWin(r, targetRating); // P(other with rating r beats target)
  }
  return seed;
}

/**
 * 计算表现分: 找到 rating R 使得 seed(R) = actualRank。
 * 表现分表示"如果这个选手一直保持这个水平，他的 rating 应该是多少"。
 */
export function computePerformanceRating(actualRank: number, allOtherRatings: number[]): number {
  let lo = 1;
  let hi = 4000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const seed = computeSeed(mid, allOtherRatings);
    // seed 是降函数: rating 越高 → seed 越低
    if (seed > actualRank) {
      lo = mid; // 需要更高的 rating 来降低 seed
    } else {
      hi = mid; // 需要更低的 rating 来升高 seed
    }
  }
  return lo;
}

interface Participant {
  handle: string;
  rating: number;
  rank: number;
  points: number;
  penalty: number;
}

/**
 * 核心预测算法。
 * 基于 Codeforces Elo 评分系统的简化版本。
 *
 * 步骤:
 * 1. 计算每个参赛者的 seed (预期排名)
 * 2. delta = (seed - actualRank) / 2
 * 3. 根据 rating 级别限制 delta 大小
 * 4. 归一化使所有 delta 之和为 0
 * 5. 计算表现分 (binary search)
 */
function predictRatingChanges(participants: Participant[]): PredictionResult[] {
  const N = participants.length;
  if (N === 0) return [];

  // 收集所有 rating
  const allRatings = participants.map((p) => p.rating);

  // Step 1: 计算 seed
  const seeds = participants.map((p, i) => {
    const otherRatings = allRatings.filter((_, j) => j !== i);
    return computeSeed(p.rating, otherRatings);
  });

  // Step 2: 计算 delta
  const rawDeltas = participants.map((p, i) => {
    const seed = seeds[i];
    return (seed - p.rank) / 2;
  });

  // Step 3: 限制 delta 大小
  const cappedDeltas = rawDeltas.map((delta, i) => {
    const rating = participants[i].rating;
    let maxDelta: number;
    if (rating < 2100) {
      maxDelta = 300;
    } else if (rating < 2600) {
      maxDelta = 200;
    } else {
      maxDelta = 100;
    }
    return Math.max(-maxDelta, Math.min(maxDelta, delta));
  });

  // Step 4: 归一化使 delta 之和为 0
  const sumDelta = cappedDeltas.reduce((a, b) => a + b, 0);
  const avgDelta = sumDelta / N;
  const normalizedDeltas = cappedDeltas.map((d) => d - avgDelta);

  // Step 5: 计算表现分并组装结果
  return participants.map((p, i) => {
    const delta = Math.round(normalizedDeltas[i]);
    const otherRatings = allRatings.filter((_, j) => j !== i);
    const performance = computePerformanceRating(p.rank, otherRatings);

    return {
      handle: p.handle,
      rank: p.rank,
      oldRating: p.rating,
      predictedDelta: delta,
      predictedRating: Math.max(0, p.rating + delta),
      performanceRating: performance,
      points: p.points,
      penalty: p.penalty,
    };
  });
}

/**
 * 对指定比赛进行评级预测。
 * 只返回好友的预测结果。
 *
 * @param contestId 比赛 ID
 * @param friendHandles 好友 handle 列表
 */
export async function predictContest(
  contestId: number,
  contestName: string,
  friendHandles: string[]
): Promise<ContestPrediction> {
  // 1. 获取比赛 standings (仅 CONTESTANT)
  const standings = await fetchContestStandings(contestId);
  const rows = standings.rows;

  if (rows.length === 0) {
    return {
      contestId,
      contestName,
      predictions: [],
      totalParticipants: 0,
    };
  }

  // 2. 提取所有参赛者 handle
  const allHandles = rows.map((row: CFRanklistRow) => row.party.members[0]?.handle).filter(Boolean) as string[];

  // 3. 批量获取所有参赛者的当前 rating
  // 分批处理，每批 50 个 handle。fetchUserInfoSafe 内部容错:
  // 整批失败时降级为逐 handle, 单个无效 handle 不会拖垮整批(否则整批 500 人 rating 全丢)。
  const BATCH_SIZE = 50;
  const ratingMap = new Map<string, number>();

  for (let i = 0; i < allHandles.length; i += BATCH_SIZE) {
    const batch = allHandles.slice(i, i + BATCH_SIZE);
    const { infos } = await fetchUserInfoSafe(batch);
    for (const user of infos) {
      ratingMap.set(user.handle, user.rating ?? 0);
    }
  }

  // 4. 构建参赛者列表
  const participants: Participant[] = rows
    .map((row: CFRanklistRow) => {
      const handle = row.party.members[0]?.handle;
      if (!handle) return null;
      const rating = ratingMap.get(handle);
      if (rating === undefined) return null;
      return {
        handle,
        rating,
        rank: row.rank,
        points: row.points,
        penalty: row.penalty,
      };
    })
    .filter((p): p is Participant => p !== null);

  // 5. 计算预测
  const allPredictions = predictRatingChanges(participants);

  // 6. 过滤只返回好友的预测
  const friendSet = new Set(friendHandles);
  const friendPredictions = allPredictions.filter((p) => friendSet.has(p.handle));

  // 按 rank 排序
  friendPredictions.sort((a, b) => a.rank - b.rank);

  return {
    contestId,
    contestName,
    predictions: friendPredictions,
    totalParticipants: participants.length,
  };
}

/**
 * 计算某场比赛中指定 handle 的 carrotplus 单场表现分（performance）。
 *
 * 复用官方 standings（含全部参赛者的排名与题目结果）与参赛者"当前" rating，
 * 通过 Elo seed 二分法求解使 seed(rating) == rank 的 rating，即为该场表现分。
 * 注意：carrot 扩展同样使用参赛者当前 rating 近似其赛时 rating，此处保持一致。
 */
export async function computeCarrotPerformance(contestId: number, handle: string): Promise<number> {
  const standings = await fetchContestStandings(contestId);
  const rows = standings.rows;
  if (rows.length === 0) throw new Error('该比赛没有可用的官方榜单数据');

  const target = handle.toLowerCase();
  const myRow = rows.find((r) => (r.party.members[0]?.handle ?? '').toLowerCase() === target);
  if (!myRow) throw new Error('你的账号未出现在该场比赛的官方榜单中');
  const myRank = myRow.rank;

  const allHandles = rows
    .map((r) => r.party.members[0]?.handle)
    .filter((h): h is string => !!h);

  // 批量获取全部参赛者当前 rating（分批，单批失败时内部容错降级）
  const BATCH = 200;
  const ratingMap = new Map<string, number>();
  for (let i = 0; i < allHandles.length; i += BATCH) {
    const batch = allHandles.slice(i, i + BATCH);
    const { infos } = await fetchUserInfoSafe(batch);
    for (const u of infos) ratingMap.set(u.handle, u.rating ?? 0);
  }

  // 其余参赛者（排除自己）的 rating 集合
  const otherRatings: number[] = [];
  for (const h of allHandles) {
    if (h.toLowerCase() === target) continue;
    otherRatings.push(ratingMap.get(h) ?? 0);
  }
  if (otherRatings.length === 0) throw new Error('无法获取参赛者 rating');

  return computePerformanceRating(myRank, otherRatings);
}
