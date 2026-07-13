import { useEffect, useState } from 'react';
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

  const loadData = async () => {
    const fr = await window.api.store.getFriends();
    setFriends(fr);
    const cacheMap = await window.api.store.getAllCache();
    setCaches(cacheMap);
  };

  useEffect(() => {
    loadData();
  }, [location.pathname]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await window.api.cf.refreshAll();
      await loadData();
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
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
                {rating !== undefined && (
                  <span
                    className={styles.rating}
                    style={{ color: getRankColor(cache?.info?.rank) }}
                  >
                    {rating}
                  </span>
                )}
              </div>
              <span className={`${styles.dot} ${online ? styles.online : ''}`} />
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button onClick={() => navigate('/add')} className={styles.btn}>+ 添加</button>
        <button onClick={handleRefresh} disabled={refreshing} className={styles.btn}>
          {refreshing ? '刷新中...' : '↻ 刷新'}
        </button>
        <button onClick={() => navigate('/settings')} className={styles.btn}>⚙ 设置</button>
      </div>
    </aside>
  );
}
