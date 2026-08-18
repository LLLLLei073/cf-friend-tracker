import { useEffect, useState } from 'react';
import type { Friend, FriendCache, LuoguCache, NowcoderCache } from '../types';

/**
 * 集中加载好友列表、CF 缓存、洛谷缓存、牛客缓存与当前用户 handle。
 * 多个页面共享此逻辑以消除重复的数据加载代码。
 * 同时监听全局刷新进度: CF 刷新单好友完成即更新其缓存, 洛谷/牛客刷新全部完成整体重载。
 */
export function useAppData() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [luoguCaches, setLuoguCaches] = useState<Record<number, LuoguCache>>({});
  const [nowcoderCaches, setNowcoderCaches] = useState<Record<number, NowcoderCache>>({});
  const [myHandle, setMyHandle] = useState('');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const lg = await window.api.luogu.getAllCache();
      setLuoguCaches(lg);
      const nc = await window.api.nowcoder.getAllCache();
      setNowcoderCaches(nc);
      const s = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
    })();
  }, []);

  // 刷新进度: CF 单好友完成即更新缓存; 洛谷/牛客全部完成整体重载
  useEffect(() => {
    const unsubCf = window.api.cf.onRefreshProgress((p) => {
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

    const unsubLuogu = window.api.luogu.onRefreshProgress((p) => {
      if (p.completed >= p.total) {
        (async () => {
          const lg = await window.api.luogu.getAllCache();
          setLuoguCaches(lg);
        })();
      }
    });

    const unsubNowcoder = window.api.nowcoder.onRefreshProgress((p) => {
      if (p.completed >= p.total) {
        (async () => {
          const nc = await window.api.nowcoder.getAllCache();
          setNowcoderCaches(nc);
        })();
      }
    });

    return () => {
      unsubCf();
      unsubLuogu();
      unsubNowcoder();
    };
  }, []);

  return { friends, caches, luoguCaches, nowcoderCaches, myHandle, setFriends, setCaches };
}
