import { useEffect, useState } from 'react';
import type { Friend, FriendCache } from '../types';

/**
 * 集中加载好友列表、缓存数据与当前用户 handle。
 * 多个页面共享此逻辑以消除重复的数据加载代码。
 * 同时监听全局刷新进度: 每个好友刷新完成即更新其缓存,
 * 全部完成后整体重载 —— 刷新期间/结束后数据自动保持最新。
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

  // 刷新进度: 单好友完成即更新缓存; 全部完成整体重载
  useEffect(() => {
    const unsubscribe = window.api.cf.onRefreshProgress((p) => {
      if (p.handle) {
        window.api.store.getCache(p.handle).then((cache) => {
          if (cache) setCaches((prev) => ({ ...prev, [p.handle!]: cache }));
        });
      }
      if (p.completed >= p.total) {
        (async () => {
          const fr = await window.api.store.getFriends();
          setFriends(fr);
          const c = await window.api.store.getAllCache();
          setCaches(c);
        })();
      }
    });
    return unsubscribe;
  }, []);

  return { friends, caches, myHandle, setFriends, setCaches };
}
