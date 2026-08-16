import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CFSubmission, CFRatingChange } from '../types';
import {
  aggregateTagStats,
  getRadarData,
  getWeakTags,
  getDifficultyDistribution,
  getVerdictDistribution,
  getVerdictColor,
  calculateStreak,
  getMonthlyHeatmap,
  getUniqueAcCount,
  getRatingGrowthCurve,
} from '../utils/analytics';
import { getRatingColor } from '../utils/rank';
import { translateTag } from '../utils/tagLabels';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import styles from '../styles/training.module.css';

export default function Training() {
  const navigate = useNavigate();
  const [myHandle, setMyHandle] = useState('');
  const [submissions, setSubmissions] = useState<CFSubmission[]>([]);
  const [ratingHistory, setRatingHistory] = useState<CFRatingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const settings = await window.api.store.getSettings();
        if (!settings.myHandle) {
          setError('请先在设置中填写你的 CF Handle。');
          return;
        }
        setMyHandle(settings.myHandle);
        // 拉取较多提交用于深度分析(默认 1000 条)
        const [subs, rating] = await Promise.all([
          window.api.cf.getSubmissions(settings.myHandle, 1000),
          window.api.cf.getUserRating(settings.myHandle),
        ]);
        setSubmissions(subs);
        setRatingHistory(rating ?? []);
      } catch (e) {
        setError(`加载失败: ${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => aggregateTagStats(submissions), [submissions]);
  const radarData = useMemo(() => getRadarData(stats, 8), [stats]);
  const weakTags = useMemo(() => getWeakTags(stats), [stats]);
  const diffBuckets = useMemo(() => getDifficultyDistribution(submissions), [submissions]);
  const verdicts = useMemo(() => getVerdictDistribution(submissions), [submissions]);
  const streak = useMemo(() => calculateStreak(submissions), [submissions]);
  const monthly = useMemo(() => getMonthlyHeatmap(submissions), [submissions]);
  const uniqueAc = useMemo(() => getUniqueAcCount(submissions), [submissions]);
  const growth = useMemo(() => getRatingGrowthCurve(ratingHistory), [ratingHistory]);

  if (loading) return <p className={styles.loading}>正在拉取训练数据（最多 1000 条提交）...</p>;
  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>{error}</p>
        <button className={styles.linkBtn} onClick={() => navigate('/settings')}>
          去设置
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>训练看板 · {myHandle}</h2>

      {/* 顶部统计卡片 */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{uniqueAc}</div>
          <div className={styles.statLabel}>去重 AC 题数</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{streak.currentStreak}</div>
          <div className={styles.statLabel}>当前连续(天)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{streak.maxStreak}</div>
          <div className={styles.statLabel}>最长连续(天)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{ratingHistory.length}</div>
          <div className={styles.statLabel}>参加比赛</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: getRatingColor(ratingHistory.at(-1)?.newRating) }}>
            {ratingHistory.at(-1)?.newRating ?? '—'}
          </div>
          <div className={styles.statLabel}>当前 Rating</div>
        </div>
      </div>

      {/* Rating 成长曲线 */}
      {growth.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Rating 成长曲线</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-line)" />
              <XAxis dataKey="contestName" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={(l) => `比赛: ${l}`}
                formatter={(v: number) => [v, 'Rating']}
              />
              <Line type="monotone" dataKey="rating" stroke="#3B6FE0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 月度活跃度热力图(条形图近似) */}
      {monthly.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>月度 AC 活跃度</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-line)" />
              <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v: number) => [v, 'AC 提交数']} />
              <Bar dataKey="acCount" fill="#4A7C3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={styles.twoCol}>
        {/* 标签雷达图 */}
        {radarData.length > 0 && (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>标签 AC 雷达(前 8)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--rule-line)" />
                <PolarAngleAxis dataKey="tag" tick={{ fontSize: 11 }} />
                <Radar dataKey="ac" stroke="#3B6FE0" fill="#3B6FE0" fillOpacity={0.4} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 判定结果饼图 */}
        {verdicts.length > 0 && (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>判定结果分布</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={verdicts}
                  dataKey="count"
                  nameKey="verdict"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => `${e.verdict} ${e.percentage}%`}
                  labelLine={false}
                >
                  {verdicts.map((v) => (
                    <Cell key={v.verdict} fill={getVerdictColor(v.verdict)} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 难度分布 */}
      {diffBuckets.some((b) => b.count > 0) && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>AC 难度分布</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={diffBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-line)" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v: number) => [v, 'AC 题数']} />
              <Bar dataKey="count" fill="#E8820C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 弱项清单 */}
      {weakTags.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>弱项知识点(尝试≥3 且通过率&lt;40%)</h3>
          <div className={styles.weakList}>
            {weakTags.map((w) => (
              <div key={w.tag} className={styles.weakItem}>
                <span className={styles.weakTag}>{translateTag(w.tag)}</span>
                <span className={styles.weakMeta}>
                  AC {w.acCount}/{w.totalCount} · 通过率 {Math.round(w.passRate * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {submissions.length === 0 && (
        <p className={styles.empty}>暂无提交记录，无法生成训练分析。</p>
      )}
    </div>
  );
}
