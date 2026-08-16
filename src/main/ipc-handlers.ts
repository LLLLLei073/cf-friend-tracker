import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { StoreManager } from './store';
import { fetchUserInfo, fetchUserInfoSafe, fetchUserRating, fetchUserStatus, fetchFriends, fetchContests, fetchContestPerformance, fetchContestStandings, fetchBlogEntries } from './cf-api';
import { checkForUpdates, installUpdate, getUpdateStatus } from './updater';
import { checkRatingChanges, checkMilestones, checkContestReminders } from './notifier';
import { predictContest } from './predictor';
import { analyzeTeam, testAIConnection, buildReportMarkdown, buildReportExcelBuffer, translateProblemHTML } from './ai';
import { fetchProblemList, refreshProblemList, fetchProblemStatement, fetchContestProblemList } from './problem-fetcher';
import { runCode, detectCompiler } from './code-runner';
import { getCode, setCode, setStatement, getProblemCacheDir, setProblemCacheDir, migrateProblemCache, clearProblemCache, listFavorites, addFavorite, removeFavorite, isFavorite } from './problem-store';
import type {
  Friend,
  Settings,
  CFUser,
  Team,
  TeamAIResult,
  AIConnectionResult,
  AIExportResult,
  AIExportFormat,
  WindowState,
  SyncResult,
  RefreshProgress,
  UpdateStatus,
  UpdateInfo,
  ContestPrediction,
  SampleTest,
  BackupData,
  BackupResult,
  NotificationItem,
  FavoriteProblem,
  BlogEntry,
  CFContest,
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

  // 拉取较大量提交记录(训练看板等深度分析使用, 默认 1000 条)
  ipcMain.handle('cf:getSubmissions', async (_event, handle: string, count = 1000) => {
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
    // 注意: CF 的 user.info 只要有一个 handle 无效就整体 FAILED,
    // 因此用容错版: 整批失败时降级为逐 handle 获取, 无效 handle 单独记录,
    // 不再导致整个刷新中断(表现为"点击刷新卡住, 好友信息加载不出来")。
    const { infos, failed: failedInfos } = await fetchUserInfoSafe(handles);
    errors.push(...failedInfos);

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
    // 边界: infos 为空(所有 handle 都无效)时上面的循环不执行,
    // 也必须推送一次最终进度, 让前端能结束刷新状态并看到错误提示。
    if (infos.length === 0) {
      sendProgress({ completed: total, total, errors });
    }

    const settings = store.getSettings();
    settings.lastRefreshAt = Date.now();
    await store.setSettings(settings);

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

    // 容错批量获取: 无效 handle 不会导致整个刷新中断
    const { infos, failed: failedInfos } = await fetchUserInfoSafe(handles);
    errors.push(...failedInfos);

    let completed = 0;
    for (const info of infos) {
      const ok = await refreshUserCacheSafe(store, info);
      if (!ok) errors.push(info.handle);
      completed++;
      sendProgress({ handle: info.handle, completed, total, errors });
    }
    // 边界: 所有 starred handle 都无效时也要推送最终进度, 结束前端刷新状态
    if (infos.length === 0) {
      sendProgress({ completed: total, total, errors });
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
  ipcMain.handle('store:getSettings', async () => {
    const s = store.getSettings();
    // 覆盖真实 aiApiKey(可能存于系统凭据库, store 明文为空)
    s.aiApiKey = await store.getApiKeyAsync();
    return s;
  });

  ipcMain.handle('store:setSettings', async (_event, settings: Settings) => {
    await store.setSettings(settings);
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
      const { infos, failed: failedInfos } = await fetchUserInfoSafe(handles);
      errors.push(...failedInfos);

      let completed = 0;
      for (const info of infos) {
        const ok = await refreshUserCacheSafe(store, info);
        if (ok) synced++;
        else errors.push(info.handle);
        completed++;
        sendProgress({ handle: info.handle, completed, total, errors });
      }
      // 边界: 所有 handle 都无效时也要推送最终进度, 结束前端刷新状态
      if (infos.length === 0) {
        sendProgress({ completed: total, total, errors });
      }
    }

    const s = store.getSettings();
    s.lastRefreshAt = Date.now();
    await store.setSettings(s);

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

  // 近期已结束的比赛(默认按开始时间倒序, 供动态页"近期比赛"板块使用)
  ipcMain.handle('cf:getFinishedContests', async (_event, limit?: number) => {
    try {
      const contests = await fetchContests();
      const finished = contests
        .filter((c) => c.phase === 'FINISHED')
        .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds);
      return typeof limit === 'number' ? finished.slice(0, limit) : finished;
    } catch (e) {
      console.error('fetchFinishedContests failed:', e);
      throw new Error(`获取已结束比赛失败: ${(e as Error).message}`);
    }
  });

  // 批量获取若干 handle 在某场比赛中的表现(AC 题数/排名/得分)
  ipcMain.handle('cf:getContestPerformance', async (_event, contestId: number, handles: string[]) => {
    return fetchContestPerformance(contestId, handles);
  });

  // ---- 题目浏览 / 代码运行 ----
  // 获取题目列表（优先本地缓存, 首次会拉取全量 problemset）
  // 注意: 新版刷题主页改为「按比赛搜索」, 不再首屏拉取全量; 此 handler 保留供需要时调用。
  ipcMain.handle('problem:getList', async (): Promise<import('../shared/types').ProblemListItem[]> => {
    try {
      return await fetchProblemList(false);
    } catch (e) {
      throw new Error(`获取题目列表失败: ${(e as Error).message}`);
    }
  });

  // 强制刷新题目列表
  ipcMain.handle('problem:refreshList', async (): Promise<import('../shared/types').ProblemListItem[]> => {
    try {
      return await refreshProblemList();
    } catch (e) {
      throw new Error(`刷新题目列表失败: ${(e as Error).message}`);
    }
  });

  // 按比赛编号获取该场比赛的题目清单（按比赛顺序 A, B, C...），优先内存缓存
  ipcMain.handle(
    'problem:getContestProblems',
    async (_event, contestId: number, force?: boolean): Promise<import('../shared/types').ProblemListItem[]> => {
      try {
        return await fetchContestProblemList(contestId, force);
      } catch (e) {
        throw new Error(`获取比赛题目失败: ${(e as Error).message}`);
      }
    },
  );

  // 获取单场比赛信息(名称/时长/起止), 用于虚拟比赛计时。复用 contest.standings 返回的 contest 字段。
  ipcMain.handle('cf:getContestInfo', async (_event, contestId: number): Promise<import('../shared/types').CFContest | null> => {
    try {
      const standings = await fetchContestStandings(contestId);
      return standings.contest ?? null;
    } catch (e) {
      throw new Error(`获取比赛信息失败: ${(e as Error).message}`);
    }
  });

  // 获取题面（仅从本地缓存读取; Codeforces 页面域被 Cloudflare 反爬,
  // 应用内无法抓取, 未缓存时返回 OPEN_BROWSER 信号, 由前端调用系统浏览器打开原题）
  ipcMain.handle(
    'problem:getStatement',
    async (_event, contestId: number, index: string): Promise<import('../shared/types').ProblemStatement> => {
      try {
        return await fetchProblemStatement(contestId, index);
      } catch (e) {
        const msg = (e as Error).message || String(e);
        if (msg.includes('OPEN_BROWSER')) {
          throw new Error(
            'OPEN_BROWSER: 该题目的题面未缓存，且 Codeforces 不允许应用内抓取。已为你打开系统浏览器查看原题。',
          );
        }
        throw new Error(`获取题面失败: ${msg}`);
      }
    },
  );

  // 用系统默认浏览器打开指定题目的原题页（避免应用内浏览器被 Cloudflare 拦截）
  ipcMain.handle('problem:openInBrowser', (_event, contestId: number, index: string): void => {
    shell.openExternal(`https://codeforces.com/contest/${contestId}/problem/${index}`);
  });

  // 打开系统默认浏览器到 Codeforces（登录 / 做题等都在本地浏览器进行）
  ipcMain.handle('problem:login', (): void => {
    shell.openExternal('https://codeforces.com/');
  });

  // 运行 C++ 代码并对所有样例对拍
  ipcMain.handle(
    'problem:runCode',
    async (_event, code: string, samples: SampleTest[]): Promise<import('../shared/types').RunAllResult> => {
      const settings = store.getSettings();
      return runCode(code, samples, settings.cppCompilerPath);
    },
  );

  // 读取/保存用户在某个题目上写的代码
  ipcMain.handle('problem:getCode', async (_event, id: string): Promise<string | null> => {
    return getCode(id);
  });
  ipcMain.handle('problem:setCode', async (_event, id: string, code: string): Promise<boolean> => {
    setCode(id, code);
    return true;
  });

  // 探测当前可用的 C++ 编译器路径
  ipcMain.handle('problem:detectCompiler', async (): Promise<string | null> => {
    const settings = store.getSettings();
    return detectCompiler(settings.cppCompilerPath);
  });

  // AI 翻译题面(结果写回题面缓存, 一题只翻一次; force 为 true 时重新翻译)
  ipcMain.handle(
    'problem:translate',
    async (_event, contestId: number, index: string, force?: boolean): Promise<import('../shared/types').ProblemStatement> => {
      try {
        const stmt = await fetchProblemStatement(contestId, index);
        if (stmt.translation && !force) return stmt;
        const settings = store.getSettings();
        // 覆盖真实 aiApiKey(可能存于系统凭据库)
        settings.aiApiKey = await store.getApiKeyAsync();
        const html = await translateProblemHTML(stmt.html, settings);
        const updated = {
          ...stmt,
          translation: { html, model: settings.aiModel, translatedAt: Date.now() },
        };
        setStatement(updated);
        return updated;
      } catch (e) {
        throw new Error(`翻译失败: ${(e as Error).message}`);
      }
    },
  );

  // 获取当前生效的题目缓存目录（自定义目录或默认位置）
  ipcMain.handle('problem:getCacheDir', (): string => {
    return getProblemCacheDir();
  });

  // 用系统默认浏览器打开外部链接
  ipcMain.handle('app:openExternal', (_event, url: string): void => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });

  // 弹出系统目录选择框, 返回用户选择的目录路径（取消则返回 null）
  ipcMain.handle('problem:selectCacheDir', async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const res = await dialog.showOpenDialog(win ?? (undefined as never), {
      title: '选择题目缓存目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  // 更换题目缓存目录: 自动将已保存的题目与代码移动到新目录
  ipcMain.handle(
    'problem:setCacheDir',
    (_event, newDir: string): import('./problem-store').MigrateResult => {
      return migrateProblemCache(newDir);
    },
  );

  // 清空题目缓存: 删除题面 / 题目清单 / 保存的代码（保留目录本身）
  ipcMain.handle('problem:clearCache', (): import('./problem-store').ClearResult => {
    return clearProblemCache();
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

  // ---- Team AI Analysis (团队 AI 分析, 含历史记录与导出) ----
  // 读取某团队的 AI 分析历史(最新的在前), 不触发新请求
  ipcMain.handle('ai:getTeamAIHistory', (_event, teamId: string): TeamAIResult[] => {
    return store.getTeamAIHistory(teamId);
  });

  // 重新生成团队 AI 分析: 取队伍成员缓存 + 当前设置, 调用 AI, 写入历史并返回新结果
  // settings 可选: 由渲染端传入编辑中/最新的 settings, 避免依赖自动保存时序; 缺省时回退读盘
  ipcMain.handle('ai:analyzeTeam', async (_event, teamId: string, settings?: Settings): Promise<TeamAIResult> => {
    const teams = store.getTeams();
    const team = teams.find((t) => t.id === teamId);
    if (!team) throw new Error('团队不存在');
    if (team.members.length === 0) throw new Error('团队没有成员');

    const effectiveSettings = settings ?? store.getSettings();
    // 覆盖真实 aiApiKey(可能存于系统凭据库, store 明文为空)
    if (!settings || !settings.aiApiKey) {
      effectiveSettings.aiApiKey = await store.getApiKeyAsync();
    }
    const allCache = store.getAllCache();
    const members = team.members.map((handle) => ({ handle, cache: allCache[handle] }));

    const result = await analyzeTeam(team.name, members, effectiveSettings, team.goal);
    store.addTeamAIResult(teamId, result);
    // 分析结果已落盘, 主动通知渲染端。即使 TeamAISection 因用户跳转/收起而卸载,
    // 渲染端全局管理器也能在事件到达时清除「分析中」状态并重新载入历史, 避免表现为「分析中断」。
    _event.sender.send('ai:teamAnalysisDone', { teamId });
    return result;
  });

  // 删除指定历史记录(按稳定 id 匹配, 避免同一毫秒生成的时间戳碰撞)
  ipcMain.handle('ai:removeTeamAIResult', (_event, teamId: string, id: string) => {
    store.removeTeamAIResult(teamId, id);
    return true;
  });

  // 清空某团队的全部 AI 分析历史
  ipcMain.handle('ai:clearTeamAIHistory', (_event, teamId: string) => {
    store.clearTeamAIHistory(teamId);
    return true;
  });

  // 导出指定报告为文件(弹出保存对话框, 支持 Markdown / Excel / 图片 三种格式)
  // format 为 'image' 时, imageData 需传入渲染端截图得到的 PNG dataURL(base64), 主进程仅负责解码保存
  ipcMain.handle(
    'ai:exportReport',
    async (
      _event,
      teamName: string,
      result: TeamAIResult,
      format: AIExportFormat,
      imageData?: string,
      goal?: string
    ): Promise<AIExportResult> => {
      try {
        const stamp = new Date(result.generatedAt)
          .toISOString()
          .slice(0, 16)
          .replace(/[:T]/g, '-');
        // 文件名里的非法字符做简单清理
        const safeName = (teamName || 'team').replace(/[\\/:*?"<>|]/g, '_');

        let content: string | Buffer;
        let defaultName: string;
        let filterName: string;
        let ext: string;
        if (format === 'image') {
          if (!imageData || !imageData.startsWith('data:image/')) {
            return { ok: false, error: '图片数据无效, 请重试' };
          }
          const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
          content = Buffer.from(base64, 'base64');
          defaultName = `${safeName}_AI报告_${stamp}.png`;
          filterName = 'PNG 图片';
          ext = 'png';
        } else if (format === 'excel') {
          content = buildReportExcelBuffer(teamName, result, goal);
          defaultName = `${safeName}_AI报告_${stamp}.xlsx`;
          filterName = 'Excel 工作簿';
          ext = 'xlsx';
        } else {
          content = buildReportMarkdown(teamName, result, goal);
          defaultName = `${safeName}_AI报告_${stamp}.md`;
          filterName = 'Markdown';
          ext = 'md';
        }

        const opts = {
          title: '导出 AI 报告',
          defaultPath: defaultName,
          filters: [
            { name: filterName, extensions: [ext] },
            { name: '所有文件', extensions: ['*'] },
          ],
        };
        const win = BrowserWindow.getFocusedWindow();
        const res = win
          ? await dialog.showSaveDialog(win, opts)
          : await dialog.showSaveDialog(opts);

        if (res.canceled || !res.filePath) return { ok: false, canceled: true };
        if (typeof content === 'string') {
          fs.writeFileSync(res.filePath, content, 'utf-8');
        } else {
          fs.writeFileSync(res.filePath, content);
        }
        return { ok: true, path: res.filePath };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
  );

  // 测试 AI 接口连通性
  // settings 可选: 由渲染端传入编辑中的 settings, 避免用户刚改完 Key 立刻测试却读到旧值;
  // 缺省时回退读盘
  ipcMain.handle('ai:testConnection', async (_event, settings?: Settings): Promise<AIConnectionResult> => {
    const effectiveSettings = settings ?? store.getSettings();
    if (!settings || !settings.aiApiKey) {
      effectiveSettings.aiApiKey = await store.getApiKeyAsync();
    }
    return testAIConnection(effectiveSettings);
  });

  // 返回应用版本号(来自 package.json), 供渲染端统一展示, 杜绝与硬编码常量漂移
  ipcMain.handle('app:getVersion', (): string => app.getVersion());

  // ---- 数据备份与迁移 ----
  // 导出全部数据为 JSON 文件
  ipcMain.handle('store:exportBackup', async (): Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }> => {
    try {
      const data = store.exportAll();
      const stamp = new Date(data.exportedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const opts = {
        title: '导出备份',
        defaultPath: `cf-friends-backup-${stamp}.json`,
        filters: [{ name: 'JSON 备份文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }],
      };
      const win = BrowserWindow.getFocusedWindow();
      const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // 从 JSON 文件导入数据(会覆盖当前数据; 题目缓存目录不同时迁移题面文件)
  ipcMain.handle('store:importBackup', async (): Promise<BackupResult> => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const res = await dialog.showOpenDialog(win ?? (undefined as never), {
        title: '导入备份',
        properties: ['openFile'],
        filters: [{ name: 'JSON 备份文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }],
      });
      if (res.canceled || res.filePaths.length === 0) return { ok: false, error: '已取消' };
      const raw = fs.readFileSync(res.filePaths[0], 'utf-8');
      const data = JSON.parse(raw) as BackupData;
      const result = store.importAll(data);
      if (!result.ok) return result;

      // 若备份里指定了不同的题目缓存目录, 迁移题面/代码文件
      let cacheMoved = 0;
      if (data.problemCacheDir && data.problemCacheDir.trim()) {
        const current = getProblemCacheDir();
        if (path.resolve(data.problemCacheDir) !== path.resolve(current)) {
          const migrateRes = migrateProblemCache(data.problemCacheDir);
          cacheMoved = migrateRes.moved;
          setProblemCacheDir(data.problemCacheDir);
        }
      }
      return { ok: true, imported: { ...(result.imported ?? { friends: 0, teams: 0, cacheMoved: 0 }), cacheMoved } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // ---- 通知中心 ----
  ipcMain.handle('notify:getHistory', (): NotificationItem[] => {
    return store.getNotifications();
  });

  ipcMain.handle('notify:clearHistory', () => {
    store.clearNotifications();
    return true;
  });

  ipcMain.handle('notify:markRead', (_event, id: string) => {
    store.markNotificationRead(id);
    return true;
  });

  ipcMain.handle('notify:markAllRead', () => {
    store.markAllNotificationsRead();
    return true;
  });

  // 渲染端订阅新通知(用于红点角标)
  // 注意: 主进程在 addNotification 后通过 sendProgress 同样的方式广播
  const broadcastNotification = () => {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notify:new'));
  };
  // 暴露一个内部触发器: notifier 写入后调用。这里通过事件名让渲染端订阅。
  // (实际广播在 notifier 模块内完成, 见 notify:push)
  ipcMain.handle('notify:push', (_event, item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => {
    const full = store.addNotification(item);
    broadcastNotification();
    return full;
  });

  // ---- 好友分组 ----
  ipcMain.handle('store:getGroupDefs', (): string[] => {
    return store.getGroupDefs();
  });

  ipcMain.handle('store:setGroupDefs', (_event, groups: string[]) => {
    store.setGroupDefs(groups);
    return true;
  });

  ipcMain.handle('store:setFriendGroups', (_event, handle: string, groups: string[]) => {
    return store.setFriendGroups(handle, groups);
  });

  // ---- 本地收藏题目 ----
  ipcMain.handle('problem:getFavorites', (): FavoriteProblem[] => {
    return listFavorites();
  });

  ipcMain.handle('problem:addFavorite', (_event, item: FavoriteProblem): boolean => {
    return addFavorite(item);
  });

  ipcMain.handle('problem:removeFavorite', (_event, contestId: number, index: string): boolean => {
    return removeFavorite(contestId, index);
  });

  ipcMain.handle('problem:isFavorite', (_event, contestId: number, index: string): boolean => {
    return isFavorite(contestId, index);
  });

  // ---- 好友博客 ----
  // 批量获取若干 handle 的博客列表(受 2 秒限速, 串行)
  ipcMain.handle('cf:getBlogEntries', async (_event, handles: string[]): Promise<BlogEntry[]> => {
    const all: BlogEntry[] = [];
    for (const handle of handles) {
      try {
        const entries = await fetchBlogEntries(handle);
        all.push(...entries);
      } catch {
        // 单个 handle 失败不影响其他
      }
    }
    // 按时间倒序
    all.sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);
    return all;
  });

  // ---- 比赛日历 ICS 导出 ----
  ipcMain.handle('contest:exportIcs', async (_event, contests: CFContest[]): Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }> => {
    try {
      const ics = buildIcs(contests);
      const stamp = new Date().toISOString().slice(0, 10);
      const opts = {
        title: '导出比赛日历',
        defaultPath: `cf-contests-${stamp}.ics`,
        filters: [{ name: 'iCalendar 文件', extensions: ['ics'] }, { name: '所有文件', extensions: ['*'] }],
      };
      const win = BrowserWindow.getFocusedWindow();
      const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, ics, 'utf-8');
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}

// 生成标准 iCalendar (.ics) 文本
function buildIcs(contests: CFContest[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CF Friend Tracker//Contest Export//CN'];
  const fmtTime = (sec: number) => new Date(sec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  for (const c of contests) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:cf-contest-${c.id}@cf-friend-tracker`);
    lines.push(`DTSTAMP:${fmtTime(Math.floor(Date.now() / 1000))}Z`);
    lines.push(`DTSTART:${fmtTime(c.startTimeSeconds)}Z`);
    lines.push(`DTEND:${fmtTime(c.startTimeSeconds + c.durationSeconds)}Z`);
    // 转义文本中的逗号/分号/换行
    const safeName = c.name.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    lines.push(`SUMMARY:${safeName}`);
    lines.push(`DESCRIPTION:Codeforces 比赛 ${c.id}`);
    lines.push(`URL:https://codeforces.com/contest/${c.id}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}