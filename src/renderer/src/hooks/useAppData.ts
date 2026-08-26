import { useEffect, useState } from 'react';
import type { Friend, FriendCache, LuoguCache, PlatformAccount } from '../types';

/**
 * 集中加载好友列表、CF 缓存、洛谷缓存、当前用户 handle 与「我的洛谷」账号。
 * 多个页面共享此逻辑以消除重复的数据加载代码。
 * 同时监听全局刷新进度: CF 刷新单好友完成即更新其缓存, 洛谷刷新全部完成整体重载。
 */
export function useAppData() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [luoguCaches, setLuoguCaches] = useState<Record<number, LuoguCache>>({});
  const [myHandle, setMyHandle] = useState('');
  // 「我的洛谷」账号 — 即使我不在 friends 里, 也可能绑定了洛谷 (跨平台识别「我」)
  const [myLuogu, setMyLuogu] = useState<PlatformAccount | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const lg = await window.api.luogu.getAllCache();
      setLuoguCaches(lg);
      const s = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
      setMyLuogu(s.myLuogu);
    })();
  }, []);

  // 刷新进度: CF 单好友完成即更新缓存; 洛谷全部完成整体重载 (含 myLuogu)
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

    const unsubLuogu = window.api.luogu.onRefreshProgress(async (p) => {
      if (p.completed >= p.total) {
        const lg = await window.api.luogu.getAllCache();
        setLuoguCaches(lg);
      }
    });

    return () => {
      unsubCf();
      unsubLuogu();
    };
  }, []);

  return {
    friends,
    caches,
    luoguCaches,
    myHandle,
    myLuogu,
    setFriends,
    setCaches,
    // 也暴露 setter, Settings 关联 / 解绑后能即时刷新 UI (避免重新挂载页面)
    setMyLuogu,
  };
}
