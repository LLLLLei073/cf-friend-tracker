import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CFSubmission, ReviewState, ReviewProblem, ProblemListItem } from '../../types';
import { useToast } from '../../components/Toast';
import { callApi } from '../../utils/safe-call';
import { getRatingColor } from '../../utils/rank';
import styles from '../../styles/review.module.css';

interface Props {
  submissions: CFSubmission[];
  myRating: number;
  reviewState: ReviewState;
  onChanged: () => void;
  onAddToReview: (p: {
    contestId: number;
    index: string;
    name?: string;
    rating?: number;
    tags?: string[];
    source: ReviewProblem['source'];
  }) => Promise<void>;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 从提交历史中找出"尝试过但未 AC"的题（薄弱点）
function buildWeak(submissions: CFSubmission[]): ReviewProblem[] {
  const byKey = new Map<string, CFSubmission[]>();
  for (const s of submissions) {
    const p = s.problem;
    if (!p?.contestId || !p.index) continue;
    const key = `${p.contestId}_${p.index}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(s);
  }
  const weak: ReviewProblem[] = [];
  for (const [key, list] of byKey) {
    const solved = list.some((s) => s.verdict === 'OK');
    if (solved) continue;
    const [cid, idx] = key.split('_');
    const problem = list[0].problem;
    weak.push({
      contestId: Number(cid),
      index: idx,
      name: problem.name,
      rating: problem.rating,
      tags: problem.tags,
      source: 'daily',
      addedAt: Date.now(),
    });
  }
  // 尝试次数多的优先（更值得补）
  weak.sort((a, b) => {
    const ca = byKey.get(`${a.contestId}_${a.index}`)?.length ?? 0;
    const cb = byKey.get(`${b.contestId}_${b.index}`)?.length ?? 0;
    return cb - ca;
  });
  return weak.slice(0, 15);
}

// 从全量题池中挑选"略高于当前 rating、且覆盖薄弱标签"的题（提升）
function buildImprove(
  problems: ProblemListItem[],
  solvedSet: Set<string>,
  weakTags: string[],
  myRating: number,
): ReviewProblem[] {
  const lo = myRating + 100;
  const hi = myRating + 250;
  const tagSet = new Set(weakTags);
  const candidates = problems.filter((p) => {
    if (p.rating === undefined) return false;
    if (p.rating < lo || p.rating > hi) return false;
    const key = `${p.contestId}_${p.index}`;
    if (solvedSet.has(key)) return false;
    if (tagSet.size > 0 && !(p.tags ?? []).some((t) => tagSet.has(t))) return false;
    return true;
  });
  candidates.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
  return candidates.slice(0, 15).map((p) => ({
    contestId: p.contestId,
    index: p.index,
    name: p.name,
    rating: p.rating,
    tags: p.tags,
    source: 'daily' as const,
    addedAt: Date.now(),
  }));
}

export default function DailyPractice({
  submissions,
  myRating,
  reviewState,
  onChanged,
  onAddToReview,
}: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);

  const daily = reviewState.daily;
  const isToday = daily?.date === todayStr();

  // 已 AC 题集合（用于排除提升题单里已会的）
  const solvedSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) {
      if (s.verdict === 'OK' && s.problem?.contestId && s.problem?.index) {
        set.add(`${s.problem.contestId}_${s.problem.index}`);
      }
    }
    return set;
  }, [submissions]);

  // 薄弱标签（取尝试未通过题中出现最多的标签，用于窄化提升题单）
  const weakTags = useMemo(() => {
    const all = daily?.weak ?? buildWeak(submissions);
    const count = new Map<string, number>();
    for (const p of all) for (const t of p.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);
  }, [daily, submissions]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const weak = buildWeak(submissions);
      const problems = await callApi<ProblemListItem[]>(window.api.problem.getList(), toast, {
        errorMsg: '获取题池失败',
      });
      if (problems === null) {
        setGenerating(false);
        return;
      }
      const tags = (() => {
        const count = new Map<string, number>();
        for (const p of weak) for (const t of p.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
        return Array.from(count.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([t]) => t);
      })();
      const improve = buildImprove(problems, solvedSet, tags, myRating);
      const res = await callApi(
        window.api.review.setDaily({ date: todayStr(), weak, improve }),
        toast,
        { successMsg: '已生成本日练习' },
      );
      if (res !== null) onChanged();
    } finally {
      setGenerating(false);
    }
  }, [submissions, solvedSet, myRating, toast, onChanged]);

  return (
    <div>
      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{myRating}</div>
          <div className={styles.statLabel}>我的当前 Rating</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{daily?.weak.length ?? 0}</div>
          <div className={styles.statLabel}>薄弱题单</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{daily?.improve.length ?? 0}</div>
          <div className={styles.statLabel}>提升题单</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <button className={styles.btn + ' ' + styles.btnPrimary} onClick={generate} disabled={generating}>
          {generating ? '生成中…' : isToday ? '重新生成今日练习' : '生成今日练习'}
        </button>
        <span className={styles.sectionHint}>
          薄弱题单 = 我尝试过但未 AC 的题；提升题单 = 略高于当前 rating 且覆盖薄弱标签的题
        </span>
      </div>

      {!daily && !generating && (
        <div className={styles.empty}>还没有生成本日练习，点击上方按钮基于你的提交历史生成。</div>
      )}

      {daily && (
        <>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              薄弱题单 <span className={styles.sectionHint}>（{daily.weak.length}）</span>
            </h4>
            {daily.weak.length === 0 ? (
              <div className={styles.empty} style={{ padding: 10 }}>
                暂无尝试未通过的题，继续保持！
              </div>
            ) : (
              <PracticeList
                items={daily.weak}
                badgeText="薄弱"
                badgeClass={styles.otherBadge}
                onOpen={(p) => navigate(`/problems/${p.contestId}/${p.index}`)}
                onAdd={(p) => onAddToReview({ ...p, source: 'daily' })}
              />
            )}
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              提升题单 <span className={styles.sectionHint}>（{daily.improve.length}）</span>
            </h4>
            {daily.improve.length === 0 ? (
              <div className={styles.empty} style={{ padding: 10 }}>
                当前暂无匹配的提升题（可能题池未加载或已覆盖）。
              </div>
            ) : (
              <PracticeList
                items={daily.improve}
                badgeText="提升"
                badgeClass={styles.upsolveBadge}
                onOpen={(p) => navigate(`/problems/${p.contestId}/${p.index}`)}
                onAdd={(p) => onAddToReview({ ...p, source: 'daily' })}
              />
            )}
          </div>

          {weakTags.length > 0 && (
            <div className={styles.probMeta} style={{ marginTop: 4 }}>
              <span className={styles.sectionHint}>薄弱标签：</span>
              {weakTags.map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PracticeList({
  items,
  badgeText,
  badgeClass,
  onOpen,
  onAdd,
}: {
  items: ReviewProblem[];
  badgeText: string;
  badgeClass: string;
  onOpen: (p: ReviewProblem) => void;
  onAdd: (p: ReviewProblem) => void;
}) {
  return (
    <div className={styles.libList}>
      {items.map((p) => (
        <div key={`${p.contestId}_${p.index}`} className={styles.libItem}>
          <div className={styles.libMain}>
            <div className={styles.libTitleRow}>
              <span className={styles.probIndex}>{p.index}</span>
              <span className={styles.libName}>{p.name ?? `${p.contestId}${p.index}`}</span>
              {p.rating !== undefined && (
                <span className={styles.probRating} style={{ color: getRatingColor(p.rating) }}>
                  *{p.rating}
                </span>
              )}
              <span className={`${styles.badge} ${badgeClass}`}>{badgeText}</span>
            </div>
            <div className={styles.probMeta}>
              {(p.tags ?? []).map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className={styles.btn + ' ' + styles.btnSm} onClick={() => onOpen(p)}>
              打开
            </button>
            <button
              className={styles.btn + ' ' + styles.btnSm + ' ' + styles.btnPrimary}
              onClick={() => onAdd(p)}
            >
              加入复习库
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
