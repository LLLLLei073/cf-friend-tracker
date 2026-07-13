import { useEffect, useState, useMemo } from 'react';
import type { Friend, FriendCache } from '../types';
import FriendRow from '../components/FriendRow';
import styles from '../styles/friendList.module.css';

type SortKey = 'rating' | 'handle' | 'online';

export default function FriendList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = friends.filter(
      (f) =>
        f.handle.toLowerCase().includes(search.toLowerCase()) ||
        f.alias.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const ca = caches[a.handle];
      const cb = caches[b.handle];
      if (sortKey === 'rating') {
        return (cb?.info?.rating ?? 0) - (ca?.info?.rating ?? 0);
      }
      if (sortKey === 'handle') {
        return a.handle.localeCompare(b.handle);
      }
      // online
      const ta = ca?.info?.lastOnlineTimeSeconds ?? 0;
      const tb = cb?.info?.lastOnlineTimeSeconds ?? 0;
      return tb - ta;
    });
    return list;
  }, [friends, caches, search, sortKey]);

  return (
    <div>
      <h2 className={styles.heading}>好友列表</h2>
      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="搜索 handle / 备注..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.search}
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className={styles.select}
        >
          <option value="rating">按 Rating 排序</option>
          <option value="handle">按 Handle 排序</option>
          <option value="online">按最近在线排序</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>还没有好友。点击左下角"+ 添加"开始添加好友。</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((f) => (
            <FriendRow key={f.handle} friend={f} cache={caches[f.handle]} />
          ))}
        </div>
      )}
    </div>
  );
}
