import Store from 'electron-store';
import type { Friend, FriendCache, Settings, Team, WindowState } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  myHandle: '',
  apiKey: '',
  apiSecret: '',
  lastRefreshAt: 0,
  theme: 'system',
  defaultPage: 'friends',
  lastViewedChangelog: '',
  notifyRatingChange: true,
  notifyContestStart: true,
  contestNotifyMinutes: 30,
};

// 持久化数据的 schema, 用于让 electron-store 的 get/set 获得类型安全
type StoreSchema = {
  friends: Friend[];
  cache: Record<string, FriendCache>;
  settings: Settings;
  teams: Team[];
  windowState: WindowState | null;
  viewedRatings: Record<string, number>;
};

// 安全写入: electron-store 的原子写入在 Windows 上可能因杀毒软件等触发 EPERM。
// 全局 uncaughtException 已兜底, 这里仅 try-catch 记录错误, 不做同步重试
// (EPERM 通常是瞬时的, 同步上下文中无法用 setTimeout 等待)。
function safeSet<Key extends keyof StoreSchema>(
  store: Store<StoreSchema>,
  key: Key,
  value: StoreSchema[Key],
): void {
  try {
    store.set(key, value);
  } catch (e) {
    console.error(`Store write failed for key "${key}":`, (e as Error).message);
  }
}

export class StoreManager {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'cf-friends-data',
      defaults: {
        friends: [],
        cache: {},
        settings: DEFAULT_SETTINGS,
        teams: [],
        windowState: null,
        viewedRatings: {},
      },
    });
  }

  // ---- Friends ----
  getFriends(): Friend[] {
    return this.store.get('friends');
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
    const cache = this.store.get('cache');
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

  // 切换好友的特别关注状态
  setFriendStarred(handle: string, starred: boolean): boolean {
    const friends = this.getFriends();
    const idx = friends.findIndex((f) => f.handle === handle);
    if (idx < 0) return false;
    friends[idx] = { ...friends[idx], starred };
    safeSet(this.store, 'friends', friends);
    return true;
  }

  // ---- Cache ----
  getCache(handle: string): FriendCache | undefined {
    const cache = this.store.get('cache');
    return cache[handle];
  }

  setCache(handle: string, data: FriendCache): void {
    const cache = this.store.get('cache');
    cache[handle] = data;
    safeSet(this.store, 'cache', cache);
  }

  getAllCache(): Record<string, FriendCache> {
    return this.store.get('cache');
  }

  clearCache(): void {
    safeSet(this.store, 'cache', {});
  }

  // ---- Settings ----
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.store.get('settings') };
  }

  setSettings(settings: Settings): void {
    safeSet(this.store, 'settings', settings);
  }

  // ---- Teams ----
  getTeams(): Team[] {
    return this.store.get('teams');
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
    return this.store.get('windowState');
  }

  setWindowState(state: WindowState): void {
    safeSet(this.store, 'windowState', state);
  }

  // ---- Viewed Ratings (for rating change indicator) ----
  getViewedRatings(): Record<string, number> {
    return this.store.get('viewedRatings');
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