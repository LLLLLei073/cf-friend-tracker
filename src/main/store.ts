import Store from 'electron-store';
import type { Friend, FriendCache, Settings, Team, WindowState } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  myHandle: '',
  apiKey: '',
  apiSecret: '',
  lastRefreshAt: 0,
};

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
    this.store.set('friends', friends);
    return true;
  }

  removeFriend(handle: string): void {
    const friends = this.getFriends().filter((f) => f.handle !== handle);
    this.store.set('friends', friends);
    // also remove cache
    const cache = this.store.get('cache') as Record<string, FriendCache>;
    delete cache[handle];
    this.store.set('cache', cache);
  }

  updateFriend(handle: string, alias: string): boolean {
    const friends = this.getFriends();
    const idx = friends.findIndex((f) => f.handle === handle);
    if (idx < 0) return false;
    friends[idx] = { ...friends[idx], alias };
    this.store.set('friends', friends);
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
    this.store.set('cache', cache);
  }

  getAllCache(): Record<string, FriendCache> {
    return this.store.get('cache') as Record<string, FriendCache>;
  }

  clearCache(): void {
    this.store.set('cache', {});
  }

  // ---- Settings ----
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...(this.store.get('settings') as Settings) };
  }

  setSettings(settings: Settings): void {
    this.store.set('settings', settings);
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
    this.store.set('teams', teams);
    return true;
  }

  updateTeam(team: Team): void {
    const teams = this.getTeams();
    const idx = teams.findIndex((t) => t.id === team.id);
    if (idx >= 0) {
      teams[idx] = team;
      this.store.set('teams', teams);
    }
  }

  removeTeam(id: string): void {
    const teams = this.getTeams().filter((t) => t.id !== id);
    this.store.set('teams', teams);
  }

  // ---- Window State ----
  getWindowState(): WindowState | null {
    return this.store.get('windowState') as WindowState | null;
  }

  setWindowState(state: WindowState): void {
    this.store.set('windowState', state);
  }

  // ---- Viewed Ratings (for rating change indicator) ----
  getViewedRatings(): Record<string, number> {
    return this.store.get('viewedRatings') as Record<string, number>;
  }

  setViewedRating(handle: string, rating: number): void {
    const viewed = this.getViewedRatings();
    viewed[handle] = rating;
    this.store.set('viewedRatings', viewed);
  }

  removeViewedRating(handle: string): void {
    const viewed = this.getViewedRatings();
    delete viewed[handle];
    this.store.set('viewedRatings', viewed);
  }
}
