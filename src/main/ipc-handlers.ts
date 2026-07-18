import { ipcMain, BrowserWindow } from 'electron';
import { StoreManager } from './store';
import { fetchUserInfo, fetchUserRating, fetchUserStatus, fetchFriends, fetchContests } from './cf-api';
import { checkForUpdates, installUpdate, getUpdateStatus } from './updater';
import { checkRatingChanges, checkMilestones } from './notifier';
import { predictContest } from './predictor';
import type {
  Friend,
  Settings,
  CFUser,
  Team,
  WindowState,
  SyncResult,
  RefreshProgress,
  UpdateStatus,
  UpdateInfo,
  ContestPrediction,
} from '../shared/types';

function sendProgress(progress: RefreshProgress): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('cf:refreshProgress', progress);
  });
}

/**
 * 刷新单个用户缓存: 获取 rating + status 并写入缓存。
 * 失败时抛出错误, 由调用方决定如何处理。
 */
async function refreshUserCache(store: StoreManager, info: CFUser): Promise<void> {
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

/**
 * 安全刷新用户缓存: 调用 refreshUserCache, 失败时仍存储基础信息(空 ratingHistory
 * 和 recentSubmissions), 保证基础信息可见。返回是否成功获取完整数据。
 */
async function refreshUserCacheSafe(store: StoreManager, info: CFUser): Promise<boolean> {
  try {
    await refreshUserCache(store, info);
    return true;
  } catch {
    // 即使失败也缓存 user.info, 保证基础信息可见
    store.setCache(info.handle, {
      handle: info.handle,
      info,
      ratingHistory: [],
      recentSubmissions: [],
      cachedAt: Date.now(),
    });
    return false;
  }
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

    // 保存旧缓存用于变化检测
    const oldCaches = store.getAllCache();

    const total = handles.length;
    const errors: string[] = [];

    // 1. 批量获取 user.info (单次请求)
    let infos: CFUser[];
    try {
      infos = await fetchUserInfo(handles);
    } catch (e) {
      console.error('fetchUserInfo failed:', e);
      throw e;
    }

    // starred 排前面: 让特别关注的好友优先完成刷新
    const starredSet = new Set(friends.filter((f) => f.starred).map((f) => f.handle));
    infos.sort((a, b) => {
      const sa = starredSet.has(a.handle) ? 0 : 1;
      const sb = starredSet.has(b.handle) ? 0 : 1;
      return sa - sb;
    });

    // 2. 逐个获取 rating + status,每完成一个就推送进度
    let completed = 0;
    for (const info of infos) {
      const ok = await refreshUserCacheSafe(store, info);
      if (!ok) errors.push(info.handle);
      completed++;
      sendProgress({ handle: info.handle, completed, total, errors });
    }

    const settings = store.getSettings();
    settings.lastRefreshAt = Date.now();
    store.setSettings(settings);

    // 刷新后检查通知
    checkRatingChanges(store, oldCaches, settings);
    checkMilestones(store, oldCaches);

    return infos;
  });

  // ---- 仅刷新特别关注的好友 (节省资源: 不拉取非 starred 好友) ----
  ipcMain.handle('cf:refreshStarred', async () => {
    const friends = store.getFriends();
    const starredFriends = friends.filter((f) => f.starred);
    const handles = starredFriends.map((f) => f.handle);
    if (handles.length === 0) return [];

    const oldCaches = store.getAllCache();
    const total = handles.length;
    const errors: string[] = [];

    let infos: CFUser[];
    try {
      infos = await fetchUserInfo(handles);
    } catch (e) {
      console.error('fetchUserInfo(starred) failed:', e);
      throw e;
    }

    let completed = 0;
    for (const info of infos) {
      const ok = await refreshUserCacheSafe(store, info);
      if (!ok) errors.push(info.handle);
      completed++;
      sendProgress({ handle: info.handle, completed, total, errors });
    }

    // 注意: 仅刷新 starred 不更新 lastRefreshAt, 避免干扰全量刷新的时间记录
    const settings = store.getSettings();
    checkRatingChanges(store, oldCaches, settings);
    checkMilestones(store, oldCaches);

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

  ipcMain.handle('store:updateFriend', (_event, handle: string, alias: string) => {
    return store.updateFriend(handle, alias);
  });

  ipcMain.handle('store:setFriendStarred', (_event, handle: string, starred: boolean) => {
    return store.setFriendStarred(handle, starred);
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
      await refreshUserCache(store, infos[0]);
      return infos[0];
    } catch {
      return null;
    }
  });

  // ---- 自动同步好友数据(保存设置时调用) ----
  // 配置了 API 时:拉取 CF 关注列表,删除本地不在关注列表中的好友,同步剩余好友数据
  // 未配置 API 时:仅同步已有关注好友的数据,不删除
  ipcMain.handle('cf:syncFriendsAuto', async (): Promise<SyncResult> => {
    const settings = store.getSettings();
    if (!settings.myHandle) {
      return { synced: 0, removed: 0, skipped: true, error: '未配置 Handle' };
    }

    // 保存旧缓存用于变化检测
    const oldCaches = store.getAllCache();

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
        const ok = await refreshUserCacheSafe(store, info);
        if (ok) synced++;
        else errors.push(info.handle);
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
        await refreshUserCache(store, infos[0]);
      }
    } catch {
      // 忽略自身刷新失败
    }

    // 刷新后检查通知
    const currentSettings = store.getSettings();
    checkRatingChanges(store, oldCaches, currentSettings);
    checkMilestones(store, oldCaches);

    return { synced, removed, skipped: false, error: '' };
  });

  // ---- Contests ----
  ipcMain.handle('cf:getContests', async () => {
    try {
      const contests = await fetchContests();
      // 只返回即将开始和进行中的
      const now = Math.floor(Date.now() / 1000);
      return contests.filter((c) => {
        const endTime = c.startTimeSeconds + c.durationSeconds;
        return endTime > now; // 还没结束的
      }).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    } catch (e) {
      // 不吞错误: 把真实错误抛给前端, 区分"无比赛"与"请求失败"
      console.error('fetchContests failed:', e);
      throw new Error(`获取比赛列表失败: ${(e as Error).message}`);
    }
  });

  // ---- Window State ----
  ipcMain.handle('store:getWindowState', () => {
    return store.getWindowState();
  });

  ipcMain.handle('store:setWindowState', (_event, state: WindowState) => {
    store.setWindowState(state);
    return true;
  });

  // ---- Viewed Ratings ----
  ipcMain.handle('store:getViewedRatings', () => {
    return store.getViewedRatings();
  });

  ipcMain.handle('store:setViewedRating', (_event, handle: string, rating: number) => {
    store.setViewedRating(handle, rating);
    return true;
  });

  ipcMain.handle('store:removeViewedRating', (_event, handle: string) => {
    store.removeViewedRating(handle);
    return true;
  });

  // ---- Updater (自动更新) ----
  ipcMain.handle('updater:checkForUpdates', async () => {
    await checkForUpdates();
    return getUpdateStatus();
  });

  ipcMain.handle('updater:installUpdate', () => {
    installUpdate();
    return true;
  });

  ipcMain.handle('updater:getStatus', (): { status: UpdateStatus; info: UpdateInfo | null; error: string | null; appVersion: string } => {
    return getUpdateStatus();
  });

  // ---- Notifications (通知) ----
  ipcMain.handle('notify:test', async () => {
    const { Notification } = await import('electron');
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: 'CF Friends 通知测试',
      body: '如果你看到了这条通知，说明通知功能正常工作!',
    });
    n.show();
    return true;
  });

  ipcMain.handle('notify:checkContests', async () => {
    const { checkContestReminders } = await import('./notifier');
    await checkContestReminders(store);
    return true;
  });

  // ---- Rating Prediction (评级预测) ----
  ipcMain.handle('predict:contest', async (_event, contestId: number, contestName: string): Promise<ContestPrediction> => {
    const friends = store.getFriends();
    const friendHandles = friends.map((f) => f.handle);
    if (friendHandles.length === 0) {
      return { contestId, contestName, predictions: [], totalParticipants: 0 };
    }
    return predictContest(contestId, contestName, friendHandles);
  });
}