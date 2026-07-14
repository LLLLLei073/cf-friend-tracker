import Store from 'electron-store';
import type { Friend, FriendCache, Settings, Team } from '../shared/types';

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
}
