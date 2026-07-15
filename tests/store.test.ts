import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-store — 用内存 Map 模拟
// 注意: store.ts 使用 `import Store from 'electron-store'`(默认导入),
// 因此 mock 工厂必须返回带 `default` 键的对象; 同时需在构造函数中采纳
// `defaults` 选项, 以匹配真实 electron-store 的默认值行为。
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown> = {};
      private defaults: Record<string, unknown> = {};
      constructor(options?: { defaults?: Record<string, unknown> }) {
        if (options?.defaults) {
          this.defaults = { ...options.defaults };
        }
      }
      get(key: string, defaultValue?: unknown) {
        if (key in this.data) return this.data[key];
        if (key in this.defaults) return this.defaults[key];
        return defaultValue;
      }
      set(key: string, value: unknown) {
        this.data[key] = value;
      }
      delete(key: string) {
        delete this.data[key];
      }
      clear() {
        this.data = {};
      }
    },
  };
});

import { StoreManager } from '../src/main/store';

describe('StoreManager', () => {
  let store: StoreManager;

  beforeEach(() => {
    store = new StoreManager();
  });

  describe('friends', () => {
    it('starts empty', () => {
      expect(store.getFriends()).toEqual([]);
    });

    it('adds a friend', () => {
      store.addFriend({ handle: 'tourist', alias: 'Gennady', addedAt: Date.now() });
      const friends = store.getFriends();
      expect(friends).toHaveLength(1);
      expect(friends[0].handle).toBe('tourist');
    });

    it('prevents duplicate handles', () => {
      store.addFriend({ handle: 'tourist', alias: '', addedAt: 1 });
      store.addFriend({ handle: 'tourist', alias: 'new', addedAt: 2 });
      expect(store.getFriends()).toHaveLength(1);
      expect(store.getFriends()[0].alias).toBe('');
    });

    it('removes a friend', () => {
      store.addFriend({ handle: 'tourist', alias: '', addedAt: 1 });
      store.removeFriend('tourist');
      expect(store.getFriends()).toEqual([]);
    });

    it('removes cache when removing friend', () => {
      store.addFriend({ handle: 'tourist', alias: '', addedAt: 1 });
      store.setCache('tourist', {
        handle: 'tourist',
        info: { handle: 'tourist', lastOnlineTimeSeconds: 0, registrationTimeSeconds: 0 },
        ratingHistory: [],
        recentSubmissions: [],
        cachedAt: Date.now(),
      });
      store.removeFriend('tourist');
      expect(store.getCache('tourist')).toBeUndefined();
    });
  });

  describe('cache', () => {
    it('returns undefined for missing cache', () => {
      expect(store.getCache('nobody')).toBeUndefined();
    });

    it('stores and retrieves cache', () => {
      const cache = {
        handle: 'benq',
        info: { handle: 'benq', lastOnlineTimeSeconds: 0, registrationTimeSeconds: 0 },
        ratingHistory: [],
        recentSubmissions: [],
        cachedAt: 12345,
      };
      store.setCache('benq', cache);
      expect(store.getCache('benq')).toEqual(cache);
    });

    it('clears all caches', () => {
      store.setCache('a', {
        handle: 'a', info: { handle: 'a', lastOnlineTimeSeconds: 0, registrationTimeSeconds: 0 },
        ratingHistory: [], recentSubmissions: [], cachedAt: 1,
      });
      store.clearCache();
      expect(store.getCache('a')).toBeUndefined();
    });
  });

  describe('settings', () => {
    it('returns defaults', () => {
      const s = store.getSettings();
      expect(s.myHandle).toBe('');
      expect(s.apiKey).toBe('');
      expect(s.lastRefreshAt).toBe(0);
    });

    it('saves settings', () => {
      store.setSettings({ myHandle: 'me', apiKey: 'k', apiSecret: 's', lastRefreshAt: 99 });
      expect(store.getSettings().myHandle).toBe('me');
      expect(store.getSettings().lastRefreshAt).toBe(99);
    });
  });
});
