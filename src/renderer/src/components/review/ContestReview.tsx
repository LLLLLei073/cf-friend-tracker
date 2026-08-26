import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  CFRatingChange,
  CFSubmission,
  CFContest,
  ContestReviewRecord,
  ContestProblemResult,
  PerformanceCache,
  ReviewProblem,
} from '../../types';
import { useToast } from '../../components/Toast';
import { callApi } from '../../utils/safe-call';
import { getRatingColor } from '../../utils/rank';
import { parseContestLevel, parseSpecialType, LEVEL_OPTIONS, SPECIAL_OPTIONS } from '../../utils/contest-classify';
import styles from '../../styles/review.module.css';

interface Props {
  ratingHistory: CFRatingChange[];
  contestMap: Map<number, CFContest>;
  submissions: CFSubmission[];
  performanceCache: PerformanceCache;
  onAddToReview: (p: {
    contestId: number;
    index: string;
    name?: string;
    rating?: number;
    tags?: string[];
    source: ReviewProblem['source'];
  }) => Promise<void>;
}

function fmtDate(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 从我的提交中拆解出某场比赛的"赛内通过 / 赛后补题 / 尝试未通过"
function buildContestProblems(
  contestId: number,
  submissions: CFSubmission[],
  startSec: number,
  durationSec: number,
): ContestProblemResult[] {
  const end = startSec + durationSec;
  // 匹配"该比赛内的提交": 必须用顶层 s.contestId (即本次提交所在的比赛 id),
  // 不能用 s.problem.contestId (那是该题在 problemset 的归属比赛 id, 重用旧题/problemset 题会指向其它比赛或缺失)。
  const subs = submissions.filter((s) => s.contestId === contestId);
  const byIndex = new Map<string, CFSubmission[]>();
  for (const s of subs) {
    const idx = s.problem.index;
    if (!byIndex.has(idx)) byIndex.set(idx, []);
    byIndex.get(idx)!.push(s);
  }
  const result: ContestProblemResult[] = [];
  for (const [index, list] of byIndex) {
    list.sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);
    const acSubs = list.filter((s) => s.verdict === 'OK');
    const solved = acSubs.length > 0;
    const firstAc = solved ? acSubs[0].creationTimeSeconds : undefined;
    const inContest = solved ? firstAc! <= end : false;
    const problem = list[0].problem;
    result.push({
      contestId,
      index,
      name: problem.name,
      rating: problem.rating,
      tags: problem.tags,
      solved,
      inContest,
      firstAcTime: firstAc,
      attempts: list.length,
      bestVerdict: list[list.length - 1].verdict,
    });
  }
  result.sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? -1 : 1;
    if (a.inContest !== b.inContest) return a.inContest ? -1 : 1;
    return a.index.localeCompare(b.index);
  });
  return result;
}

export default function ContestReview({
  ratingHistory,
  contestMap,
  submissions,
  performanceCache,
  onAddToReview,
}: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [specialFilter, setSpecialFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [perf, setPerf] = useState<Record<number, number>>(performanceCache);
  const [perfLoading, setPerfLoading] = useState<Set<number>>(new Set());

  // 构建有效参赛记录（仅正式评级赛，源自 ratingHistory）
  const records = useMemo<ContestReviewRecord[]>(() => {
    return ratingHistory
      .map((rc): ContestReviewRecord | null => {
        const c = contestMap.get(rc.contestId);
        const startTimeSeconds = c?.startTimeSeconds ?? rc.ratingUpdateTimeSeconds - 7200;
        const durationSeconds = c?.durationSeconds ?? 7200;
        return {
          contestId: rc.contestId,
          contestName: rc.contestName,
          startTimeSeconds,
          durationSeconds,
          rank: rc.rank,
          oldRating: rc.oldRating,
          newRating: rc.newRating,
          ratingUpdateTimeSeconds: rc.ratingUpdateTimeSeconds,
          level: parseContestLevel(rc.contestName),
          special: parseSpecialType(rc.contestName),
        };
      })
      .filter((r): r is ContestReviewRecord => r !== null)
      .sort((a, b) => b.ratingUpdateTimeSeconds - a.ratingUpdateTimeSeconds);
  }, [ratingHistory, contestMap]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (levelFilter !== 'all' && r.level !== levelFilter) return false;
      if (specialFilter !== 'all' && r.special !== specialFilter) return false;
      return true;
    });
  }, [records, levelFilter, specialFilter]);

  // 同步父级传入的缓存（父级刷新后）
  useMemo(() => {
    setPerf((prev) => ({ ...performanceCache, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performanceCache]);

  const toggle = (id: number) => setExpandedId((prev) => (prev === id ? null : id));

  const computePerf = useCallback(
    async (contestId: number) => {
      if (perfLoading.has(contestId) || perf[contestId] !== undefined) return;
      setPerfLoading((prev) => new Set(prev).add(contestId));
      const value = await callApi(window.api.cf.computePerformance(contestId), toast, {
        errorMsg: '计算表现分失败',
      });
      setPerfLoading((prev) => {
        const next = new Set(prev);
        next.delete(contestId);
        return next;
      });
      if (value !== null) setPerf((prev) => ({ ...prev, [contestId]: value }));
    },
    [perf, perfLoading, toast],
  );

  if (records.length === 0) {
    return <div className={styles.empty}>暂无有效参赛记录（需要先在设置里填写你的 CF handle 并刷新）。</div>;
  }

  return (
    <div>
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>比赛级别</span>
        <select
          className={styles.select}
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <option value="all">全部</option>
          {LEVEL_OPTIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className={styles.filterLabel}>特殊赛事类型</span>
        <select
          className={styles.select}
          value={specialFilter}
          onChange={(e) => setSpecialFilter(e.target.value)}
        >
          <option value="all">全部</option>
          {SPECIAL_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className={styles.sectionHint}>
          共 {filtered.length} / {records.length} 场
        </span>
      </div>

      <div className={styles.recordList}>
        {filtered.map((r) => {
          const expanded = expandedId === r.contestId;
          const delta = r.newRating - r.oldRating;
          const probs = expanded
            ? buildContestProblems(r.contestId, submissions, r.startTimeSeconds, r.durationSeconds)
            : [];
          const inContest = probs.filter((p) => p.solved && p.inContest);
          const upsolved = probs.filter((p) => p.solved && !p.inContest);
          const failed = probs.filter((p) => !p.solved);
          const perfVal = perf[r.contestId];
          const loading = perfLoading.has(r.contestId);
          return (
            <div key={r.contestId} className={styles.recordItem}>
              <div className={styles.recordHead} onClick={() => toggle(r.contestId)}>
                <div className={styles.recordLeft}>
                  <span className={styles.recordName} title={r.contestName}>
                    {r.contestName}
                  </span>
                  <div className={styles.recordMeta}>
                    <span className={styles.badge + ' ' + styles.levelBadge}>{r.level}</span>
                    {r.special !== 'Other' && (
                      <span className={styles.badge + ' ' + styles.specialBadge}>{r.special}</span>
                    )}
                    <span>{fmtDate(r.ratingUpdateTimeSeconds)}</span>
                  </div>
                </div>
                <div className={styles.recordRight}>
                  <span className={styles.recordRank}>#{r.rank}</span>
                  <span className={styles.ratingChange}>
                    <span style={{ color: getRatingColor(r.oldRating) }}>{r.oldRating}</span>
                    <span className={styles.arrow}>→</span>
                    <span style={{ color: getRatingColor(r.newRating), fontWeight: 700 }}>
                      {r.newRating}
                    </span>
                    <span
                      className={styles.delta}
                      style={{ color: delta >= 0 ? 'var(--up)' : 'var(--down)' }}
                    >
                      ({delta >= 0 ? '+' : ''}
                      {delta})
                    </span>
                  </span>
                  <span className={styles.caret}>{expanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {expanded && (
                <div className={styles.recordBody}>
                  <div className={styles.perfRow}>
                    <span className={styles.perfLabel}>carrotplus 单场表现分：</span>
                    {perfVal !== undefined ? (
                      <span className={styles.perfValue}>{Math.round(perfVal)}</span>
                    ) : (
                      <button
                        className={styles.perfBtn}
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          computePerf(r.contestId);
                        }}
                      >
                        {loading ? '计算中…' : '计算表现分'}
                      </button>
                    )}
                    <span className={styles.sectionHint}>（基于官方 standings + 参赛者 rating 的 Elo seed）</span>
                  </div>

                  <Section title={`赛内通过（${inContest.length}）`}>
                    {inContest.length === 0 ? (
                      <Empty text="比赛期间无 AC 记录" />
                    ) : (
                      inContest.map((p) => (
                        <ProblemRow
                          key={p.index}
                          p={p}
                          badge={styles.inContestBadge}
                          badgeText="赛内"
                          onAdd={() =>
                            onAddToReview({
                              contestId: p.contestId,
                              index: p.index,
                              name: p.name,
                              rating: p.rating,
                              tags: p.tags,
                              source: 'contest-upsolve',
                            })
                          }
                          onOpen={() => navigate(`/problems/${p.contestId}/${p.index}`)}
                        />
                      ))
                    )}
                  </Section>

                  <Section title={`赛后补题（${upsolved.length}）`}>
                    {upsolved.length === 0 ? (
                      <Empty text="没有赛后补题记录" />
                    ) : (
                      upsolved.map((p) => (
                        <ProblemRow
                          key={p.index}
                          p={p}
                          badge={styles.upsolveBadge}
                          badgeText="补题"
                          onAdd={() =>
                            onAddToReview({
                              contestId: p.contestId,
                              index: p.index,
                              name: p.name,
                              rating: p.rating,
                              tags: p.tags,
                              source: 'contest-upsolve',
                            })
                          }
                          onOpen={() => navigate(`/problems/${p.contestId}/${p.index}`)}
                        />
                      ))
                    )}
                  </Section>

                  {failed.length > 0 && (
                    <Section title={`尝试未通过（${failed.length}）`}>
                      {failed.map((p) => (
                        <ProblemRow
                          key={p.index}
                          p={p}
                          badge={styles.otherBadge}
                          badgeText="未通过"
                          onAdd={() =>
                            onAddToReview({
                              contestId: p.contestId,
                              index: p.index,
                              name: p.name,
                              rating: p.rating,
                              tags: p.tags,
                              source: 'contest-upsolve',
                            })
                          }
                          onOpen={() => navigate(`/problems/${p.contestId}/${p.index}`)}
                        />
                      ))}
                    </Section>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={styles.empty} style={{ padding: '10px' }}>{text}</div>;
}

function ProblemRow({
  p,
  badge,
  badgeText,
  onAdd,
  onOpen,
}: {
  p: ContestProblemResult;
  badge: string;
  badgeText: string;
  onAdd: () => void;
  onOpen: () => void;
}) {
  return (
    <div className={styles.problemRow}>
      <span className={styles.probIndex}>{p.index}</span>
      <span className={styles.probName} title={p.name}>
        {p.name}
      </span>
      {p.rating !== undefined && (
        <span className={styles.probRating} style={{ color: getRatingColor(p.rating) }}>
          *{p.rating}
        </span>
      )}
      <span className={`${styles.badge} ${badge}`}>{badgeText}</span>
      <span className={styles.sectionHint}>尝试 {p.attempts} 次</span>
      <span className={styles.spacer} />
      <button className={styles.btn + ' ' + styles.btnSm} onClick={onOpen}>
        打开
      </button>
      <button className={styles.btn + ' ' + styles.btnSm + ' ' + styles.btnPrimary} onClick={onAdd}>
        加入复习库
      </button>
      <div className={styles.probMeta}>
        {(p.tags ?? []).map((t) => (
          <span key={t} className={styles.tag}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
