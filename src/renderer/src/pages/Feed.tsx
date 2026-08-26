import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Friend, FriendCache, CFRatingChange, CFSubmission, CFContest, ContestPerformance, BlogEntry } from '../types';
import { getRankColor, getRatingColor } from '../utils/rank';
import { NO_AVATAR } from '../utils/helpers';
import { calculateStreak } from '../utils/analytics';
import { useNavigate } from 'react-router-dom';
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

// 动态中展示的"人": 好友 + 自己
interface Person {
  handle: string;
  alias: string;
  avatar: string;
  isMe: boolean;
  starred: boolean;
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

function formatContestDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 从比赛名称中提取类型(Div.2 / Div.1 / Educational 等)
function getContestType(name: string): string {
  const divMatch = name.match(/Div\.\s*\d+(\s*\+\s*Div\.\s*\d+)?/i);
  if (divMatch) return divMatch[0].replace(/\s+/g, ' ').trim();
  if (/Educational/i.test(name)) return 'Educational';
  if (/Global\s*Round/i.test(name)) return 'Global';
  if (/Kotlin/i.test(name)) return 'Kotlin';
  if (/Codeforces\s*Round/i.test(name)) return 'CF Round';
  return '其他';
}

export default function Feed() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [myHandle, setMyHandle] = useState('');

  // 动态页筛选偏好持久化到 localStorage, 避免切页面(组件卸载)或重启后重置
  const FEED_PREFS_KEY = 'cf-friend-tracker:feedPrefs';
  const loadFeedPrefs = (): { filter: 'all' | 'rating' | 'ac'; starredOnly: boolean; timeRange: 'all' | '3d' | '1w' } => {
    const def = { filter: 'all' as const, starredOnly: false, timeRange: 'all' as const };
    try {
      const raw = localStorage.getItem(FEED_PREFS_KEY);
      if (!raw) return def;
      const p = JSON.parse(raw);
      return {
        filter: p.filter === 'rating' || p.filter === 'ac' ? p.filter : 'all',
        starredOnly: !!p.starredOnly,
        timeRange: p.timeRange === '3d' || p.timeRange === '1w' ? p.timeRange : 'all',
      };
    } catch {
      return def;
    }
  };
  const [filter, setFilter] = useState<'all' | 'rating' | 'ac'>(() => loadFeedPrefs().filter);
  const [starredOnly, setStarredOnly] = useState(() => loadFeedPrefs().starredOnly);
  const [timeRange, setTimeRange] = useState<'all' | '3d' | '1w'>(() => loadFeedPrefs().timeRange);

  // 选择变化时写回 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FEED_PREFS_KEY, JSON.stringify({ filter, starredOnly, timeRange }));
    } catch {
      /* 忽略写入失败(如隐私模式) */
    }
  }, [filter, starredOnly, timeRange]);

  // ---- 近期已结束的比赛板块 (#4) ----
  const [recentContests, setRecentContests] = useState<CFContest[]>([]);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [expandedContestId, setExpandedContestId] = useState<number | null>(null);
  // contestId -> 每人表现(loading 态)
  const [perfMap, setPerfMap] = useState<Record<number, { data: Record<string, ContestPerformance>; loading: boolean; error: string }>>({});

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const s = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
      // 确保自己的数据已缓存, 以便动态里能展示"我"(#3)
      if (s.myHandle && !c[s.myHandle]) {
        await window.api.cf.refreshMyProfile();
        setCaches(await window.api.store.getAllCache());
      }
    })();
  }, []);

  // 全部"人"(好友 + 自己), 供动态各板块使用
  const people = useMemo<Person[]>(() => {
    const list: Person[] = [];
    if (myHandle) {
      list.push({
        handle: myHandle,
        alias: myHandle,
        avatar: caches[myHandle]?.info?.avatar || NO_AVATAR,
        isMe: true,
        starred: false,
      });
    }
    for (const f of friends) {
      if (f.handle === myHandle) continue;
      // 只看特别关注: 仅保留 starred 好友(自己始终包含)
      if (starredOnly && !f.starred) continue;
      list.push({
        handle: f.handle,
        alias: f.alias || f.handle,
        avatar: caches[f.handle]?.info?.avatar || NO_AVATAR,
        isMe: false,
        starred: !!f.starred,
      });
    }
    return list;
  }, [friends, caches, myHandle, starredOnly]);

  // 用于比赛板块: 全部好友 + 自己(不受"只看特别关注"影响)
  const allPeopleHandles = useMemo<string[]>(() => {
    const hs = new Set<string>();
    if (myHandle) hs.add(myHandle);
    for (const f of friends) if (f.handle !== myHandle) hs.add(f.handle);
    return Array.from(hs);
  }, [friends, myHandle]);

  // ---- 好友博客板块 ----
  // 受 CF 2 秒限速影响, 多人博客需串行拉取, 故用手动加载按钮触发
  const [blogs, setBlogs] = useState<BlogEntry[]>([]);
  const [blogsLoading, setBlogsLoading] = useState(false);
  const [blogsError, setBlogsError] = useState('');
  const [blogsLoaded, setBlogsLoaded] = useState(false);

  const loadBlogs = useCallback(async () => {
    setBlogsLoading(true);
    setBlogsError('');
    try {
      // 拉取全部好友 + 自己的博客(串行, 受限速)
      const handles = allPeopleHandles.slice(0, 20); // 上限 20 人, 避免拉取过久
      const data = await window.api.cf.getBlogEntries(handles);
      // 只保留近 30 天, 最多 30 条
      const cutoff = Date.now() / 1000 - 30 * 86400;
      setBlogs(data.filter((b) => b.creationTimeSeconds >= cutoff).slice(0, 30));
      setBlogsLoaded(true);
    } catch (e) {
      setBlogsError(`加载博客失败: ${(e as Error).message}`);
    } finally {
      setBlogsLoading(false);
    }
  }, [allPeopleHandles]);

  // 参与过的比赛 id 集合: 自己和好友任意一人的 ratingHistory / recentSubmissions 出现过该 contestId 即视为参与。
  // 用于"近期已结束的比赛"只展示参与过的比赛(本地判断, 无额外网络请求)。
  const participatedContestIds = useMemo(() => {
    const ids = new Set<number>();
    for (const h of allPeopleHandles) {
      const cache = caches[h];
      if (!cache) continue;
      for (const r of cache.ratingHistory ?? []) ids.add(r.contestId);
      for (const s of cache.recentSubmissions ?? []) {
        if (s.problem?.contestId) ids.add(s.problem.contestId);
      }
    }
    return ids;
  }, [allPeopleHandles, caches]);

  // 加载近期已结束比赛: 拉取一个较大的候选窗口, 再只保留"自己/好友中有人参加"的比赛
  const loadFinishedContests = useCallback(async () => {
    setContestsLoading(true);
    try {
      const data = await window.api.cf.getFinishedContests(30);
      // 只显示参与过的比赛(参与判定与展开后的表现表一致), 且仅取最近 5 场
      setRecentContests(data.filter((c) => participatedContestIds.has(c.id)).slice(0, 5));
    } catch {
      // 失败则静默(板块非核心)
    } finally {
      setContestsLoading(false);
    }
  }, [participatedContestIds]);

  useEffect(() => {
    loadFinishedContests();
  }, [loadFinishedContests]);

  // handle -> 基础信息(比赛板块用, 全部好友+自己)
  const personInfo = useMemo(() => {
    const m = new Map<string, { alias: string; avatar: string; isMe: boolean }>();
    if (myHandle) {
      m.set(myHandle, { alias: myHandle, avatar: caches[myHandle]?.info?.avatar || NO_AVATAR, isMe: true });
    }
    for (const f of friends) {
      if (f.handle === myHandle) continue;
      m.set(f.handle, { alias: f.alias || f.handle, avatar: caches[f.handle]?.info?.avatar || NO_AVATAR, isMe: false });
    }
    return m;
  }, [friends, caches, myHandle]);

  // 聚合所有"人"的活动事件
  const events = useMemo<ActivityEvent[]>(() => {
    const list: ActivityEvent[] = [];

    for (const p of people) {
      // 动态不再展示"我"自己的活动（对应需求：我的动态已迁移到复盘页的"练习时间轴"）
      if (p.isMe) continue;
      const cache = caches[p.handle];
      if (!cache) continue;

      // Rating 变化事件
      const ratingHistory = cache.ratingHistory ?? [];
      for (const r of ratingHistory) {
        list.push({
          type: 'rating',
          handle: p.handle,
          alias: p.alias,
          avatar: p.avatar,
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
        if (!s.problem) continue;
        const key = `${s.problem.contestId}-${s.problem.index}`;
        if (seenProblems.has(key)) continue;
        seenProblems.add(key);

        list.push({
          type: 'submission',
          handle: p.handle,
          alias: p.alias,
          avatar: p.avatar,
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
  }, [people, caches]);

  // 过滤后的事件: 类型筛选 + 时间窗筛选
  const filteredEvents = useMemo(() => {
    let list = events;
    if (filter === 'rating') list = list.filter((e) => e.type === 'rating');
    else if (filter === 'ac') list = list.filter((e) => e.type === 'submission');

    if (timeRange !== 'all') {
      const days = timeRange === '3d' ? 3 : 7;
      const cutoff = Date.now() / 1000 - days * 86400;
      list = list.filter((e) => e.timestamp >= cutoff);
    }
    return list;
  }, [events, filter, timeRange]);

  // 今日谁最卷: 今天 AC 题数最多的人
  const todayLeaders = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySec = Math.floor(todayStart.getTime() / 1000);

    const counts = new Map<string, { handle: string; alias: string; avatar: string; acCount: number; rating: number }>();

    for (const p of people) {
      const cache = caches[p.handle];
      if (!cache) continue;

      const submissions = cache.recentSubmissions ?? [];
      const seenProblems = new Set<string>();
      let acCount = 0;

      for (const s of submissions) {
        if (s.verdict !== 'OK') continue;
        if (s.creationTimeSeconds < todaySec) continue;
        if (!s.problem) continue;
        const key = `${s.problem.contestId}-${s.problem.index}`;
        if (seenProblems.has(key)) continue;
        seenProblems.add(key);
        acCount++;
      }

      if (acCount > 0) {
        counts.set(p.handle, { handle: p.handle, alias: p.alias, avatar: p.avatar, acCount, rating: cache.info?.rating ?? 0 });
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.acCount - a.acCount).slice(0, 5);
  }, [people, caches]);

  // 全员 streak 统计
  const streaks = useMemo(() => {
    const list: { handle: string; alias: string; avatar: string; current: number; max: number; rating: number }[] = [];
    for (const p of people) {
      const cache = caches[p.handle];
      if (!cache) continue;
      const { currentStreak, maxStreak } = calculateStreak(cache.recentSubmissions ?? []);
      if (currentStreak > 0 || maxStreak > 0) {
        list.push({
          handle: p.handle,
          alias: p.alias,
          avatar: p.avatar,
          current: currentStreak,
          max: maxStreak,
          rating: cache.info?.rating ?? 0,
        });
      }
    }
    return list.sort((a, b) => b.current - a.current).slice(0, 8);
  }, [people, caches]);

  // 点击比赛: 展开 / 收起, 首次展开拉取表现数据
  const toggleContest = async (contest: CFContest) => {
    if (expandedContestId === contest.id) {
      setExpandedContestId(null);
      return;
    }
    setExpandedContestId(contest.id);
    if (!perfMap[contest.id]) {
      setPerfMap((prev) => ({ ...prev, [contest.id]: { data: {}, loading: true, error: '' } }));
      try {
        const data = await window.api.cf.getContestPerformance(contest.id, allPeopleHandles);
        setPerfMap((prev) => ({ ...prev, [contest.id]: { data, loading: false, error: '' } }));
      } catch (e) {
        setPerfMap((prev) => ({
          ...prev,
          [contest.id]: { data: {}, loading: false, error: (e as Error).message },
        }));
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>动态</h2>
        <label className={styles.starFilter} title="仅显示标记为特别关注的好友(自己始终显示)">
          <input
            type="checkbox"
            checked={starredOnly}
            onChange={(e) => setStarredOnly(e.target.checked)}
          />
          ⭐ 只看特别关注
        </label>
      </div>

      {/* 近期已结束的比赛 (#4) */}
      {(recentContests.length > 0 || contestsLoading) && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            近期已结束的比赛
            <span className={styles.sectionHint}>（仅显示你与好友参加过的）</span>
          </h3>
          {contestsLoading ? (
            <div className={styles.contestLoading}>加载中...</div>
          ) : (
            <div className={styles.contestList}>
              {recentContests.map((c) => {
                const expanded = expandedContestId === c.id;
                const perf = perfMap[c.id];
                return (
                  <div key={c.id} className={styles.contestItem}>
                    <div
                      className={styles.contestHead}
                      onClick={() => toggleContest(c)}
                    >
                      <div className={styles.contestHeadLeft}>
                        <span className={styles.contestName} title={c.name}>{c.name}</span>
                        <span className={styles.contestType}>{getContestType(c.name)}</span>
                      </div>
                      <div className={styles.contestHeadRight}>
                        <span className={styles.contestDate}>{formatContestDate(c.startTimeSeconds)}</span>
                        <span className={styles.contestCaret}>{expanded ? '▼' : '▶'}</span>
                      </div>
                    </div>

                    {expanded && (
                      <div className={styles.contestBody}>
                        <a
                          className={styles.contestLink}
                          href={`https://codeforces.com/contest/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          在 Codeforces 查看比赛 →
                        </a>
                        {perf?.loading && <div className={styles.contestLoading}>查询当场成绩中...</div>}
                        {perf?.error && <div className={styles.contestError}>查询失败: {perf.error}</div>}
                        {perf && !perf.loading && !perf.error && (
                          <ContestPerfTable
                            contest={c}
                            handles={allPeopleHandles}
                            personInfo={personInfo}
                            ratingHistoryByHandle={buildRatingHistoryMap(allPeopleHandles, caches)}
                            perf={perf.data}
                            onOpenProfile={(h) => navigate(`/friends/${h}`)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 好友博客/题解 */}
      <section className={styles.section}>
        <div className={styles.feedHeader}>
          <h3 className={styles.sectionTitle}>
            好友博客
            <span className={styles.sectionHint}>（近 30 天，点击打开原页）</span>
          </h3>
          <button
            className={styles.filterBtn}
            onClick={loadBlogs}
            disabled={blogsLoading || allPeopleHandles.length === 0}
          >
            {blogsLoading ? '拉取中...' : blogsLoaded ? '刷新' : '加载博客'}
          </button>
        </div>
        {blogsError && <div className={styles.contestError}>{blogsError}</div>}
        {blogsLoaded && blogs.length === 0 && !blogsError && (
          <div className={styles.empty}>近 30 天没有好友发布博客</div>
        )}
        {blogs.length > 0 && (
          <div className={styles.timeline}>
            {blogs.map((b) => {
              const info = personInfo.get(b.handle);
              return (
                <div key={b.id} className={styles.timelineItem}>
                  <img src={info?.avatar || NO_AVATAR} className={styles.timelineAvatar} alt={b.handle} />
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineHeader}>
                      <span className={styles.timelineName}>{info?.alias || b.handle}</span>
                      <span className={styles.timelineTime}>{formatRelativeTime(b.creationTimeSeconds)}</span>
                    </div>
                    <div className={styles.timelineBody}>
                      <span className={styles.timelineAction}>
                        发布了{' '}
                        <a
                          href={`https://codeforces.com/blog/entry/${b.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.problemLink}
                        >
                          {b.title}
                        </a>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 今日谁最卷 */}
      {todayLeaders.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>今日谁最卷</h3>
          <div className={styles.leaderRow}>
            {todayLeaders.map((leader, idx) => (
              <div
                key={leader.handle}
                className={styles.leaderCard}
                onClick={() => window.api.app.openExternal(`https://codeforces.com/profile/${leader.handle}`)}
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
                onClick={() => window.api.app.openExternal(`https://codeforces.com/profile/${s.handle}`)}
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
          <div className={styles.feedFilters}>
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
            <div className={styles.filterBtns}>
              <button
                className={`${styles.filterBtn} ${timeRange === 'all' ? styles.filterActive : ''}`}
                onClick={() => setTimeRange('all')}
              >
                全部时间
              </button>
              <button
                className={`${styles.filterBtn} ${timeRange === '3d' ? styles.filterActive : ''}`}
                onClick={() => setTimeRange('3d')}
              >
                近 3 天
              </button>
              <button
                className={`${styles.filterBtn} ${timeRange === '1w' ? styles.filterActive : ''}`}
                onClick={() => setTimeRange('1w')}
              >
                近一周
              </button>
            </div>
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

// 构建 handle -> ratingHistory 的映射(用于比赛板块查评级变化)
function buildRatingHistoryMap(
  handles: string[],
  caches: Record<string, FriendCache>,
): Record<string, CFRatingChange[]> {
  const m: Record<string, CFRatingChange[]> = {};
  for (const h of handles) {
    m[h] = caches[h]?.ratingHistory ?? [];
  }
  return m;
}

// 单场比赛的表现表格(好友 + 自己)
function ContestPerfTable({
  contest,
  handles,
  personInfo,
  ratingHistoryByHandle,
  perf,
  onOpenProfile,
}: {
  contest: CFContest;
  handles: string[];
  personInfo: Map<string, { alias: string; avatar: string; isMe: boolean }>;
  ratingHistoryByHandle: Record<string, CFRatingChange[]>;
  perf: Record<string, ContestPerformance>;
  onOpenProfile: (handle: string) => void;
}) {
  const rows = handles
    .map((handle) => {
      const info = personInfo.get(handle)!;
      const rc = ratingHistoryByHandle[handle]?.find((r) => r.contestId === contest.id);
      const p = perf[handle];
      const participated = !!rc || !!p;
      const ac = p?.acCount;
      const rank = p?.rank;
      const delta = rc ? rc.newRating - rc.oldRating : undefined;
      return { handle, info, rc, ac, rank, delta, participated };
    })
    // 只显示参加了这场比赛的人(按 AC 降序、无 AC 的按排名升序)
    .filter((r) => r.participated)
    .sort((a, b) => {
      if ((a.ac ?? -1) !== (b.ac ?? -1)) return (b.ac ?? -1) - (a.ac ?? -1);
      return (a.rank ?? Infinity) - (b.rank ?? Infinity);
    });

  if (rows.length === 0) {
    return <div className={styles.contestEmpty}>好友与自己均未参加这场比赛</div>;
  }

  return (
    <table className={styles.perfTable}>
      <thead>
        <tr>
          <th>成员</th>
          <th>AC 题数</th>
          <th>排名</th>
          <th>Rating 变化</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.handle}
            className={styles.perfRow}
            onClick={() => onOpenProfile(r.handle)}
          >
            <td>
              <div className={styles.perfMember}>
                <img src={r.info.avatar} className={styles.perfAvatar} alt={r.handle} />
                <span className={styles.perfName}>
                  {r.info.alias}
                  {r.info.isMe && <span className={styles.meBadge}>我</span>}
                </span>
              </div>
            </td>
            <td className={styles.perfNum}>{r.ac ?? '—'}</td>
            <td className={styles.perfNum}>{r.rank ?? '—'}</td>
            <td>
              {r.rc ? (
                <span className={styles.ratingChange}>
                  <span style={{ color: getRatingColor(r.rc.oldRating) }}>{r.rc.oldRating}</span>
                  <span className={styles.arrow}>→</span>
                  <span style={{ color: getRatingColor(r.rc.newRating), fontWeight: 700 }}>
                    {r.rc.newRating}
                  </span>
                  <span
                    className={styles.delta}
                    style={{ color: r.delta! >= 0 ? 'var(--up)' : 'var(--down)' }}
                  >
                    ({r.delta! >= 0 ? '+' : ''}{r.delta})
                  </span>
                </span>
              ) : (
                <span className={styles.perfNone}>—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
