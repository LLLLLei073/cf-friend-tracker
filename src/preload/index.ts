import { contextBridge, ipcRenderer } from 'electron';
import type { Friend, Settings, Team } from '../shared/types';

export interface RefreshProgress {
  handle?: string;
  completed: number;
  total: number;
  errors: string[];
}

const api = {
  cf: {
    getUserInfo: (handles: string[]) => ipcRenderer.invoke('cf:getUserInfo', handles),
    getUserRating: (handle: string) => ipcRenderer.invoke('cf:getUserRating', handle),
    getUserStatus: (handle: string, count?: number) =>
      ipcRenderer.invoke('cf:getUserStatus', handle, count),
    getFriends: (handle: string, apiKey: string, apiSecret: string) =>
      ipcRenderer.invoke('cf:getFriends', handle, apiKey, apiSecret),
    refreshAll: () => ipcRenderer.invoke('cf:refreshAll'),
    refreshMyProfile: () => ipcRenderer.invoke('cf:refreshMyProfile'),
    importFriendsAuto: () => ipcRenderer.invoke('cf:importFriendsAuto'),
    onRefreshProgress: (callback: (progress: RefreshProgress) => void) => {
      const handler = (_event: unknown, data: RefreshProgress) => callback(data);
      ipcRenderer.on('cf:refreshProgress', handler);
      return () => ipcRenderer.removeListener('cf:refreshProgress', handler);
    },
  },
  store: {
    getFriends: () => ipcRenderer.invoke('store:getFriends'),
    addFriend: (friend: Friend) => ipcRenderer.invoke('store:addFriend', friend),
    removeFriend: (handle: string) => ipcRenderer.invoke('store:removeFriend', handle),
    getCache: (handle: string) => ipcRenderer.invoke('store:getCache', handle),
    getAllCache: () => ipcRenderer.invoke('store:getAllCache'),
    clearCache: () => ipcRenderer.invoke('store:clearCache'),
    getSettings: () => ipcRenderer.invoke('store:getSettings'),
    setSettings: (settings: Settings) => ipcRenderer.invoke('store:setSettings', settings),
    getTeams: () => ipcRenderer.invoke('store:getTeams'),
    addTeam: (team: Team) => ipcRenderer.invoke('store:addTeam', team),
    updateTeam: (team: Team) => ipcRenderer.invoke('store:updateTeam', team),
    removeTeam: (id: string) => ipcRenderer.invoke('store:removeTeam', id),
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (e) {
  console.error('Preload script error:', e);
}

export type Api = typeof api;
