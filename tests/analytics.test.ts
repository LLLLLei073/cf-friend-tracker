import { describe, it, expect } from 'vitest';
import type { CFSubmission } from '../src/shared/types';
import {
  aggregateTagStats,
  getDifficultyDistribution,
  getVerdictDistribution,
  calculateStreak,
  getUniqueAcCount,
} from '../src/renderer/src/utils/analytics';

// 构造一条"缺 problem"的提交（历史版本缓存/接口异常时可能出现），
// 用于回归验证：这类脏数据不应让统计函数抛错（否则会冒泡到 ErrorBoundary -> "应用出错"）。
function missingProblemSubmission(): CFSubmission {
  return {
    id: 1,
    creationTimeSeconds: 1700000000,
    // @ts-expect-error 故意制造缺 problem 的脏数据
    problem: undefined,
    verdict: 'OK',
  } as unknown as CFSubmission;
}

function validSubmission(over: Partial<CFSubmission> = {}): CFSubmission {
  return {
    id: 2,
    creationTimeSeconds: 1700000100,
    problem: { contestId: 1234, index: 'A', name: 'Test', rating: 800, tags: ['greedy'] },
    verdict: 'OK',
    ...over,
  };
}

describe('analytics 对缺 problem 的脏数据应健壮', () => {
  it('aggregateTagStats 遇到缺 problem 的提交不抛错，并跳过它', () => {
    const subs = [missingProblemSubmission(), validSubmission()];
    expect(() => aggregateTagStats(subs)).not.toThrow();
    const stats = aggregateTagStats(subs);
    // 只有 valid 那条参与统计
    expect(stats.some((s) => s.tag === 'greedy')).toBe(true);
  });

  it('getDifficultyDistribution 遇到缺 problem 不抛错', () => {
    const subs = [missingProblemSubmission(), validSubmission()];
    expect(() => getDifficultyDistribution(subs)).not.toThrow();
  });

  it('getVerdictDistribution 遇到缺 problem 不抛错', () => {
    const subs = [missingProblemSubmission(), validSubmission({ verdict: 'WRONG_ANSWER' })];
    expect(() => getVerdictDistribution(subs)).not.toThrow();
    const dist = getVerdictDistribution(subs);
    expect(dist.length).toBeGreaterThan(0);
  });

  it('calculateStreak 遇到缺 problem 不抛错', () => {
    const subs = [missingProblemSubmission(), validSubmission()];
    expect(() => calculateStreak(subs)).not.toThrow();
  });

  it('getUniqueAcCount 遇到缺 problem 不抛错', () => {
    const subs = [missingProblemSubmission(), validSubmission()];
    expect(() => getUniqueAcCount(subs)).not.toThrow();
  });
});
