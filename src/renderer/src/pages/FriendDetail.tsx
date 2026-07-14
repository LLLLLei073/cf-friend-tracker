import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FriendCache } from '../types';
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

export default function FriendDetail() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [cache, setCache] = useState<FriendCache | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading && !cache) {
    return <p style={{ color: '#B0A99E' }}>加载中...</p>;
  }

  if (error && !cache) {
    return (
      <div>
        <p style={{ color: '#D9402F', marginBottom: 12 }}>错误: {error}</p>
        <button
          onClick={() => navigate('/friends')}
          style={{ padding: '8px 16px', background: '#FDFCF8', border: '1px solid #D0CABE', color: '#3A352B', borderRadius: 12, cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 2px rgba(60,50,30,0.04)' }}
        >
          返回列表
        </button>
      </div>
    );
  }

  if (!cache) {
    return <p style={{ color: '#B0A99E' }}>未找到数据</p>;
  }

  const { info, ratingHistory, recentSubmissions, cachedAt } = cache;
  const online = Date.now() / 1000 - info.lastOnlineTimeSeconds < 300;

  return (
    <div>
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

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Rating 曲线</h3>
        <RatingChart data={ratingHistory} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>最近比赛</h3>
        <ContestTable data={ratingHistory} />
      </section>

      <section className={styles.section}>
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
  );
}
