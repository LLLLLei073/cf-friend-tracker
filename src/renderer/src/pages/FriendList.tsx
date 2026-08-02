import { useState, useMemo } from 'react';
import type { Friend, FriendCache } from '../types';
import FriendRow from '../components/FriendRow';
import { useAppData } from '../hooks/useAppData';
import styles from '../styles/friendList.module.css';

type SortKey = 'rating' | 'handle' | 'online';

export default function FriendList() {
  // useAppData 统一加载好友/缓存并监听刷新进度自动更新
  const { friends, caches, setFriends } = useAppData();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');

  const handleToggleStar = async (handle: string, starred: boolean) => {
    await window.api.store.setFriendStarred(handle, starred);
    const fr = await window.api.store.getFriends();
    setFriends(fr);
  };

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
    // 特别关注始终置顶(稳定排序, 不破坏已有排序)
    list.sort((a, b) => {
      const sa = a.starred ? 0 : 1;
      const sb = b.starred ? 0 : 1;
      return sa - sb;
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
            <FriendRow
              key={f.handle}
              friend={f}
              cache={caches[f.handle]}
              onToggleStar={handleToggleStar}
            />
          ))}
        </div>
      )}
    </div>
  );
}