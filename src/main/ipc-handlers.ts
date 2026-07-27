import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import fs from 'fs';
import { StoreManager } from './store';
import { fetchUserInfo, fetchUserRating, fetchUserStatus, fetchFriends, fetchContests, fetchContestPerformance } from './cf-api';
import { checkForUpdates, installUpdate, getUpdateStatus } from './updater';
import { checkRatingChanges, checkMilestones } from './notifier';
import { predictContest } from './predictor';
import { analyzeTeam, testAIConnection, buildReportMarkdown, buildReportExcelBuffer, translateProblemHTML } from './ai';
import { fetchProblemList, refreshProblemList, fetchProblemStatement } from './problem-fetcher';
import { runCode, detectCompiler } from './code-runner';
import { getCode, setCode, setStatement } from './problem-store';
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

  // 获取题面（优先本地缓存, 否则抓取 CF 页面并解析）
  ipcMain.handle(
    'problem:getStatement',
    async (_event, contestId: number, index: string): Promise<import('../shared/types').ProblemStatement> => {
      try {
        return await fetchProblemStatement(contestId, index);
      } catch (e) {
        throw new Error(`获取题面失败: ${(e as Error).message}`);
      }
    },
  );

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
    return testAIConnection(effectiveSettings);
  });

  // 返回应用版本号(来自 package.json), 供渲染端统一展示, 杜绝与硬编码常量漂移
  ipcMain.handle('app:getVersion', (): string => app.getVersion());
}