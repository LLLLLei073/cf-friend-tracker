import { ipcMain, BrowserWindow } from 'electron';
import { StoreManager } from './store';
import { fetchUserInfo, fetchUserRating, fetchUserStatus, fetchFriends } from './cf-api';
import type { Friend, FriendCache, Settings, CFUser, Team } from '../shared/types';

function sendProgress(progress: {
  handle?: string;
  completed: number;
  total: number;
  errors: string[];
}): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('cf:refreshProgress', progress);
  });
}

export function registerIpcHandlers(store: StoreManager): void {
  // ---- CF API ----
  ipcMain.handle('cf:getUserInfo', async (_event, handles: string[]) => {
    return fetchUserInfo(handles);
  });

  ipcMain.handle('cf:getUserRating', async (_event, handle: string) => {
    return fetchUserRating(handle);
  });

  ipcMain.handle('cf:getUserStatus', async (_event, handle: string, count?: number) => {
    return fetchUserStatus(handle, count);
  });

  ipcMain.handle('cf:getFriends', async (_event, handle: string, apiKey: string, apiSecret: string) => {
    return fetchFriends(handle, apiKey, apiSecret);
  });

  ipcMain.handle('cf:refreshAll', async () => {
    const friends = store.getFriends();
    const handles = friends.map((f) => f.handle);
    if (handles.length === 0) return [];

    const total = handles.length;
    const errors: string[] = [];

    // 1. 批量获取 user.info (单次请求)
    const infos: CFUser[] = await fetchUserInfo(handles);

    // 2. 逐个获取 rating + status,每完成一个就推送进度
    let completed = 0;
    for (const info of infos) {
      try {
        const [ratingHistory, recentSubmissions] = await Promise.all([
          fetchUserRating(info.handle),
          fetchUserStatus(info.handle, 20),
        ]);
        const cache: FriendCache = {
          handle: info.handle,
          info,
          ratingHistory,
          recentSubmissions,
          cachedAt: Date.now(),
        };
        store.setCache(info.handle, cache);
      } catch (e) {
        errors.push(info.handle);
        // 即使失败也缓存 user.info,保证基础信息可见
        store.setCache(info.handle, {
          handle: info.handle,
          info,
          ratingHistory: [],
          recentSubmissions: [],
          cachedAt: Date.now(),
        });
      }
      completed++;
      sendProgress({ handle: info.handle, completed, total, errors });
    }

    const settings = store.getSettings();
    settings.lastRefreshAt = Date.now();
    store.setSettings(settings);

    return infos;
  });

  // ---- Store: Friends ----
  ipcMain.handle('store:getFriends', () => {
    return store.getFriends();
  });

  ipcMain.handle('store:addFriend', (_event, friend: Friend) => {
    return store.addFriend(friend);
  });

  ipcMain.handle('store:removeFriend', (_event, handle: string) => {
    store.removeFriend(handle);
    return true;
  });

  // ---- Store: Cache ----
  ipcMain.handle('store:getCache', (_event, handle: string) => {
    return store.getCache(handle);
  });

  ipcMain.handle('store:getAllCache', () => {
    return store.getAllCache();
  });

  ipcMain.handle('store:clearCache', () => {
    store.clearCache();
    return true;
  });

  // ---- Store: Settings ----
  ipcMain.handle('store:getSettings', () => {
    return store.getSettings();
  });

  ipcMain.handle('store:setSettings', (_event, settings: Settings) => {
    store.setSettings(settings);
    return true;
  });

  // ---- Store: Teams ----
  ipcMain.handle('store:getTeams', () => {
    return store.getTeams();
  });

  ipcMain.handle('store:addTeam', (_event, team: Team) => {
    return store.addTeam(team);
  });

  ipcMain.handle('store:updateTeam', (_event, team: Team) => {
    store.updateTeam(team);
    return true;
  });

  ipcMain.handle('store:removeTeam', (_event, id: string) => {
    store.removeTeam(id);
    return true;
  });

  // ---- My Profile: 刷新自己的信息 ----
  ipcMain.handle('cf:refreshMyProfile', async () => {
    const settings = store.getSettings();
    if (!settings.myHandle) return null;
    try {
      const infos = await fetchUserInfo([settings.myHandle]);
      if (infos.length === 0) return null;
      const info = infos[0];
      const [ratingHistory, recentSubmissions] = await Promise.all([
        fetchUserRating(info.handle),
        fetchUserStatus(info.handle, 20),
      ]);
      const cache: FriendCache = {
        handle: info.handle,
        info,
        ratingHistory,
        recentSubmissions,
        cachedAt: Date.now(),
      };
      store.setCache(info.handle, cache);
      return info;
    } catch {
      return null;
    }
  });

  // ---- 自动同步好友数据(保存设置时调用) ----
  // 配置了 API 时:拉取 CF 关注列表,删除本地不在关注列表中的好友,同步剩余好友数据
  // 未配置 API 时:仅同步已有关注好友的数据,不删除
  ipcMain.handle('cf:syncFriendsAuto', async () => {
    const settings = store.getSettings();
    if (!settings.myHandle) {
      return { synced: 0, removed: 0, skipped: true, error: '未配置 Handle' };
    }

    let cfFriends: string[] | null = null;

    // 配置了 API 则拉取 CF 关注列表
    if (settings.apiKey && settings.apiSecret) {
      try {
        cfFriends = await fetchFriends(
          settings.myHandle,
          settings.apiKey,
          settings.apiSecret
        );
      } catch (e) {
        return { synced: 0, removed: 0, skipped: false, error: `拉取关注列表失败: ${(e as Error).message}` };
      }
    }

    let removed = 0;
    const friends = store.getFriends();

    // 删除不在 CF 关注列表中的好友
    if (cfFriends !== null) {
      const cfSet = new Set(cfFriends);
      for (const f of friends) {
        if (!cfSet.has(f.handle)) {
          store.removeFriend(f.handle);
          removed++;
        }
      }
    }

    // 同步剩余好友数据
    const remaining = store.getFriends();
    const handles = remaining.map((f) => f.handle);
    let synced = 0;

    if (handles.length > 0) {
      const total = handles.length;
      const errors: string[] = [];
      const infos: CFUser[] = await fetchUserInfo(handles);

      let completed = 0;
      for (const info of infos) {
        try {
          const [ratingHistory, recentSubmissions] = await Promise.all([
            fetchUserRating(info.handle),
            fetchUserStatus(info.handle, 20),
          ]);
          store.setCache(info.handle, {
            handle: info.handle,
            info,
            ratingHistory,
            recentSubmissions,
            cachedAt: Date.now(),
          });
          synced++;
        } catch {
          errors.push(info.handle);
          store.setCache(info.handle, {
            handle: info.handle,
            info,
            ratingHistory: [],
            recentSubmissions: [],
            cachedAt: Date.now(),
          });
        }
        completed++;
        sendProgress({ handle: info.handle, completed, total, errors });
      }
    }

    const s = store.getSettings();
    s.lastRefreshAt = Date.now();
    store.setSettings(s);

    // 同时刷新自己的数据
    try {
      const infos = await fetchUserInfo([settings.myHandle]);
      if (infos.length > 0) {
        const info = infos[0];
        const [ratingHistory, recentSubmissions] = await Promise.all([
          fetchUserRating(info.handle),
          fetchUserStatus(info.handle, 20),
        ]);
        store.setCache(info.handle, {
          handle: info.handle,
          info,
          ratingHistory,
          recentSubmissions,
          cachedAt: Date.now(),
        });
      }
    } catch {
      // 忽略自身刷新失败
    }

    return { synced, removed, skipped: false, error: '' };
  });
}
