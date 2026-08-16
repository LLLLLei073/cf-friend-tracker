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
import { exportCSV } from '../utils/export';
import styles from '../styles/compare.module.css';

const DAY = 24 * 3600;
const MAX_COMPARE = 5;

// 多人对比的颜色板
const COLORS = ['#F5C518', '#3B6FE0', '#E8820C', '#7B3FB5', '#4A7C3A'];

// 平均每场 rating 变化
function avgRatingDelta(history: CFRatingChange[]): number | null {
  if (!history || history.length === 0) return null;
  let sum = 0;
  for (const h of history) sum += h.newRating - h.oldRating;
  return sum / history.length;
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

// 单个被对比者的缓存与统计
interface CompareEntry {
  handle: string;
  cache: FriendCache | null;
  loading: boolean;
  color: string;
}

export default function Compare() {
  const { friends, myHandle } = useAppData();
  // 选中的 handles (2-5 个)
  const [selected, setSelected] = useState<string[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache | null>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // 选中变化时加载对应缓存
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, FriendCache | null> = {};
      const loading: Record<string, boolean> = {};
      for (const h of selected) {
        loading[h] = true;
      }
      setLoadingMap((prev) => {
        const m: Record<string, boolean> = {};
        for (const h of selected) m[h] = prev[h] ?? true;
        return m;
      });
      for (const h of selected) {
        const c = await window.api.store.getCache(h);
        next[h] = c ?? null;
      }
      if (cancelled) return;
      setCaches(next);
      setLoadingMap({});
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // 下拉选项: 自己 + 所有好友(去重), 自己排在最前
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

  const toggleSelect = (handle: string) => {
    setSelected((prev) => {
      if (prev.includes(handle)) return prev.filter((h) => h !== handle);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, handle];
    });
  };

  const removeHandle = (handle: string) => {
    setSelected((prev) => prev.filter((h) => h !== handle));
  };

  // 构建被对比者列表(按选中顺序, 颜色按顺序分配)
  const entries: CompareEntry[] = selected.map((h, i) => ({
    handle: h,
    cache: caches[h] ?? null,
    loading: !!loadingMap[h],
    color: COLORS[i % COLORS.length],
  }));

  const enough = selected.length >= 2;
  const duplicates = new Set(selected).size !== selected.length ? true : false;

  // 合并所有被对比者最近 10 场 rating 历史, 按 contestId 合并, 按时间排序
  const chartData = useMemo(() => {
    const contestMap = new Map<
      number,
      { time: number; contestName: string; contestId: number; values: Record<string, number | null> }
    >();
    for (const h of selected) {
      const history = caches[h]?.ratingHistory ?? [];
      const last10 = history.slice(-10);
      for (const r of last10) {
        let entry = contestMap.get(r.contestId);
        if (!entry) {
          entry = {
            time: r.ratingUpdateTimeSeconds,
            contestName: r.contestName,
            contestId: r.contestId,
            values: {},
          };
          contestMap.set(r.contestId, entry);
        }
        entry.values[h] = r.newRating;
      }
    }
    return Array.from(contestMap.values()).sort((a, b) => a.time - b.time);
  }, [selected, caches]);

  // 每人的统计
  const statsMap = useMemo(() => {
    const m: Record<string, { ac7: number; ac30: number; acTotal: number; avgDelta: number | null; contests: number; rating?: number; maxRating?: number }> = {};
    for (const h of selected) {
      const cache = caches[h];
      if (!cache) {
        m[h] = { ac7: 0, ac30: 0, acTotal: 0, avgDelta: null, contests: 0 };
        continue;
      }
      const subs = cache.recentSubmissions ?? [];
      const nowSec = Math.floor(Date.now() / 1000);
      m[h] = {
        ac7: countACProblems(subs, nowSec - 7 * DAY),
        ac30: countACProblems(subs, nowSec - 30 * DAY),
        acTotal: countACProblems(subs),
        avgDelta: avgRatingDelta(cache.ratingHistory ?? []),
        contests: (cache.ratingHistory ?? []).length,
        rating: cache.info?.rating,
        maxRating: cache.info?.maxRating,
      };
    }
    return m;
  }, [selected, caches]);

  // 对比表格: 每行一个指标, 每列一个人
  const tableRows = useMemo(() => {
    const rows: { label: string; values: Record<string, number | null | undefined>; fmt: (v: number | null | undefined) => string }[] = [];
    const ratingRow: Record<string, number | null | undefined> = {};
    const maxRow: Record<string, number | null | undefined> = {};
    const contestRow: Record<string, number | null | undefined> = {};
    const ac7Row: Record<string, number | null | undefined> = {};
    const ac30Row: Record<string, number | null | undefined> = {};
    const acTotalRow: Record<string, number | null | undefined> = {};
    const deltaRow: Record<string, number | null | undefined> = {};
    for (const h of selected) {
      const s = statsMap[h];
      ratingRow[h] = s?.rating;
      maxRow[h] = s?.maxRating;
      contestRow[h] = s?.contests;
      ac7Row[h] = s?.ac7;
      ac30Row[h] = s?.ac30;
      acTotalRow[h] = s?.acTotal;
      deltaRow[h] = s?.avgDelta;
    }
    rows.push({ label: '当前 Rating', values: ratingRow, fmt: formatNum });
    rows.push({ label: '最高 Rating', values: maxRow, fmt: formatNum });
    rows.push({ label: '比赛场次', values: contestRow, fmt: formatNum });
    rows.push({ label: '最近7天 AC', values: ac7Row, fmt: formatNum });
    rows.push({ label: '最近30天 AC', values: ac30Row, fmt: formatNum });
    rows.push({ label: '总 AC 题数', values: acTotalRow, fmt: formatNum });
    rows.push({ label: '平均每场 Δ', values: deltaRow, fmt: formatDelta });
    return rows;
  }, [selected, statsMap]);

  // 导出对比数据为 CSV
  const handleExportCompare = () => {
    exportCSV(
      ['指标', ...selected],
      tableRows.map((row) => [row.label, ...selected.map((h) => row.fmt(row.values[h]))]),
      `对比-${selected.join('-vs-')}`,
    );
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>好友对比</h2>
        {enough && (
          <button className={styles.exportBtn} onClick={handleExportCompare}>
            导出 CSV
          </button>
        )}
      </div>

      {/* 多选对比者 */}
      <div className={styles.selectors}>
        <div className={styles.selectorGroup}>
          <span className={styles.selectorLabel}>
            选择 2–{MAX_COMPARE} 位好友对比（已选 {selected.length}/{MAX_COMPARE}）
          </span>
          <select
            className={styles.select}
            value=""
            onChange={(e) => {
              if (e.target.value) toggleSelect(e.target.value);
            }}
          >
            <option value="">添加好友...</option>
            {options
              .filter((o) => !selected.includes(o.value))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* 已选 chips */}
      {selected.length > 0 && (
        <div className={styles.basicInfo} style={{ gap: 10, marginTop: 8 }}>
          {entries.map((e) => {
            const info = e.cache?.info;
            return (
              <div key={e.handle} className={styles.infoCard} style={{ position: 'relative' }}>
                <div className={styles.accentStrip} style={{ background: e.color }} />
                {e.loading ? (
                  <p className={styles.hint}>加载中...</p>
                ) : info ? (
                  <>
                    <span className={styles.sideBadge} style={{ background: e.color }}>
                      {selected.indexOf(e.handle) + 1}
                    </span>
                    <img src={info.avatar || NO_AVATAR} className={styles.avatar} alt={info.handle} />
                    <a
                      href={`https://codeforces.com/profile/${info.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.handle}
                      style={{ color: getRankColor(info.rank) }}
                    >
                      {info.handle}
                    </a>
                    <p className={styles.rank} style={{ color: getRankColor(info.rank) }}>
                      {getRankLabel(info.rank)} · {info.rating ?? 'N/A'}
                    </p>
                  </>
                ) : (
                  <p className={styles.hint}>暂无数据, 请先刷新该用户</p>
                )}
                <button
                  className={styles.exportBtn}
                  style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', fontSize: 12 }}
                  onClick={() => removeHandle(e.handle)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!enough ? (
        <p className={styles.empty}>请至少选择两位好友进行对比</p>
      ) : duplicates ? (
        <p className={styles.empty}>请选择不同的好友进行对比</p>
      ) : (
        <>
          {/* Rating 历史曲线(多人叠加) */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Rating 历史曲线（近10场）</h3>
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
                      dataKey="time"
                      stroke="#B0A99E"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E2DED4' }}
                      tickFormatter={(v: number) => {
                        const d = new Date(v * 1000);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis stroke="#B0A99E" fontSize={11} tickLine={false} axisLine={{ stroke: '#E2DED4' }} />
                    <Tooltip
                      contentStyle={{ background: '#FDFCF8', border: '1px solid #E2DED4', borderRadius: '12px' }}
                      labelFormatter={(v: number) => {
                        const d = new Date(v * 1000);
                        return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
                      }}
                    />
                    <Legend />
                    {entries.map((e) => (
                      <Line
                        key={e.handle}
                        type="monotone"
                        dataKey={`values.${e.handle}`}
                        name={e.handle}
                        stroke={e.color}
                        strokeWidth={2.5}
                        dot={{ fill: e.color, r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 数据对比表格(每人一列) */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>数据对比</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>指标</th>
                    {entries.map((e) => (
                      <th key={e.handle} className={styles.valCol} style={{ color: e.color }}>
                        {e.handle}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    // 找出最高值, 标绿
                    const nums = selected.map((h) => row.values[h] ?? null).filter((v): v is number => v != null);
                    const maxVal = nums.length ? Math.max(...nums) : null;
                    return (
                      <tr key={row.label}>
                        <td className={styles.metricCol}>{row.label}</td>
                        {selected.map((h) => {
                          const v = row.values[h];
                          const isMax = maxVal != null && v === maxVal;
                          return (
                            <td key={h} className={`${styles.valCol} ${isMax ? styles.higher : ''}`}>
                              {row.fmt(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
