import Store from 'electron-store';
import type { Friend, FriendCache, Settings, Team, WindowState } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  myHandle: '',
  apiKey: '',
  apiSecret: '',
  lastRefreshAt: 0,
};

// 安全写入: electron-store 的原子写入在 Windows 上可能因杀毒软件等触发 EPERM
// 包装 store.set 使其在失败时自动重试几次, 避免崩溃
function safeSet<T>(store: Store, key: string, value: T, retries = 3): void {
  for (let i = 0; i < retries; i++) {
    try {
      store.set(key, value);
      return;
    } catch (e) {
      const err = e as Error;
      if (err.message?.includes('EPERM') && i < retries - 1) {
        // 等待后重试
        const wait = (i + 1) * 200;
        const start = Date.now();
        while (Date.now() - start < wait) {
          // 同步等待
        }
        continue;
      }
      // 最后一次仍失败, 记录但不崩溃
      console.error(`Store write failed for key "${key}":`, err.message);
      return;
    }
  }
}

export class StoreManager {
  private store: Store;

  constructor() {
    this.store = new Store({
      name: 'cf-friends-data',
      defaults: {
        friends: [] as Friend[],
        cache: {} as Record<string, FriendCache>,
        settings: DEFAULT_SETTINGS,
        teams: [] as Team[],
        windowState: null as WindowState | null,
        viewedRatings: {} as Record<string, number>,
      },
    });
  }

  // ---- Friends ----
  getFriends(): Friend[] {
    return this.store.get('friends') as Friend[];
  }

  addFriend(friend: Friend): boolean {
    const friends = this.getFriends();
    if (friends.some((f) => f.handle === friend.handle)) {
      return false; // duplicate
    }
    friends.push(friend);
    safeSet(this.store, 'friends', friends);
    return true;
  }

  removeFriend(handle: string): void {
    const friends = this.getFriends().filter((f) => f.handle !== handle);
    safeSet(this.store, 'friends', friends);
    const cache = this.store.get('cache') as Record<string, FriendCache>;
    delete cache[handle];
    safeSet(this.store, 'cache', cache);
  }

  updateFriend(handle: string, alias: string): boolean {
    const friends = this.getFriends();
    const idx = friends.findIndex((f) => f.handle === handle);
    if (idx < 0) return false;
    friends[idx] = { ...friends[idx], alias };
    safeSet(this.store, 'friends', friends);
    return true;
  }

  // ---- Cache ----
  getCache(handle: string): FriendCache | undefined {
    const cache = this.store.get('cache') as Record<string, FriendCache>;
    return cache[handle];
  }

  setCache(handle: string, data: FriendCache): void {
    const cache = this.store.get('cache') as Record<string, FriendCache>;
    cache[handle] = data;
    safeSet(this.store, 'cache', cache);
  }

  getAllCache(): Record<string, FriendCache> {
    return this.store.get('cache') as Record<string, FriendCache>;
  }

  clearCache(): void {
    safeSet(this.store, 'cache', {});
  }

  // ---- Settings ----
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...(this.store.get('settings') as Settings) };
  }

  setSettings(settings: Settings): void {
    safeSet(this.store, 'settings', settings);
  }

  // ---- Util ----
  clearAll(): void {
    this.store.clear();
  }

  // ---- Teams ----
  getTeams(): Team[] {
    return this.store.get('teams') as Team[];
  }

  addTeam(team: Team): boolean {
    const teams = this.getTeams();
    if (teams.some((t) => t.id === team.id)) return false;
    teams.push(team);
    safeSet(this.store, 'teams', teams);
    return true;
  }

  updateTeam(team: Team): void {
    const teams = this.getTeams();
    const idx = teams.findIndex((t) => t.id === team.id);
    if (idx >= 0) {
      teams[idx] = team;
      safeSet(this.store, 'teams', teams);
    }
  }

  removeTeam(id: string): void {
    const teams = this.getTeams().filter((t) => t.id !== id);
    safeSet(this.store, 'teams', teams);
  }

  // ---- Window State ----
  getWindowState(): WindowState | null {
    return this.store.get('windowState') as WindowState | null;
  }

  setWindowState(state: WindowState): void {
    safeSet(this.store, 'windowState', state);
  }

  // ---- Viewed Ratings (for rating change indicator) ----
  getViewedRatings(): Record<string, number> {
    return this.store.get('viewedRatings') as Record<string, number>;
  }

  setViewedRating(handle: string, rating: number): void {
    const viewed = this.getViewedRatings();
    viewed[handle] = rating;
    safeSet(this.store, 'viewedRatings', viewed);
  }

  removeViewedRating(handle: string): void {
    const viewed = this.getViewedRatings();
    delete viewed[handle];
    safeSet(this.store, 'viewedRatings', viewed);
  }
}
