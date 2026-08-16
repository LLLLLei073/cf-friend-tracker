import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  CFContest,
  CFRatingChange,
  CFSubmission,
  CFUser,
  ContestPerformance,
  Friend,
  FriendCache,
  RefreshProgress,
  Settings,
  SyncResult,
  Team,
  TeamAIResult,
  AIConnectionResult,
  AIExportResult,
  AIExportFormat,
  WindowState,
  UpdateStatus,
  UpdateInfo,
  UpdateProgress,
  ContestPrediction,
  ProblemListItem,
  ProblemStatement,
  SampleTest,
  RunAllResult,
  BackupResult,
  NotificationItem,
  FavoriteProblem,
  BlogEntry,
} from '../shared/types';

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    // 用系统默认浏览器打开外部链接（避免应用内浏览器被 Cloudflare 拦截）
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  },
  cf: {
    getUserInfo: (handles: string[]): Promise<CFUser[]> =>
      ipcRenderer.invoke('cf:getUserInfo', handles),
    getUserRating: (handle: string): Promise<CFRatingChange[]> =>
      ipcRenderer.invoke('cf:getUserRating', handle),
    getUserStatus: (handle: string, count?: number): Promise<CFSubmission[]> =>
      ipcRenderer.invoke('cf:getUserStatus', handle, count),
    getFriends: (handle: string, apiKey: string, apiSecret: string): Promise<string[]> =>
      ipcRenderer.invoke('cf:getFriends', handle, apiKey, apiSecret),
    refreshAll: (): Promise<CFUser[]> => ipcRenderer.invoke('cf:refreshAll'),
    refreshStarred: (): Promise<CFUser[]> => ipcRenderer.invoke('cf:refreshStarred'),
    refreshMyProfile: (): Promise<CFUser | null> => ipcRenderer.invoke('cf:refreshMyProfile'),
    syncFriendsAuto: (): Promise<SyncResult> => ipcRenderer.invoke('cf:syncFriendsAuto'),
    getContests: (): Promise<CFContest[]> => ipcRenderer.invoke('cf:getContests'),
    getFinishedContests: (limit?: number): Promise<CFContest[]> =>
      ipcRenderer.invoke('cf:getFinishedContests', limit),
    getContestPerformance: (contestId: number, handles: string[]): Promise<Record<string, ContestPerformance>> =>
      ipcRenderer.invoke('cf:getContestPerformance', contestId, handles),
    // 获取单场比赛信息(名称/时长), 用于虚拟比赛
    getContestInfo: (contestId: number): Promise<CFContest | null> =>
      ipcRenderer.invoke('cf:getContestInfo', contestId),
    // 获取某 handle 的博客/题解列表(批量, 受 2 秒限速)
    getBlogEntries: (handles: string[]): Promise<BlogEntry[]> =>
      ipcRenderer.invoke('cf:getBlogEntries', handles),
    // 拉取指定数量提交(训练看板等深度分析使用, 默认 1000 条)
    getSubmissions: (handle: string, count?: number): Promise<CFSubmission[]> =>
      ipcRenderer.invoke('cf:getSubmissions', handle, count),
    onRefreshProgress: (callback: (progress: RefreshProgress) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, data: RefreshProgress) => callback(data);
      ipcRenderer.on('cf:refreshProgress', handler);
      return () => ipcRenderer.removeListener('cf:refreshProgress', handler);
    },
  },
  store: {
    getFriends: (): Promise<Friend[]> => ipcRenderer.invoke('store:getFriends'),
    addFriend: (friend: Friend): Promise<boolean> => ipcRenderer.invoke('store:addFriend', friend),
    removeFriend: (handle: string): Promise<boolean> =>
      ipcRenderer.invoke('store:removeFriend', handle),
    updateFriend: (handle: string, alias: string): Promise<boolean> =>
      ipcRenderer.invoke('store:updateFriend', handle, alias),
    setFriendStarred: (handle: string, starred: boolean): Promise<boolean> =>
      ipcRenderer.invoke('store:setFriendStarred', handle, starred),
    getCache: (handle: string): Promise<FriendCache | undefined> =>
      ipcRenderer.invoke('store:getCache', handle),
    getAllCache: (): Promise<Record<string, FriendCache>> => ipcRenderer.invoke('store:getAllCache'),
    clearCache: (): Promise<boolean> => ipcRenderer.invoke('store:clearCache'),
    getSettings: (): Promise<Settings> => ipcRenderer.invoke('store:getSettings'),
    setSettings: (settings: Settings): Promise<boolean> =>
      ipcRenderer.invoke('store:setSettings', settings),
    getTeams: (): Promise<Team[]> => ipcRenderer.invoke('store:getTeams'),
    addTeam: (team: Team): Promise<boolean> => ipcRenderer.invoke('store:addTeam', team),
    updateTeam: (team: Team): Promise<boolean> => ipcRenderer.invoke('store:updateTeam', team),
    removeTeam: (id: string): Promise<boolean> => ipcRenderer.invoke('store:removeTeam', id),
    getWindowState: (): Promise<WindowState | null> => ipcRenderer.invoke('store:getWindowState'),
    setWindowState: (state: WindowState): Promise<boolean> =>
      ipcRenderer.invoke('store:setWindowState', state),
    getViewedRatings: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke('store:getViewedRatings'),
    setViewedRating: (handle: string, rating: number): Promise<boolean> =>
      ipcRenderer.invoke('store:setViewedRating', handle, rating),
    removeViewedRating: (handle: string): Promise<boolean> =>
      ipcRenderer.invoke('store:removeViewedRating', handle),
    // 数据备份与迁移
    exportBackup: (): Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }> =>
      ipcRenderer.invoke('store:exportBackup'),
    importBackup: (): Promise<BackupResult> => ipcRenderer.invoke('store:importBackup'),
    // 好友分组定义
    getGroupDefs: (): Promise<string[]> => ipcRenderer.invoke('store:getGroupDefs'),
    setGroupDefs: (groups: string[]): Promise<boolean> => ipcRenderer.invoke('store:setGroupDefs', groups),
    setFriendGroups: (handle: string, groups: string[]): Promise<boolean> =>
      ipcRenderer.invoke('store:setFriendGroups', handle, groups),
  },
  updater: {
    checkForUpdates: (): Promise<{ status: UpdateStatus; info: UpdateInfo | null; error: string | null; appVersion: string }> =>
      ipcRenderer.invoke('updater:checkForUpdates'),
    installUpdate: (): Promise<boolean> => ipcRenderer.invoke('updater:installUpdate'),
    getStatus: (): Promise<{ status: UpdateStatus; info: UpdateInfo | null; error: string | null; appVersion: string }> =>
      ipcRenderer.invoke('updater:getStatus'),
    onStatus: (
      callback: (data: { status: UpdateStatus; info: UpdateInfo | null; error: string | null }) => void,
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: { status: UpdateStatus; info: UpdateInfo | null; error: string | null },
      ) => callback(data);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
    onProgress: (callback: (progress: UpdateProgress) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, data: UpdateProgress) => callback(data);
      ipcRenderer.on('updater:progress', handler);
      return () => ipcRenderer.removeListener('updater:progress', handler);
    },
  },
  notify: {
    test: (): Promise<boolean> => ipcRenderer.invoke('notify:test'),
    checkContests: (): Promise<boolean> => ipcRenderer.invoke('notify:checkContests'),
    // 通知中心历史
    getHistory: (): Promise<NotificationItem[]> => ipcRenderer.invoke('notify:getHistory'),
    clearHistory: (): Promise<boolean> => ipcRenderer.invoke('notify:clearHistory'),
    markRead: (id: string): Promise<boolean> => ipcRenderer.invoke('notify:markRead', id),
    markAllRead: (): Promise<boolean> => ipcRenderer.invoke('notify:markAllRead'),
    // 主进程在产生新通知时广播, 渲染端订阅以更新红点角标
    onNew: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('notify:new', handler);
      return () => ipcRenderer.removeListener('notify:new', handler);
    },
  },
  predict: {
    contest: (contestId: number, contestName: string): Promise<ContestPrediction> =>
      ipcRenderer.invoke('predict:contest', contestId, contestName),
  },
  problem: {
    getList: (): Promise<ProblemListItem[]> => ipcRenderer.invoke('problem:getList'),
    refreshList: (): Promise<ProblemListItem[]> => ipcRenderer.invoke('problem:refreshList'),
    // 按比赛编号获取该场比赛题目清单（按比赛顺序）
    getContestProblems: (
      contestId: number,
      force?: boolean,
    ): Promise<ProblemListItem[]> => ipcRenderer.invoke('problem:getContestProblems', contestId, force),
    getStatement: (contestId: number, index: string): Promise<ProblemStatement> =>
      ipcRenderer.invoke('problem:getStatement', contestId, index),
    runCode: (code: string, samples: SampleTest[]): Promise<RunAllResult> =>
      ipcRenderer.invoke('problem:runCode', code, samples),
    getCode: (id: string): Promise<string | null> => ipcRenderer.invoke('problem:getCode', id),
    setCode: (id: string, code: string): Promise<boolean> => ipcRenderer.invoke('problem:setCode', id, code),
    detectCompiler: (): Promise<string | null> => ipcRenderer.invoke('problem:detectCompiler'),
    // 获取当前生效的题目缓存目录
    getCacheDir: (): Promise<string> => ipcRenderer.invoke('problem:getCacheDir'),
    // 弹出系统目录选择框, 返回选中的目录路径（取消为 null）
    selectCacheDir: (): Promise<string | null> => ipcRenderer.invoke('problem:selectCacheDir'),
    // 更换题目缓存目录（自动迁移已保存的题目与代码）
    setCacheDir: (
      newDir: string,
    ): Promise<{ ok: boolean; moved: number; targetDir: string; errors: string[] }> =>
      ipcRenderer.invoke('problem:setCacheDir', newDir),
    // 清空题目缓存（题面 / 题目清单 / 保存的代码）
    clearCache: (): Promise<{ ok: boolean; removed: number; errors: string[] }> =>
      ipcRenderer.invoke('problem:clearCache'),
    // 用系统默认浏览器打开指定题目原题页
    openInBrowser: (contestId: number, index: string): Promise<void> =>
      ipcRenderer.invoke('problem:openInBrowser', contestId, index),
    // 打开系统默认浏览器到 Codeforces（登录 / 做题等）
    login: (): Promise<void> => ipcRenderer.invoke('problem:login'),
    translate: (contestId: number, index: string, force?: boolean): Promise<ProblemStatement> =>
      ipcRenderer.invoke('problem:translate', contestId, index, force),
    // 本地收藏题目(独立于 AI 推荐题单)
    getFavorites: (): Promise<FavoriteProblem[]> => ipcRenderer.invoke('problem:getFavorites'),
    addFavorite: (item: FavoriteProblem): Promise<boolean> => ipcRenderer.invoke('problem:addFavorite', item),
    removeFavorite: (contestId: number, index: string): Promise<boolean> =>
      ipcRenderer.invoke('problem:removeFavorite', contestId, index),
    isFavorite: (contestId: number, index: string): Promise<boolean> =>
      ipcRenderer.invoke('problem:isFavorite', contestId, index),
    // 开启虚拟比赛: 返回该场比赛题目清单与起止时间
    startVirtual: (contestId: number, force?: boolean): Promise<ProblemListItem[]> =>
      ipcRenderer.invoke('problem:getContestProblems', contestId, force),
  },
  contest: {
    // 导出比赛列表为 .ics 日历文件
    exportIcs: (contests: CFContest[]): Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }> =>
      ipcRenderer.invoke('contest:exportIcs', contests),
  },
  ai: {
    analyzeTeam: (teamId: string, settings?: Settings): Promise<TeamAIResult> =>
      ipcRenderer.invoke('ai:analyzeTeam', teamId, settings),
    getTeamAIHistory: (teamId: string): Promise<TeamAIResult[]> =>
      ipcRenderer.invoke('ai:getTeamAIHistory', teamId),
    removeTeamAIResult: (teamId: string, id: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:removeTeamAIResult', teamId, id),
    clearTeamAIHistory: (teamId: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:clearTeamAIHistory', teamId),
    exportReport: (teamName: string, result: TeamAIResult, format: AIExportFormat, imageData?: string, goal?: string): Promise<AIExportResult> =>
      ipcRenderer.invoke('ai:exportReport', teamName, result, format, imageData, goal),
    testConnection: (settings?: Settings): Promise<AIConnectionResult> =>
      ipcRenderer.invoke('ai:testConnection', settings),
    // 主进程分析写盘后推送完成事件, 供渲染端(即使组件已卸载)恢复状态/重载历史
    onTeamAnalysisDone: (
      handler: (e: IpcRendererEvent, payload: { teamId: string }) => void
    ): (() => void) => {
      ipcRenderer.on('ai:teamAnalysisDone', handler);
      return () => ipcRenderer.removeListener('ai:teamAnalysisDone', handler);
    },
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (e) {
  console.error('Preload script error:', e);
}

export type Api = typeof api;