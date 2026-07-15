import { useEffect, useState } from 'react';
import type { Friend, FriendCache } from '../types';

/**
 * 自定义 Hook：集中加载好友列表、缓存数据与当前用户 handle。
 * 多个页面共享此逻辑以消除重复的数据加载代码。
 */
export function useAppData() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [myHandle, setMyHandle] = useState('');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const s = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
    })();
  }, []);

  return { friends, caches, myHandle, setFriends, setCaches };
}
