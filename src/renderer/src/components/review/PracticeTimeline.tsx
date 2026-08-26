import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CFSubmission, ReviewProblem } from '../../types';
import { useToast } from '../../components/Toast';
import { getRatingColor } from '../../utils/rank';
import styles from '../../styles/review.module.css';

interface Props {
  submissions: CFSubmission[];
  onAddToReview: (p: {
    contestId: number;
    index: string;
    name?: string;
    rating?: number;
    tags?: string[];
    source: ReviewProblem['source'];
  }) => Promise<void>;
}

interface TimelineEntry {
  contestId: number;
  index: string;
  name: string;
  rating?: number;
  tags?: string[];
  firstAcTime: number;
  subs: CFSubmission[];
}

function fmtDateTime(sec: number): string {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PracticeTimeline({ submissions, onAddToReview }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = useMemo<TimelineEntry[]>(() => {
    const byKey = new Map<string, CFSubmission[]>();
    for (const s of submissions) {
      const p = s.problem;
      if (!p?.contestId || !p.index) continue;
      const key = `${p.contestId}_${p.index}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(s);
    }
    const list: TimelineEntry[] = [];
    for (const [key, subs] of byKey) {
      subs.sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);
      const ac = subs.filter((s) => s.verdict === 'OK');
      if (ac.length === 0) continue; // 时间轴只展示已 AC 的题目
      const [cid, idx] = key.split('_');
      const problem = subs[0].problem;
      list.push({
        contestId: Number(cid),
        index: idx,
        name: problem.name,
        rating: problem.rating,
        tags: problem.tags,
        firstAcTime: ac[0].creationTimeSeconds,
        subs,
      });
    }
    list.sort((a, b) => b.firstAcTime - a.firstAcTime);
    return list;
  }, [submissions]);

  if (submissions.length === 0) {
    return <div className={styles.empty}>还没有可展示的提交记录（需要先刷新你的数据）。</div>;
  }

  return (
    <div>
      <p className={styles.subtitle}>
        按首次 AC 时间排序，展示你近期 AC 的题目、标签与难度；点击展开查看该题的全部提交记录。
      </p>
      {entries.length === 0 ? (
        <div className={styles.empty}>没有已 AC 的题目记录。</div>
      ) : (
        <div className={styles.timeline}>
          {entries.map((e) => {
            const key = `${e.contestId}_${e.index}`;
            const open = expanded === key;
            const acCount = e.subs.filter((s) => s.verdict === 'OK').length;
            return (
              <div key={key} className={styles.tItem}>
                <div className={styles.tHead} onClick={() => setExpanded(open ? null : key)}>
                  <span className={styles.tDate}>{fmtDateTime(e.firstAcTime)}</span>
                  <div className={styles.tMeta}>
                    <span className={styles.probIndex}>{e.index}</span>
                    <span className={styles.libName}>{e.name}</span>
                    {e.rating !== undefined && (
                      <span className={styles.probRating} style={{ color: getRatingColor(e.rating) }}>
                        *{e.rating}
                      </span>
                    )}
                    {(e.tags ?? []).slice(0, 5).map((t) => (
                      <span key={t} className={styles.tag}>
                        {t}
                      </span>
                    ))}
                    <span className={styles.sectionHint}>AC {acCount} 次</span>
                  </div>
                  <span className={styles.caret}>{open ? '▼' : '▶'}</span>
                </div>
                {open && (
                  <div className={styles.tBody}>
                    <div className={styles.toolbar}>
                      <button
                        className={styles.btn + ' ' + styles.btnSm}
                        onClick={() => navigate(`/problems/${e.contestId}/${e.index}`)}
                      >
                        在刷题页打开
                      </button>
                      <button
                        className={styles.btn + ' ' + styles.btnSm + ' ' + styles.btnPrimary}
                        onClick={() =>
                          onAddToReview({
                            contestId: e.contestId,
                            index: e.index,
                            name: e.name,
                            rating: e.rating,
                            tags: e.tags,
                            source: 'timeline',
                          })
                        }
                      >
                        加入复习库
                      </button>
                    </div>
                    {e.subs.map((s) => (
                      <div key={s.id} className={styles.subRow}>
                        <span
                          className={`${styles.verdict} ${s.verdict === 'OK' ? styles.verdictOk : styles.verdictFail}`}
                        >
                          {s.verdict}
                        </span>
                        <span className={styles.subTime}>{fmtDateTime(s.creationTimeSeconds)}</span>
                        <span className={styles.subLang}>{s.programmingLanguage}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
