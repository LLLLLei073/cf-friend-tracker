import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  CFContest,
  CFRatingChange,
  CFSubmission,
  CFUser,
  Friend,
  FriendCache,
  RefreshProgress,
  Settings,
  SyncResult,
  Team,
  WindowState,
  UpdateStatus,
  UpdateInfo,
  UpdateProgress,
  ContestPrediction,
} from '../shared/types';

const api = {
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
    refreshMyProfile: (): Promise<CFUser | null> => ipcRenderer.invoke('cf:refreshMyProfile'),
    syncFriendsAuto: (): Promise<SyncResult> => ipcRenderer.invoke('cf:syncFriendsAuto'),
    getContests: (): Promise<CFContest[]> => ipcRenderer.invoke('cf:getContests'),
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
  },
  predict: {
    contest: (contestId: number, contestName: string): Promise<ContestPrediction> =>
      ipcRenderer.invoke('predict:contest', contestId, contestName),
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (e) {
  console.error('Preload script error:', e);
}

export type Api = typeof api;
