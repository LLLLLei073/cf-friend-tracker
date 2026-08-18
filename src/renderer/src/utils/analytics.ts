import type { CFSubmission } from '../types';

// ---- 标签统计 ----

export interface TagStat {
  tag: string;
  acCount: number;
  totalCount: number;
  passRate: number; // 0-1
}

/**
 * 从提交记录中聚合标签统计。
 * 同一题多次提交只统计一次（取最好结果：AC 优先）。
 */
export function aggregateTagStats(submissions: CFSubmission[]): TagStat[] {
  // 题目 -> 最佳 verdict（OK 优先）
  const problemBest = new Map<string, boolean>(); // true = AC
  // tag -> { ac, total }
  const tagMap = new Map<string, { ac: number; total: number }>();

  for (const sub of submissions) {
    if (!sub.problem || !sub.problem.contestId) continue;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    const isAC = sub.verdict === 'OK';

    // 如果这道题已经记录为 AC，跳过
    if (problemBest.has(key) && problemBest.get(key)) continue;
    problemBest.set(key, isAC);

    const tags = sub.problem.tags ?? [];
    if (tags.length === 0) continue;

    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, { ac: 0, total: 0 });
      }
      const stat = tagMap.get(tag)!;
      stat.total++;
      if (isAC) stat.ac++;
    }
  }

  const result: TagStat[] = [];
  for (const [tag, { ac, total }] of tagMap) {
    result.push({
      tag,
      acCount: ac,
      totalCount: total,
      passRate: total > 0 ? ac / total : 0,
    });
  }

  // 按 AC 数降序
  result.sort((a, b) => b.acCount - a.acCount);
  return result;
}

/**
 * 获取标签雷达图数据（取 AC 数最多的前 N 个标签）。
 */
export function getRadarData(stats: TagStat[], topN = 8): { tag: string; ac: number; pass: number }[] {
  return stats.slice(0, topN).map((s) => ({
    tag: s.tag,
    ac: s.acCount,
    pass: Math.round(s.passRate * 100),
  }));
}

/**
 * 识别弱项标签：AC 数 >= 3 但通过率低于阈值的标签。
 */
export function getWeakTags(stats: TagStat[], minAttempts = 3, maxPassRate = 0.4): TagStat[] {
  return stats
    .filter((s) => s.totalCount >= minAttempts && s.passRate < maxPassRate)
    .sort((a, b) => a.passRate - b.passRate);
}

// ---- 难度分布 ----

export interface DifficultyBucket {
  range: string;
  count: number;
  minRating: number;
}

/**
 * 按难度区间统计 AC 题数。
 * 区间：未标级、800-1200、1200-1400、1400-1600、1600-1900、1900-2100、2100-2400、2400+
 */
export function getDifficultyDistribution(submissions: CFSubmission[]): DifficultyBucket[] {
  const acProblems = new Map<string, number>(); // key -> rating

  for (const sub of submissions) {
    if (sub.verdict !== 'OK') continue;
    if (!sub.problem || !sub.problem.contestId) continue;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    // 只取第一次 AC
    if (!acProblems.has(key)) {
      acProblems.set(key, sub.problem.rating ?? 0);
    }
  }

  const buckets: DifficultyBucket[] = [
    { range: '未标级', count: 0, minRating: 0 },
    { range: '800-1199', count: 0, minRating: 800 },
    { range: '1200-1399', count: 0, minRating: 1200 },
    { range: '1400-1599', count: 0, minRating: 1400 },
    { range: '1600-1899', count: 0, minRating: 1600 },
    { range: '1900-2099', count: 0, minRating: 1900 },
    { range: '2100-2399', count: 0, minRating: 2100 },
    { range: '2400+', count: 0, minRating: 2400 },
  ];

  for (const rating of acProblems.values()) {
    if (rating === 0) {
      buckets[0].count++;
    } else if (rating < 1200) {
      buckets[1].count++;
    } else if (rating < 1400) {
      buckets[2].count++;
    } else if (rating < 1600) {
      buckets[3].count++;
    } else if (rating < 1900) {
      buckets[4].count++;
    } else if (rating < 2100) {
      buckets[5].count++;
    } else if (rating < 2400) {
      buckets[6].count++;
    } else {
      buckets[7].count++;
    }
  }

  return buckets;
}

// ---- 判定结果分布 ----

export interface VerdictStat {
  verdict: string;
  count: number;
  percentage: number; // 0-100
}

/**
 * 统计提交判定结果分布。
 */
export function getVerdictDistribution(submissions: CFSubmission[]): VerdictStat[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const sub of submissions) {
    const verdict = sub.verdict === 'OK' ? 'AC' : sub.verdict;
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
    total++;
  }

  if (total === 0) return [];

  const result: VerdictStat[] = [];
  for (const [verdict, count] of counts) {
    result.push({
      verdict,
      count,
      percentage: Math.round((count / total) * 100),
    });
  }

  // 按数量降序
  result.sort((a, b) => b.count - a.count);
  return result;
}

// ---- 判定结果颜色映射 ----

export function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'AC':
    case 'OK':
      return '#4A7C3A';
    case 'WRONG_ANSWER':
      return '#C41E3A';
    case 'TIME_LIMIT_EXCEEDED':
      return '#E8820C';
    case 'MEMORY_LIMIT_EXCEEDED':
      return '#E8820C';
    case 'RUNTIME_ERROR':
      return '#7B3FB5';
    case 'COMPILATION_ERROR':
      return '#3B6FE0';
    case 'SKIPPED':
      return '#ABA496';
    default:
      return '#6B655A';
  }
}

// ---- 连续做题 streak ----

/**
 * 计算连续做题天数（streak）。
 * 返回当前 streak 和最长 streak。
 */
export function calculateStreak(submissions: CFSubmission[]): { currentStreak: number; maxStreak: number } {
  const acDays = new Set<string>();

  for (const sub of submissions) {
    if (sub.verdict !== 'OK') continue;
    const date = new Date(sub.creationTimeSeconds * 1000);
    date.setHours(0, 0, 0, 0);
    acDays.add(date.toDateString());
  }

  if (acDays.size === 0) return { currentStreak: 0, maxStreak: 0 };

  // 计算当前 streak（从今天往回数）
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (acDays.has(today.toDateString())) {
    currentStreak++;
    today.setDate(today.getDate() - 1);
  }

  // 计算最长 streak
  const sortedDays = Array.from(acDays).map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime());
  let maxStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const day of sortedDays) {
    if (prevDate) {
      const diff = Math.round((day.getTime() - prevDate.getTime()) / (24 * 3600 * 1000));
      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    maxStreak = Math.max(maxStreak, tempStreak);
    prevDate = day;
  }

  return { currentStreak, maxStreak: Math.max(maxStreak, currentStreak) };
}

// ---- 月度热力图 ----
// 按年-月聚合 AC 题数, 用于训练看板的月度统计
export interface MonthlyStat {
  yearMonth: string; // YYYY-MM
  year: number;
  month: number; // 1-12
  acCount: number;
}

export function getMonthlyHeatmap(submissions: CFSubmission[]): MonthlyStat[] {
  const map = new Map<string, number>();
  for (const sub of submissions) {
    if (sub.verdict !== 'OK' || !sub.problem || !sub.problem.contestId) continue;
    const d = new Date(sub.creationTimeSeconds * 1000);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(ym, (map.get(ym) ?? 0) + 1);
  }
  // 注意: 这里按提交 AC 计数(含同一题多次AC), 用于观察活跃度;
  // 去重 AC 题数见 getUniqueAcCount
  return Array.from(map.entries())
    .map(([yearMonth, acCount]) => {
      const [y, m] = yearMonth.split('-').map(Number);
      return { yearMonth, year: y, month: m, acCount };
    })
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

// 去重 AC 题数(同一题多次AC只算一次)
export function getUniqueAcCount(submissions: CFSubmission[]): number {
  const set = new Set<string>();
  for (const sub of submissions) {
    if (sub.verdict !== 'OK' || !sub.problem || !sub.problem.contestId) continue;
    set.add(`${sub.problem.contestId}-${sub.problem.index}`);
  }
  return set.size;
}

// 按难度区间统计 AC 题数(去重), 返回适合折线图的数据: 按时间累计每档难度的 AC 数
export interface RatingGrowthPoint {
  contestName: string;
  time: number;
  rating: number;
}

// 从 ratingHistory 构造 rating 成长曲线点(已是去重的比赛序列)
export function getRatingGrowthCurve(
  ratingHistory: { contestId: number; contestName: string; ratingUpdateTimeSeconds: number; newRating: number }[],
): RatingGrowthPoint[] {
  return [...ratingHistory]
    .sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds)
    .map((r) => ({
      contestName: r.contestName,
      time: r.ratingUpdateTimeSeconds,
      rating: r.newRating,
    }));
}
