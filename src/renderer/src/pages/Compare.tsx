import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { FriendCache, CFRatingChange } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import { NO_AVATAR, countACProblems } from '../utils/helpers';
import { useAppData } from '../hooks/useAppData';
import styles from '../styles/compare.module.css';

const COLOR_A = '#F5C518';
const COLOR_B = '#3B6FE0';
const DAY = 24 * 3600;

// 平均每场 rating 变化
function avgRatingDelta(history: CFRatingChange[]): number | null {
  if (!history || history.length === 0) return null;
  let sum = 0;
  for (const h of history) sum += h.newRating - h.oldRating;
  return sum / history.length;
}

type Side = 'a' | 'b' | 'tie';

// 判断哪一侧数值更高(更高者标绿)
function betterSide(a: number | null | undefined, b: number | null | undefined): Side {
  if (a == null && b == null) return 'tie';
  if (a == null) return 'b';
  if (b == null) return 'a';
  if (a > b) return 'a';
  if (b > a) return 'b';
  return 'tie';
}

function formatNum(v: number | null | undefined): string {
  if (v == null) return '—';
  return String(v);
}

function formatDelta(v: number | null | undefined): string {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}`;
}

interface InfoCardProps {
  cache: FriendCache | null;
  loading: boolean;
  color: string;
  sideLabel: string;
}

function InfoCard({ cache, loading, color, sideLabel }: InfoCardProps) {
  if (loading) {
    return (
      <div className={styles.infoCard}>
        <div className={styles.accentStrip} style={{ background: color }} />
        <p className={styles.hint}>加载中...</p>
      </div>
    );
  }
  if (!cache) {
    return (
      <div className={styles.infoCard}>
        <div className={styles.accentStrip} style={{ background: color }} />
        <p className={styles.hint}>暂无数据,请先刷新该用户</p>
      </div>
    );
  }
  const { info } = cache;
  const rankColor = getRankColor(info.rank);
  return (
    <div className={styles.infoCard}>
      <div className={styles.accentStrip} style={{ background: color }} />
      <span className={styles.sideBadge} style={{ background: color }}>{sideLabel}</span>
      <img
        src={info.avatar || NO_AVATAR}
        className={styles.avatar}
        alt={info.handle}
      />
      <a
        href={`https://codeforces.com/profile/${info.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.handle}
        style={{ color: rankColor }}
      >
        {info.handle}
      </a>
      <p className={styles.rank} style={{ color: rankColor }}>
        {getRankLabel(info.rank)} · {info.rating ?? 'N/A'}
        <span className={styles.maxRating}>（最高 {info.maxRating ?? 'N/A'}）</span>
      </p>
      <p className={styles.meta}>{info.country || info.organization || '—'}</p>
    </div>
  );
}

interface MetricRow {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  fmt: (v: number | null | undefined) => string;
}

export default function Compare() {
  const { friends, myHandle } = useAppData();
  const [handleA, setHandleA] = useState('');
  const [handleB, setHandleB] = useState('');
  const [cacheA, setCacheA] = useState<FriendCache | null>(null);
  const [cacheB, setCacheB] = useState<FriendCache | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  // 加载 A 的缓存
  useEffect(() => {
    let cancelled = false;
    if (!handleA) {
      setCacheA(null);
      return;
    }
    setLoadingA(true);
    (async () => {
      const c = await window.api.store.getCache(handleA);
      if (!cancelled) {
        setCacheA(c ?? null);
        setLoadingA(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleA]);

  // 加载 B 的缓存
  useEffect(() => {
    let cancelled = false;
    if (!handleB) {
      setCacheB(null);
      return;
    }
    setLoadingB(true);
    (async () => {
      const c = await window.api.store.getCache(handleB);
      if (!cancelled) {
        setCacheB(c ?? null);
        setLoadingB(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleB]);

  // 下拉选项:自己 + 所有好友(去重),自己排在最前
  const options = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    if (myHandle) {
      list.push({ value: myHandle, label: `我 · ${myHandle}` });
      seen.add(myHandle);
    }
    for (const f of friends) {
      if (seen.has(f.handle)) continue;
      list.push({ value: f.handle, label: f.alias || f.handle });
      seen.add(f.handle);
    }
    return list;
  }, [friends, myHandle]);

  const bothSelected = Boolean(handleA && handleB);
  const samePerson = Boolean(handleA && handleB && handleA === handleB);

  // 合并两人 rating 历史为图表数据,以比赛序号作为 X 轴
  const chartData = useMemo(() => {
    const ra = cacheA?.ratingHistory ?? [];
    const rb = cacheB?.ratingHistory ?? [];
    const maxLen = Math.max(ra.length, rb.length);
    if (maxLen === 0) return [];
    return Array.from({ length: maxLen }, (_, i) => ({
      idx: i + 1,
      a: ra[i]?.newRating ?? null,
      b: rb[i]?.newRating ?? null,
    }));
  }, [cacheA, cacheB]);

  // 做题与比赛统计
  const statsA = useMemo(() => {
    if (!cacheA) return null;
    const subs = cacheA.recentSubmissions ?? [];
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      ac: {
        last7: countACProblems(subs, nowSec - 7 * DAY),
        last30: countACProblems(subs, nowSec - 30 * DAY),
        total: countACProblems(subs),
      },
      avgDelta: avgRatingDelta(cacheA.ratingHistory ?? []),
      contests: (cacheA.ratingHistory ?? []).length,
    };
  }, [cacheA]);

  const statsB = useMemo(() => {
    if (!cacheB) return null;
    const subs = cacheB.recentSubmissions ?? [];
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      ac: {
        last7: countACProblems(subs, nowSec - 7 * DAY),
        last30: countACProblems(subs, nowSec - 30 * DAY),
        total: countACProblems(subs),
      },
      avgDelta: avgRatingDelta(cacheB.ratingHistory ?? []),
      contests: (cacheB.ratingHistory ?? []).length,
    };
  }, [cacheB]);

  // 对比表格行
  const tableRows = useMemo<MetricRow[]>(() => {
    const infoA = cacheA?.info;
    const infoB = cacheB?.info;
    return [
      { label: '当前 Rating', a: infoA?.rating, b: infoB?.rating, fmt: formatNum },
      { label: '最高 Rating', a: infoA?.maxRating, b: infoB?.maxRating, fmt: formatNum },
      { label: '比赛场次', a: statsA?.contests, b: statsB?.contests, fmt: formatNum },
      { label: '最近7天 AC 题数', a: statsA?.ac.last7, b: statsB?.ac.last7, fmt: formatNum },
      { label: '最近30天 AC 题数', a: statsA?.ac.last30, b: statsB?.ac.last30, fmt: formatNum },
      { label: '总 AC 题数', a: statsA?.ac.total, b: statsB?.ac.total, fmt: formatNum },
      {
        label: '平均每场 Rating 变化',
        a: statsA?.avgDelta,
        b: statsB?.avgDelta,
        fmt: formatDelta,
      },
    ];
  }, [cacheA, cacheB, statsA, statsB]);

  return (
    <div>
      <h2 className={styles.heading}>好友对比</h2>

      {/* 选择好友 A / B */}
      <div className={styles.selectors}>
        <div className={styles.selectorGroup}>
          <span className={styles.selectorLabel}>
            <span className={styles.sideDot} style={{ background: COLOR_A }} />
            好友 A
          </span>
          <select
            className={styles.select}
            value={handleA}
            onChange={(e) => setHandleA(e.target.value)}
          >
            <option value="">请选择</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <span className={styles.vs}>VS</span>

        <div className={styles.selectorGroup}>
          <span className={styles.selectorLabel}>
            <span className={styles.sideDot} style={{ background: COLOR_B }} />
            好友 B
          </span>
          <select
            className={styles.select}
            value={handleB}
            onChange={(e) => setHandleB(e.target.value)}
          >
            <option value="">请选择</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!bothSelected ? (
        <p className={styles.empty}>请选择两位好友进行对比</p>
      ) : samePerson ? (
        <p className={styles.empty}>请选择两位不同的好友进行对比</p>
      ) : (
        <>
          {/* 基本信息 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>基本信息</h3>
            <div className={styles.basicInfo}>
              <InfoCard cache={cacheA} loading={loadingA} color={COLOR_A} sideLabel="A" />
              <InfoCard cache={cacheB} loading={loadingB} color={COLOR_B} sideLabel="B" />
            </div>
          </section>

          {/* Rating 历史曲线 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Rating 历史曲线</h3>
            {chartData.length === 0 ? (
              <div className={styles.chartWrap}>
                <p className={styles.hint}>暂无比赛记录</p>
              </div>
            ) : (
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
                    <CartesianGrid stroke="#E2DED4" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="idx"
                      stroke="#B0A99E"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E2DED4' }}
                      label={{
                        value: '比赛序号',
                        position: 'insideBottom',
                        offset: -2,
                        fill: '#B0A99E',
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      stroke="#B0A99E"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E2DED4' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#FDFCF8',
                        border: '1px solid #E2DED4',
                        borderRadius: '12px',
                        boxShadow:
                          '0 2px 6px rgba(60,50,30,0.05), 0 8px 20px rgba(60,50,30,0.06)',
                      }}
                      labelStyle={{ color: '#7A7268' }}
                      labelFormatter={(v) => `第 ${v} 场`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="a"
                      name={handleA}
                      stroke={COLOR_A}
                      strokeWidth={2.5}
                      dot={{ fill: COLOR_A, r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="b"
                      name={handleB}
                      stroke={COLOR_B}
                      strokeWidth={2.5}
                      dot={{ fill: COLOR_B, r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 数据对比表格 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>数据对比</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>指标</th>
                  <th className={styles.valCol}>{handleA}</th>
                  <th className={styles.valCol}>{handleB}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const side = betterSide(row.a, row.b);
                  return (
                    <tr key={row.label}>
                      <td className={styles.metricCol}>{row.label}</td>
                      <td
                        className={`${styles.valCol} ${
                          side === 'a' ? styles.higher : side === 'b' ? styles.lower : ''
                        }`}
                      >
                        {row.fmt(row.a)}
                      </td>
                      <td
                        className={`${styles.valCol} ${
                          side === 'b' ? styles.higher : side === 'a' ? styles.lower : ''
                        }`}
                      >
                        {row.fmt(row.b)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
