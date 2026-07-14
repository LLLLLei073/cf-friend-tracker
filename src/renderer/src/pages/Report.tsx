import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Friend, FriendCache, Settings as SettingsType, Team } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/report.module.css';

type Range = 'week' | 'month';

interface SolvedEntry {
  handle: string;
  alias: string;
  isMe: boolean;
  avatar?: string;
  rank?: string;
  acCount: number;
  dailyAvg: number;
}

interface RatingEntry {
  handle: string;
  alias: string;
  isMe: boolean;
  avatar?: string;
  rank?: string;
  oldRating: number;
  newRating: number;
  change: number;
}

interface HeatCell {
  count: number;
  intensity: number;
  dateLabel: string;
}

const DAY_SECONDS = 24 * 3600;

export default function Report() {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('week');
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [myHandle, setMyHandle] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const s: SettingsType = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
      const t = await window.api.store.getTeams();
      setTeams(t);
      if (t.length > 0) setSelectedTeamId(t[0].id);
    })();
  }, []);

  const days = range === 'week' ? 7 : 30;
  const rangeLabel = range === 'week' ? '本周' : '本月';

  // 时间范围截止(秒)
  const cutoff = useMemo(() => {
    return Math.floor(Date.now() / 1000) - days * DAY_SECONDS;
  }, [days]);

  // 日期范围显示
  const dateRangeText = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - days * DAY_SECONDS * 1000);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(start)} ~ ${fmt(end)}`;
  }, [days]);

  // 当前选中的团队成员列表
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const teamMembers = selectedTeam?.members ?? [];

  // 团队成员信息(含 isMe 标记和 alias)
  const allPeople = useMemo(() => {
    return teamMembers.map((h) => ({
      handle: h,
      alias: h === myHandle ? myHandle : (friends.find((f) => f.handle === h)?.alias || h),
      isMe: h === myHandle,
    }));
  }, [teamMembers, myHandle, friends]);

  // 做题排行(时间范围内)
  const solvedRanking = useMemo<SolvedEntry[]>(() => {
    return allPeople
      .map((p) => {
        const cache = caches[p.handle];
        const subs = cache?.recentSubmissions ?? [];
        const acProblems = new Set<string>();
        for (const s of subs) {
          if (s.verdict === 'OK' && s.creationTimeSeconds >= cutoff) {
            const key = `${s.problem.contestId ?? ''}-${s.problem.index}`;
            acProblems.add(key);
          }
        }
        return {
          handle: p.handle,
          alias: p.alias,
          isMe: p.isMe,
          avatar: cache?.info?.avatar,
          rank: cache?.info?.rank,
          acCount: acProblems.size,
          dailyAvg: acProblems.size / days,
        };
      })
      .sort((a, b) => b.acCount - a.acCount);
  }, [allPeople, caches, cutoff, days]);

  // Rating 变化排行(时间范围内)
  const ratingRanking = useMemo<RatingEntry[]>(() => {
    return allPeople
      .map((p) => {
        const cache = caches[p.handle];
        const history = cache?.ratingHistory ?? [];
        const inRange = history
          .filter((r) => r.ratingUpdateTimeSeconds >= cutoff)
          .sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds);
        if (inRange.length === 0) return null;
        const oldRating = inRange[0].oldRating;
        const newRating = inRange[inRange.length - 1].newRating;
        return {
          handle: p.handle,
          alias: p.alias,
          isMe: p.isMe,
          avatar: cache?.info?.avatar,
          rank: cache?.info?.rank,
          oldRating,
          newRating,
          change: newRating - oldRating,
        };
      })
      .filter((e): e is RatingEntry => e !== null)
      .sort((a, b) => b.change - a.change);
  }, [allPeople, caches, cutoff]);

  // 总览数据
  const summary = useMemo(() => {
    const activeHandles = new Set<string>();
    solvedRanking.forEach((e) => { if (e.acCount > 0) activeHandles.add(e.handle); });
    ratingRanking.forEach((e) => activeHandles.add(e.handle));
    const totalPeople = activeHandles.size;

    const totalAC = solvedRanking.reduce((sum, e) => sum + e.acCount, 0);

    const contestIds = new Set<number>();
    for (const p of allPeople) {
      const history = caches[p.handle]?.ratingHistory ?? [];
      for (const r of history) {
        if (r.ratingUpdateTimeSeconds >= cutoff) {
          contestIds.add(r.contestId);
        }
      }
    }
    const totalContests = contestIds.size;

    const totalChange = ratingRanking.reduce((sum, e) => sum + e.change, 0);
    const avgChange =
      ratingRanking.length > 0 ? Math.round(totalChange / ratingRanking.length) : 0;

    return { totalPeople, totalAC, totalContests, avgChange };
  }, [solvedRanking, ratingRanking, allPeople, caches, cutoff]);

  // 活跃度热力图:每天总 AC 题数(团队所有人合计,去重)
  const heatmap = useMemo<HeatCell[]>(() => {
    const buckets = new Array(days).fill(0);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayMs = startOfDay.getTime();

    for (const p of allPeople) {
      const cache = caches[p.handle];
      const subs = cache?.recentSubmissions ?? [];
      const seen = new Set<string>();
      for (const s of subs) {
        if (s.verdict === 'OK' && s.creationTimeSeconds >= cutoff) {
          const key = `${s.problem.contestId ?? ''}-${s.problem.index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const d = new Date(s.creationTimeSeconds * 1000);
          d.setHours(0, 0, 0, 0);
          const dayOffset = Math.round((d.getTime() - startOfDayMs) / (DAY_SECONDS * 1000));
          const idx = days - 1 + dayOffset;
          if (idx >= 0 && idx < days) {
            buckets[idx]++;
          }
        }
      }
    }

    const maxCount = Math.max(...buckets, 1);
    return buckets.map((count, i) => {
      const daysAgo = days - 1 - i;
      const date = new Date(startOfDayMs - daysAgo * DAY_SECONDS * 1000);
      return {
        count,
        intensity: count === 0 ? 0 : Math.max(0.2, count / maxCount),
        dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      };
    });
  }, [allPeople, caches, cutoff, days]);

  // 总结文案
  const summaryText = useMemo(() => {
    if (solvedRanking.length === 0 && ratingRanking.length === 0) {
      return `${rangeLabel}暂无活跃数据，点击左下角刷新拉取最新数据。`;
    }

    const parts: string[] = [];
    parts.push(`${rangeLabel}共 ${summary.totalPeople} 人活跃`);

    if (summary.totalAC > 0) {
      parts.push(`总做题 ${summary.totalAC} 道`);
    }

    const topSolver = solvedRanking.find((e) => e.acCount > 0);
    if (topSolver) {
      parts.push(`其中 ${topSolver.alias} 以 ${topSolver.acCount} 道题位居榜首`);
    }

    const topImprover = ratingRanking.find((e) => e.change > 0);
    if (topImprover) {
      parts.push(`${topImprover.alias} rating 提升了 ${topImprover.change} 分`);
    }

    return parts.join('，') + '。';
  }, [summary, solvedRanking, ratingRanking, rangeLabel]);

  const hasData = solvedRanking.length > 0 || ratingRanking.length > 0;

  if (teams.length === 0) {
    return (
      <div>
        <h2 className={styles.heading}>团队周报 / 月报</h2>
        <p className={styles.empty}>还没有团队，请先在「团队」页面创建团队。</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className={styles.heading}>团队周报 / 月报</h2>

      {/* 团队选择器 */}
      <div className={styles.teamSelector}>
        <label className={styles.teamLabel}>选择团队：</label>
        <select
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className={styles.teamSelect}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}（{t.members.length}人）</option>
          ))}
        </select>
      </div>

      <div className={styles.tabs}>
        <button
          className={range === 'week' ? styles.activeTab : styles.tab}
          onClick={() => setRange('week')}
        >
          周报（最近7天）
        </button>
        <button
          className={range === 'month' ? styles.activeTab : styles.tab}
          onClick={() => setRange('month')}
        >
          月报（最近30天）
        </button>
      </div>
      <p className={styles.dateRange}>{dateRangeText}</p>

      {!hasData ? (
        <p className={styles.empty}>
          {rangeLabel}暂无数据，请先刷新拉取数据。
        </p>
      ) : (
        <>
          {/* 总览卡片 */}
          <div className={styles.overview}>
            <div className={styles.overviewCard}>
              <span className={styles.overviewValue}>{summary.totalPeople}</span>
              <span className={styles.overviewLabel}>活跃人数</span>
            </div>
            <div className={styles.overviewCard}>
              <span className={styles.overviewValue}>{summary.totalAC}</span>
              <span className={styles.overviewLabel}>总 AC 题数</span>
            </div>
            <div className={styles.overviewCard}>
              <span className={styles.overviewValue}>{summary.totalContests}</span>
              <span className={styles.overviewLabel}>总比赛场次</span>
            </div>
            <div className={styles.overviewCard}>
              <span
                className={
                  summary.avgChange >= 0
                    ? `${styles.overviewValue} ${styles.up}`
                    : `${styles.overviewValue} ${styles.down}`
                }
              >
                {summary.avgChange >= 0 ? '+' : ''}
                {summary.avgChange}
              </span>
              <span className={styles.overviewLabel}>平均 Rating 变化</span>
            </div>
          </div>

          {/* 做题排行 */}
          <h3 className={styles.sectionTitle}>做题排行</h3>
          {solvedRanking.filter((e) => e.acCount > 0).length === 0 ? (
            <p className={styles.subEmpty}>{rangeLabel}暂无 AC 记录。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>排名</th>
                  <th>成员</th>
                  <th>段位</th>
                  <th className={styles.numCol}>AC 题数</th>
                  <th className={styles.numCol}>每日平均</th>
                </tr>
              </thead>
              <tbody>
                {solvedRanking.filter((e) => e.acCount > 0).map((e, i) => (
                  <tr
                    key={e.handle}
                    className={styles.row}
                    onClick={() => navigate(`/friends/${e.handle}`)}
                  >
                    <td className={styles.rankCol}>
                      <span
                        className={
                          i === 0
                            ? styles.medal1
                            : i === 1
                              ? styles.medal2
                              : i === 2
                                ? styles.medal3
                                : styles.rankNum
                        }
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                          className={styles.avatar}
                          alt={e.handle}
                        />
                        <span>{e.alias}</span>
                        {e.isMe && <span className={styles.meTag}>我</span>}
                      </div>
                    </td>
                    <td style={{ color: getRankColor(e.rank) }}>{getRankLabel(e.rank)}</td>
                    <td className={styles.numCol}>
                      <span className={styles.solvedCount}>{e.acCount}</span>
                    </td>
                    <td className={styles.numCol}>
                      <span className={styles.dailyAvg}>{e.dailyAvg.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Rating 变化排行 */}
          <h3 className={styles.sectionTitle}>Rating 变化排行</h3>
          {ratingRanking.length === 0 ? (
            <p className={styles.subEmpty}>{rangeLabel}暂无 Rating 变化记录。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>排名</th>
                  <th>成员</th>
                  <th>段位</th>
                  <th className={styles.numCol}>旧 Rating</th>
                  <th className={styles.numCol}>新 Rating</th>
                  <th className={styles.numCol}>变化</th>
                </tr>
              </thead>
              <tbody>
                {ratingRanking.map((e, i) => (
                  <tr
                    key={e.handle}
                    className={styles.row}
                    onClick={() => navigate(`/friends/${e.handle}`)}
                  >
                    <td className={styles.rankCol}>
                      <span
                        className={
                          i === 0
                            ? styles.medal1
                            : i === 1
                              ? styles.medal2
                              : i === 2
                                ? styles.medal3
                                : styles.rankNum
                        }
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                          className={styles.avatar}
                          alt={e.handle}
                        />
                        <span>{e.alias}</span>
                        {e.isMe && <span className={styles.meTag}>我</span>}
                      </div>
                    </td>
                    <td style={{ color: getRankColor(e.rank) }}>{getRankLabel(e.rank)}</td>
                    <td className={styles.numCol}>{e.oldRating}</td>
                    <td className={styles.numCol}>{e.newRating}</td>
                    <td className={styles.numCol}>
                      <span className={e.change >= 0 ? styles.up : styles.down}>
                        {e.change >= 0 ? '+' : ''}
                        {e.change}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 活跃度热力图 */}
          <h3 className={styles.sectionTitle}>活跃度热力图</h3>
          <div className={styles.heatmapCard}>
            <div className={styles.heatmap}>
              {heatmap.map((d, i) => (
                <div
                  key={i}
                  className={styles.heatCell}
                  style={{ opacity: d.count === 0 ? 0.08 : d.intensity }}
                  title={`${d.dateLabel}: ${d.count} 道`}
                />
              ))}
            </div>
            <div className={styles.heatmapFooter}>
              <div className={styles.heatmapLegend}>
                <span className={styles.heatmapLegendText}>少</span>
                <div className={styles.heatCell} style={{ opacity: 0.2 }} />
                <div className={styles.heatCell} style={{ opacity: 0.45 }} />
                <div className={styles.heatCell} style={{ opacity: 0.7 }} />
                <div className={styles.heatCell} style={{ opacity: 1 }} />
                <span className={styles.heatmapLegendText}>多</span>
              </div>
              <span className={styles.heatmapHint}>
                每个方块代表一天，颜色深浅表示当天团队合计 AC 题数
              </span>
            </div>
          </div>

          {/* 总结文案 */}
          <h3 className={styles.sectionTitle}>总结</h3>
          <div className={styles.summaryBox}>
            <p className={styles.summaryText}>{summaryText}</p>
          </div>
        </>
      )}
    </div>
  );
}
