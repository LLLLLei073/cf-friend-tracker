import type { CFSubmission } from '../types';

// 无头像时的默认头像 URL
export const NO_AVATAR = 'https://userpic.codeforces.org/no-avatar.jpg';

/**
 * 返回去重的题目 key 集合(contestId-index)，可选时间过滤。
 * 仅统计 verdict 为 OK 的提交。
 */
export function getACProblemSet(
  submissions: CFSubmission[],
  sinceTimestamp?: number
): Set<string> {
  const set = new Set<string>();
  for (const s of submissions) {
    if (s.verdict !== 'OK') continue;
    if (sinceTimestamp !== undefined && s.creationTimeSeconds < sinceTimestamp) continue;
    const key = `${s.problem.contestId ?? ''}-${s.problem.index}`;
    set.add(key);
  }
  return set;
}

/**
 * 统计 AC 题数(去重 contestId+index)，可选时间过滤。
 */
export function countACProblems(
  submissions: CFSubmission[],
  sinceTimestamp?: number
): number {
  return getACProblemSet(submissions, sinceTimestamp).size;
}

/**
 * 根据排名返回奖牌 CSS 类名。
 * styles 需包含 gold / silver / bronze / normal 四个键，
 * 调用方负责将它们映射到对应 CSS 模块的类名。
 */
export function getMedalClass(index: number, styles: Record<string, string>): string {
  if (index === 0) return styles.gold ?? '';
  if (index === 1) return styles.silver ?? '';
  if (index === 2) return styles.bronze ?? '';
  return styles.normal ?? '';
}
