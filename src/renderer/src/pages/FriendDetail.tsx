import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FriendCache, CFProblem } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import RatingChart from '../components/RatingChart';
import ContestTable from '../components/ContestTable';
import styles from '../styles/friendDetail.module.css';

function formatRelativeTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

// --- Heatmap helpers ---

interface HeatmapDay {
  date: Date;
  dateStr: string;
  count: number;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getHeatLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

// --- Recommendation helpers ---

function getRatingColor(rating?: number): string {
  if (!rating) return '#9CA3AF';
  if (rating < 1200) return '#9CA3AF';
  if (rating < 1400) return '#2BA82B';
  if (rating < 1600) return '#03A89E';
  if (rating < 1900) return '#3B6FE0';
  if (rating < 2100) return '#9333EA';
  if (rating < 2300) return '#E8820C';
  if (rating < 2400) return '#E8820C';
  if (rating < 2600) return '#E5383B';
  return '#C4181D';
}

interface RecommendedProblem {
  contestId: number;
  index: string;
  name: string;
  rating?: number;
  tags?: string[];
}

type RecStatus = 'loading' | 'ready' | 'no-handle' | 'no-cache' | 'empty';

export default function FriendDetail() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [cache, setCache] = useState<FriendCache | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Recommendation state
  const [recommendations, setRecommendations] = useState<RecommendedProblem[]>([]);
  const [recStatus, setRecStatus] = useState<RecStatus>('loading');

  // 滚动导航
  const [activeSection, setActiveSection] = useState('rating');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const navItems = [
    { id: 'rating', label: 'Rating 曲线' },
    { id: 'contests', label: '最近比赛' },
    { id: 'heatmap', label: '做题热力图' },
    { id: 'recommend', label: '题目推荐' },
    { id: 'submissions', label: '最近提交' },
  ];

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  }, []);

  // 监听滚动，高亮当前模块
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const handleScroll = () => {
      const scrollTop = main.scrollTop;
      // 找到当前可视区域的 section
      let current = 'rating';
      for (const item of navItems) {
        const el = sectionRefs.current[item.id];
        if (el) {
          const offsetTop = el.offsetTop - main.offsetTop;
          if (scrollTop >= offsetTop - 100) {
            current = item.id;
          }
        }
      }
      setActiveSection(current);
    };
    main.addEventListener('scroll', handleScroll);
    return () => main.removeEventListener('scroll', handleScroll);
  }, [cache]);

  useEffect(() => {
    (async () => {
      if (!handle) return;
      setLoading(true);
      try {
        // 先从缓存读取
        const c = await window.api.store.getCache(handle);
        setCache(c);
        // 再从 API 获取最新数据
        const [info, ratingHistory, recentSubmissions] = await Promise.all([
          window.api.cf.getUserInfo([handle]),
          window.api.cf.getUserRating(handle),
          window.api.cf.getUserStatus(handle, 50),
        ]);
        const newCache: FriendCache = {
          handle,
          info: info[0],
          ratingHistory,
          recentSubmissions,
          cachedAt: Date.now(),
        };
        setCache(newCache);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  // --- Compute heatmap data from friend's submissions ---
  const heatmapData = useMemo<HeatmapDay[]>(() => {
    if (!cache?.recentSubmissions) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Build daily unique AC problem sets
    const dailyProblems = new Map<string, Set<string>>();

    for (const sub of cache.recentSubmissions) {
      if (sub.verdict !== 'OK') continue;
      if (!sub.problem.contestId) continue;

      const date = new Date(sub.creationTimeSeconds * 1000);
      date.setHours(0, 0, 0, 0);
      const dateStr = toDateStr(date);
      const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;

      if (!dailyProblems.has(dateStr)) {
        dailyProblems.set(dateStr, new Set());
      }
      dailyProblems.get(dateStr)!.add(problemKey);
    }

    // Generate last 90 days
    const days: HeatmapDay[] = [];
    for (let i = 89; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = toDateStr(date);
      const count = dailyProblems.get(dateStr)?.size ?? 0;
      days.push({ date, dateStr, count });
    }

    return days;
  }, [cache]);

  // Arrange heatmap days into weeks (columns of 7), with leading padding
  const heatmapWeeks = useMemo<(HeatmapDay | null)[][]>(() => {
    if (heatmapData.length === 0) return [];
    const firstDayOfWeek = heatmapData[0].date.getDay(); // 0 = Sunday
    const padded: (HeatmapDay | null)[] = [
      ...Array(firstDayOfWeek).fill(null),
      ...heatmapData,
    ];
    while (padded.length % 7 !== 0) {
      padded.push(null);
    }
    const weeks: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }
    return weeks;
  }, [heatmapData]);

  // --- Load recommendations when cache is available ---
  useEffect(() => {
    if (!cache?.recentSubmissions) return;

    // Extract friend's AC problems
    const friendAC = new Map<string, CFProblem>();
    for (const sub of cache.recentSubmissions) {
      if (sub.verdict !== 'OK') continue;
      if (!sub.problem.contestId) continue;
      const key = `${sub.problem.contestId}-${sub.problem.index}`;
      if (!friendAC.has(key)) {
        friendAC.set(key, sub.problem);
      }
    }

    let cancelled = false;

    (async () => {
      try {
        const settings = await window.api.store.getSettings();
        if (cancelled) return;

        if (!settings?.myHandle) {
          setRecStatus('no-handle');
          setRecommendations([]);
          return;
        }

        const myCache = await window.api.store.getCache(settings.myHandle);
        if (cancelled) return;

        if (!myCache?.recentSubmissions) {
          setRecStatus('no-cache');
          setRecommendations([]);
          return;
        }

        // Extract my AC problems
        const myAC = new Set<string>();
        for (const sub of myCache.recentSubmissions) {
          if (sub.verdict === 'OK' && sub.problem.contestId) {
            myAC.add(`${sub.problem.contestId}-${sub.problem.index}`);
          }
        }

        // Find problems friend did but I didn't
        const myRating = myCache.info?.rating ?? 1500;
        const candidates: RecommendedProblem[] = [];
        for (const [, problem] of friendAC) {
          const key = `${problem.contestId}-${problem.index}`;
          if (myAC.has(key)) continue;
          candidates.push({
            contestId: problem.contestId!,
            index: problem.index,
            name: problem.name,
            rating: problem.rating,
            tags: problem.tags,
          });
        }

        // Sort by proximity to my rating (closest first)
        candidates.sort((a, b) => {
          const diffA = Math.abs((a.rating ?? 1500) - myRating);
          const diffB = Math.abs((b.rating ?? 1500) - myRating);
          return diffA - diffB;
        });

        const top = candidates.slice(0, 10);
        if (cancelled) return;
        setRecommendations(top);
        setRecStatus(top.length === 0 ? 'empty' : 'ready');
      } catch {
        if (!cancelled) {
          setRecStatus('no-cache');
          setRecommendations([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cache]);

  if (loading && !cache) {
    return <p style={{ color: '#ABA496' }}>加载中...</p>;
  }

  if (error && !cache) {
    return (
      <div>
        <p style={{ color: '#C41E3A', marginBottom: 12 }}>错误: {error}</p>
        <button
          onClick={() => navigate('/friends')}
          style={{ padding: '8px 16px', background: '#FFFEF9', border: '1px solid #C9C1AE', color: '#2C2A26', borderRadius: 10, cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 2px rgba(60,50,30,0.05)' }}
        >
          返回列表
        </button>
      </div>
    );
  }

  if (!cache) {
    return <p style={{ color: '#ABA496' }}>未找到数据</p>;
  }

  const { info, ratingHistory, recentSubmissions, cachedAt } = cache;
  const online = Date.now() / 1000 - info.lastOnlineTimeSeconds < 300;

  return (
    <div className={styles.detailLayout}>
      <div className={styles.detailContent}>
      <div className={styles.header}>
        <img src={info.avatar} className={styles.avatar} alt={info.handle} />
        <div className={styles.headerInfo}>
          <h2 className={styles.handle}>
            <a
              href={`https://codeforces.com/profile/${info.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.profileLink}
            >
              {info.handle}
            </a>
          </h2>
          {info.organization && <p className={styles.org}>{info.organization}</p>}
          <p className={styles.rank} style={{ color: getRankColor(info.rank) }}>
            {getRankLabel(info.rank)} · {info.rating ?? 'N/A'}
            <span className={styles.maxRating}>
              (最高 {info.maxRating ?? 'N/A'})
            </span>
          </p>
          <p className={styles.status}>
            <span className={`${styles.dot} ${online ? styles.online : ''}`} />
            {online ? '在线' : `最近在线: ${formatRelativeTime(info.lastOnlineTimeSeconds)}`}
          </p>
          <p className={styles.cacheTime}>数据更新于: {new Date(cachedAt).toLocaleString()}</p>
        </div>
      </div>

      <section className={styles.section} ref={(el) => { sectionRefs.current['rating'] = el; }}>
        <h3 className={styles.sectionTitle}>Rating 曲线</h3>
        <RatingChart data={ratingHistory} />
      </section>

      <section className={styles.section} ref={(el) => { sectionRefs.current['contests'] = el; }}>
        <h3 className={styles.sectionTitle}>最近比赛</h3>
        <ContestTable data={ratingHistory} />
      </section>

      {/* 做题热力图 */}
      <section className={styles.section} ref={(el) => { sectionRefs.current['heatmap'] = el; }}>
        <h3 className={styles.sectionTitle}>最近90天做题热力图</h3>
        <div className={styles.heatmapWrap}>
          <div className={styles.heatmapBody}>
            <div className={styles.heatmapWeekdays}>
              <span />
              <span>一</span>
              <span />
              <span>三</span>
              <span />
              <span>五</span>
              <span />
            </div>
            <div className={styles.heatmapGrid}>
              {heatmapWeeks.map((week, wi) => (
                <div key={wi} className={styles.heatmapWeek}>
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`${styles.heatmapCell} ${styles[`heatLevel${day ? getHeatLevel(day.count) : 0}`]}`}
                      title={day ? `${day.dateStr}：${day.count} 题` : ''}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.heatmapLegend}>
            <span className={styles.legendText}>少</span>
            <div className={`${styles.heatmapCell} ${styles.heatLevel0}`} />
            <div className={`${styles.heatmapCell} ${styles.heatLevel1}`} />
            <div className={`${styles.heatmapCell} ${styles.heatLevel2}`} />
            <div className={`${styles.heatmapCell} ${styles.heatLevel3}`} />
            <span className={styles.legendText}>多</span>
          </div>
        </div>
      </section>

      {/* 题目推荐 */}
      <section className={styles.section} ref={(el) => { sectionRefs.current['recommend'] = el; }}>
        <h3 className={styles.sectionTitle}>你可能感兴趣的题目</h3>
        {recStatus === 'no-handle' && (
          <p className={styles.emptyText}>设置自己的 handle 后可获取推荐</p>
        )}
        {recStatus === 'no-cache' && (
          <p className={styles.emptyText}>暂无自己的提交记录，请先刷新自己的数据</p>
        )}
        {recStatus === 'empty' && (
          <p className={styles.emptyText}>没有可推荐的题目，你已完成好友做过的所有题目</p>
        )}
        {recStatus === 'loading' && (
          <p className={styles.emptyText}>推荐加载中...</p>
        )}
        {recStatus === 'ready' && recommendations.length > 0 && (
          <div className={styles.recommendations}>
            {recommendations.map((p, idx) => (
              <a
                key={`${p.contestId}-${p.index}-${idx}`}
                href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.recCard}
              >
                <div className={styles.recHeader}>
                  <span className={styles.recProblemName}>
                    {p.contestId}{p.index} - {p.name}
                  </span>
                  {p.rating && (
                    <span
                      className={styles.recRating}
                      style={{ color: getRatingColor(p.rating) }}
                    >
                      {p.rating}
                    </span>
                  )}
                </div>
                {p.tags && p.tags.length > 0 && (
                  <div className={styles.recTags}>
                    {p.tags.slice(0, 4).map((tag, ti) => (
                      <span key={ti} className={styles.recTag}>{tag}</span>
                    ))}
                    {p.tags.length > 4 && (
                      <span className={styles.recTag}>+{p.tags.length - 4}</span>
                    )}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} ref={(el) => { sectionRefs.current['submissions'] = el; }}>
        <h3 className={styles.sectionTitle}>最近提交</h3>
        {recentSubmissions.length === 0 ? (
          <p className={styles.emptyText}>暂无提交记录</p>
        ) : (
          <div className={styles.submissions}>
            {recentSubmissions.slice(0, 20).map((s) => (
              <div key={s.id} className={styles.submission}>
                <span
                  className={`${styles.verdict} ${
                    s.verdict === 'OK' ? styles.ac : styles.notAc
                  }`}
                >
                  {s.verdict === 'OK' ? 'AC' : s.verdict}
                </span>
                <span className={styles.problem}>
                  <a
                    href={`https://codeforces.com/problemset/problem/${s.problem.contestId}/${s.problem.index}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.problemLink}
                  >
                    {s.problem.contestId}{s.problem.index} - {s.problem.name}
                  </a>
                </span>
                <span className={styles.lang}>{s.language}</span>
                <span className={styles.time}>
                  {new Date(s.creationTimeSeconds * 1000).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* 右侧导航栏 */}
      <nav className={styles.sideNav}>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`${styles.sideNavItem} ${activeSection === item.id ? styles.sideNavActive : ''}`}
            onClick={() => scrollToSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
