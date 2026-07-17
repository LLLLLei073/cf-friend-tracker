import { useEffect, useMemo, useState } from 'react';
import type { Friend, FriendCache, CFRatingChange, CFSubmission } from '../types';
import { getRankColor, getRatingColor } from '../utils/rank';
import { NO_AVATAR } from '../utils/helpers';
import { calculateStreak } from '../utils/analytics';
import styles from '../styles/feed.module.css';

const DAY = 24 * 3600;

interface ActivityEvent {
  type: 'submission' | 'rating';
  handle: string;
  alias: string;
  avatar: string;
  timestamp: number;
  // submission
  verdict?: string;
  problemName?: string;
  problemRating?: number;
  contestId?: number;
  problemIndex?: string;
  // rating
  oldRating?: number;
  newRating?: number;
  contestName?: string;
}

function formatRelativeTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} 天前`;
  const d = new Date(seconds * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isAC(verdict?: string): boolean {
  return verdict === 'OK' || verdict === 'AC';
}

export default function Feed() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [filter, setFilter] = useState<'all' | 'rating' | 'ac'>('all');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
    })();
  }, []);

  // 聚合所有好友的活动事件
  const events = useMemo<ActivityEvent[]>(() => {
    const list: ActivityEvent[] = [];

    for (const friend of friends) {
      const cache = caches[friend.handle];
      if (!cache) continue;

      const alias = friend.alias || friend.handle;
      const avatar = cache.info?.avatar || NO_AVATAR;

      // Rating 变化事件
      const ratingHistory = cache.ratingHistory ?? [];
      for (const r of ratingHistory) {
        list.push({
          type: 'rating',
          handle: friend.handle,
          alias,
          avatar,
          timestamp: r.ratingUpdateTimeSeconds,
          oldRating: r.oldRating,
          newRating: r.newRating,
          contestName: r.contestName,
        });
      }

      // 提交事件 (只取 AC)
      const submissions = cache.recentSubmissions ?? [];
      const seenProblems = new Set<string>();
      for (const s of submissions) {
        if (s.verdict !== 'OK') continue;
        const key = `${s.problem.contestId}-${s.problem.index}`;
        if (seenProblems.has(key)) continue;
        seenProblems.add(key);

        list.push({
          type: 'submission',
          handle: friend.handle,
          alias,
          avatar,
          timestamp: s.creationTimeSeconds,
          verdict: s.verdict,
          problemName: s.problem.name,
          problemRating: s.problem.rating,
          contestId: s.problem.contestId,
          problemIndex: s.problem.index,
        });
      }
    }

    // 按时间倒序
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [friends, caches]);

  // 过滤后的事件
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'rating') return events.filter((e) => e.type === 'rating');
    if (filter === 'ac') return events.filter((e) => e.type === 'submission');
    return events;
  }, [events, filter]);

  // 今日谁最卷: 今天 AC 题数最多的人
  const todayLeaders = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySec = Math.floor(todayStart.getTime() / 1000);

    const counts = new Map<string, { handle: string; alias: string; avatar: string; acCount: number; rating: number }>();

    for (const friend of friends) {
      const cache = caches[friend.handle];
      if (!cache) continue;
      const alias = friend.alias || friend.handle;
      const avatar = cache.info?.avatar || NO_AVATAR;
      const rating = cache.info?.rating ?? 0;

      const submissions = cache.recentSubmissions ?? [];
      const seenProblems = new Set<string>();
      let acCount = 0;

      for (const s of submissions) {
        if (s.verdict !== 'OK') continue;
        if (s.creationTimeSeconds < todaySec) continue;
        const key = `${s.problem.contestId}-${s.problem.index}`;
        if (seenProblems.has(key)) continue;
        seenProblems.add(key);
        acCount++;
      }

      if (acCount > 0) {
        counts.set(friend.handle, { handle: friend.handle, alias, avatar, acCount, rating });
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.acCount - a.acCount).slice(0, 5);
  }, [friends, caches]);

  // 全员 streak 统计
  const streaks = useMemo(() => {
    const list: { handle: string; alias: string; avatar: string; current: number; max: number; rating: number }[] = [];
    for (const friend of friends) {
      const cache = caches[friend.handle];
      if (!cache) continue;
      const { currentStreak, maxStreak } = calculateStreak(cache.recentSubmissions ?? []);
      if (currentStreak > 0 || maxStreak > 0) {
        list.push({
          handle: friend.handle,
          alias: friend.alias || friend.handle,
          avatar: cache.info?.avatar || NO_AVATAR,
          current: currentStreak,
          max: maxStreak,
          rating: cache.info?.rating ?? 0,
        });
      }
    }
    return list.sort((a, b) => b.current - a.current).slice(0, 8);
  }, [friends, caches]);

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>动态</h2>

      {/* 今日谁最卷 */}
      {todayLeaders.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>今日谁最卷</h3>
          <div className={styles.leaderRow}>
            {todayLeaders.map((leader, idx) => (
              <div
                key={leader.handle}
                className={styles.leaderCard}
                onClick={() => window.open(`https://codeforces.com/profile/${leader.handle}`, '_blank')}
              >
                <span className={styles.leaderRank}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                </span>
                <img src={leader.avatar} className={styles.leaderAvatar} alt={leader.handle} />
                <div className={styles.leaderInfo}>
                  <span className={styles.leaderName} style={{ color: getRatingColor(leader.rating) }}>
                    {leader.alias}
                  </span>
                  <span className={styles.leaderCount}>AC {leader.acCount} 题</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 连续做题 streak */}
      {streaks.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>连续做题 🔥</h3>
          <div className={styles.streakRow}>
            {streaks.map((s) => (
              <div
                key={s.handle}
                className={styles.streakCard}
                onClick={() => window.open(`https://codeforces.com/profile/${s.handle}`, '_blank')}
              >
                <img src={s.avatar} className={styles.streakAvatar} alt={s.handle} />
                <div className={styles.streakInfo}>
                  <span className={styles.streakName} style={{ color: getRatingColor(s.rating) }}>
                    {s.alias}
                  </span>
                  <span className={styles.streakDays}>
                    {s.current > 0 ? `🔥 ${s.current} 天` : `最长 ${s.max} 天`}
                  </span>
                </div>
                <span className={styles.streakMax}>最长 {s.max}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 活动流 */}
      <section className={styles.section}>
        <div className={styles.feedHeader}>
          <h3 className={styles.sectionTitle}>活动流</h3>
          <div className={styles.filterBtns}>
            <button
              className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'rating' ? styles.filterActive : ''}`}
              onClick={() => setFilter('rating')}
            >
              Rating
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'ac' ? styles.filterActive : ''}`}
              onClick={() => setFilter('ac')}
            >
              AC
            </button>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className={styles.empty}>暂无活动记录，刷新一下好友数据吧</div>
        ) : (
          <div className={styles.timeline}>
            {filteredEvents.slice(0, 200).map((event, idx) => (
              <div key={`${event.handle}-${event.timestamp}-${idx}`} className={styles.timelineItem}>
                <img src={event.avatar} className={styles.timelineAvatar} alt={event.handle} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <span className={styles.timelineName} style={{ color: getRatingColor(event.type === 'rating' ? event.newRating : 0) }}>
                      {event.alias}
                    </span>
                    <span className={styles.timelineTime}>{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  {event.type === 'rating' ? (
                    <div className={styles.timelineBody}>
                      <span className={styles.timelineAction}>
                        参加了 <span className={styles.contestName}>{event.contestName}</span>
                      </span>
                      <span className={styles.ratingChange}>
                        <span style={{ color: getRatingColor(event.oldRating) }}>{event.oldRating}</span>
                        <span className={styles.arrow}>→</span>
                        <span style={{ color: getRatingColor(event.newRating), fontWeight: 700 }}>
                          {event.newRating}
                        </span>
                        <span
                          className={styles.delta}
                          style={{ color: (event.newRating! - event.oldRating!) >= 0 ? 'var(--up)' : 'var(--down)' }}
                        >
                          ({(event.newRating! - event.oldRating!) >= 0 ? '+' : ''}{event.newRating! - event.oldRating!})
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className={styles.timelineBody}>
                      <span className={styles.timelineAction}>
                        AC 了{' '}
                        <a
                          href={`https://codeforces.com/contest/${event.contestId}/problem/${event.problemIndex}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.problemLink}
                        >
                          {event.problemName}
                        </a>
                        {event.problemRating && (
                          <span className={styles.problemRating} style={{ color: getRatingColor(event.problemRating) }}>
                            *{event.problemRating}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
