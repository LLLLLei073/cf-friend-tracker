import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Friend, FriendCache } from '../types';
import { getRankColor } from '../utils/rank';
import styles from '../styles/sidebar.module.css';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [refreshingHandles, setRefreshingHandles] = useState<Set<string>>(new Set());

  const loadData = async () => {
    const fr = await window.api.store.getFriends();
    setFriends(fr);
    const cacheMap = await window.api.store.getAllCache();
    setCaches(cacheMap);
  };

  useEffect(() => {
    loadData();
  }, [location.pathname]);

  // 监听刷新进度事件
  useEffect(() => {
    const unsubscribe = window.api.cf.onRefreshProgress((p) => {
      setProgress({ completed: p.completed, total: p.total });

      // 该好友完成,立即更新缓存
      if (p.handle) {
        setRefreshingHandles((prev) => {
          const next = new Set(prev);
          next.delete(p.handle!);
          return next;
        });
        window.api.store.getCache(p.handle).then((cache) => {
          if (cache) {
            setCaches((prev) => ({ ...prev, [p.handle!]: cache }));
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setProgress({ completed: 0, total: friends.length });
    // 标记所有好友为刷新中
    setRefreshingHandles(new Set(friends.map((f) => f.handle)));
    try {
      await window.api.cf.refreshAll();
      await loadData();
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
      setProgress(null);
      setRefreshingHandles(new Set());
    }
  };

  return (
    <aside className={styles.sidebar}>
      <h1 className={styles.title}>CF Friends</h1>

      <div className={styles.friendList}>
        {friends.length === 0 && (
          <p className={styles.empty}>点击下方 + 添加好友</p>
        )}
        {friends.map((f) => {
          const cache = caches[f.handle];
          const rating = cache?.info?.rating;
          const online = cache?.info
            ? Date.now() / 1000 - cache.info.lastOnlineTimeSeconds < 300
            : false;
          const isRefreshing = refreshingHandles.has(f.handle);
          return (
            <div
              key={f.handle}
              className={styles.friendItem}
              onClick={() => navigate(`/friends/${f.handle}`)}
            >
              <img
                src={cache?.info?.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                className={styles.avatar}
                alt={f.handle}
              />
              <div className={styles.info}>
                <span className={styles.handle}>{f.alias || f.handle}</span>
                {isRefreshing ? (
                  <span className={styles.loadingText}>加载中...</span>
                ) : rating !== undefined ? (
                  <span
                    className={styles.rating}
                    style={{ color: getRankColor(cache?.info?.rank) }}
                  >
                    {rating}
                  </span>
                ) : null}
              </div>
              {isRefreshing ? (
                <span className={styles.spinner} />
              ) : (
                <span className={`${styles.dot} ${online ? styles.online : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button onClick={() => navigate('/add')} className={styles.btn}>+ 添加</button>
        <button onClick={() => navigate('/leaderboard')} className={styles.btn}>🏆 排行榜</button>
        <button onClick={handleRefresh} disabled={refreshing} className={styles.btn}>
          {refreshing && progress
            ? `刷新中 ${progress.completed}/${progress.total}`
            : '↻ 刷新'}
        </button>
        <button onClick={() => navigate('/settings')} className={styles.btn}>⚙ 设置</button>
      </div>
    </aside>
  );
}
