import { ipcMain } from 'electron';
import { StoreManager } from './store';
import { fetchUserInfo, fetchUserRating, fetchUserStatus, fetchFriends } from './cf-api';
import type { Friend, FriendCache, Settings, CFUser } from '../shared/types';

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

    // 1. 批量获取 user.info
    const infos: CFUser[] = await fetchUserInfo(handles);

    // 2. 逐个获取 rating + status
    for (const info of infos) {
      const [ratingHistory, recentSubmissions] = await Promise.all([
        fetchUserRating(info.handle),
        fetchUserStatus(info.handle, 50),
      ]);
      const cache: FriendCache = {
        handle: info.handle,
        info,
        ratingHistory,
        recentSubmissions,
        cachedAt: Date.now(),
      };
      store.setCache(info.handle, cache);
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
}
