import { contextBridge, ipcRenderer } from 'electron';
import type { Friend, Settings } from '../shared/types';

const api = {
  cf: {
    getUserInfo: (handles: string[]) => ipcRenderer.invoke('cf:getUserInfo', handles),
    getUserRating: (handle: string) => ipcRenderer.invoke('cf:getUserRating', handle),
    getUserStatus: (handle: string, count?: number) =>
      ipcRenderer.invoke('cf:getUserStatus', handle, count),
    getFriends: (handle: string, apiKey: string, apiSecret: string) =>
      ipcRenderer.invoke('cf:getFriends', handle, apiKey, apiSecret),
    refreshAll: () => ipcRenderer.invoke('cf:refreshAll'),
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
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (e) {
  console.error('Preload script error:', e);
}

export type Api = typeof api;
