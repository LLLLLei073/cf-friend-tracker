import Store from 'electron-store';
import { randomUUID } from 'crypto';
import type {
  Friend,
  FriendCache,
  Settings,
  Team,
  TeamAIResult,
  WindowState,
  BackupData,
  BackupResult,
  NotificationItem,
} from '../shared/types';

// 通知中心历史记录上限: 超过自动裁剪旧的, 避免无限增长
const NOTIFICATION_LIMIT = 200;

// ---- AI Key 安全存储(可选使用系统凭据库 keytar) ----
// keytar 是原生模块, 未必安装/正确编译。这里用动态 require + 容错:
// 装了就把 aiApiKey 存系统凭据库(更安全), 没装就回退到 electron-store 明文。
// keytar 未安装时不影响应用其他功能。
let keytar: typeof import('keytar') | null = null;
try {
  // externalizeDepsPlugin 会把 keytar 当外部依赖, 运行时从 node_modules 解析
  keytar = require('keytar');
} catch {
  keytar = null;
}
const KEYTAR_SERVICE = 'cf-friend-tracker';
const KEYTAR_ACCOUNT = 'aiApiKey';
// 标记是否已把明文 key 迁移到凭据库, 避免重复迁移
let keytarMigrated = false;

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
  launchRefreshStarredOnly: true,
  aiApiBase: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  cppCompilerPath: '',
  problemCacheDir: '',
  enableTray: false,
};

// 持久化数据的 schema, 用于让 electron-store 的 get/set 获得类型安全
type StoreSchema = {
  friends: Friend[];
  cache: Record<string, FriendCache>;
  settings: Settings;
  teams: Team[];
  windowState: WindowState | null;
  viewedRatings: Record<string, number>;
  aiResults: Record<string, TeamAIResult[]>; // 团队 AI 分析历史, key = teamId, 新的在前
  notifications: NotificationItem[]; // 应用内通知中心历史, 新的在前
  groupDefs: string[]; // 好友自定义分组名称列表
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
        aiResults: {},
        notifications: [],
        groupDefs: [],
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
  // 同步读取设置(从 electron-store)。aiApiKey 字段在 keytar 可用时可能为空
  // (已迁移到系统凭据库), 需要真实 key 时用 getApiKeyAsync()。
  // 不需要 aiApiKey 的场景(通知/预测/窗口等)直接用此同步方法即可。
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.store.get('settings') };
  }

  // 异步读取 aiApiKey: 优先系统凭据库(keytar), 回退 store 明文。
  async getApiKeyAsync(): Promise<string> {
    if (keytar) {
      try {
        const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
        if (stored) return stored;
      } catch {
        /* 回退明文 */
      }
    }
    return this.store.get('settings').aiApiKey ?? '';
  }

  // 异步写入设置: keytar 可用时把 aiApiKey 存入凭据库并清空明文, 否则明文落盘。
  async setSettings(settings: Settings): Promise<void> {
    if (keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, settings.aiApiKey ?? '');
        // 明文不落盘, 仅存其余字段
        safeSet(this.store, 'settings', { ...settings, aiApiKey: '' });
        return;
      } catch {
        // 凭据库写入失败: 回退明文
      }
    }
    safeSet(this.store, 'settings', settings);
  }

  // 一次性迁移: 若 keytar 可用且 store 里有明文 aiApiKey, 迁入凭据库并清空明文。
  // 应在应用启动时(await)调用一次。
  async migrateApiKeyIfNeeded(): Promise<void> {
    if (!keytar || keytarMigrated) return;
    const s = this.store.get('settings');
    if (!s.aiApiKey) {
      keytarMigrated = true;
      return;
    }
    try {
      const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (stored === null) {
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, s.aiApiKey);
      }
      safeSet(this.store, 'settings', { ...s, aiApiKey: '' });
    } catch {
      // 迁移失败保留明文
    }
    keytarMigrated = true;
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

  // ---- Team AI Results (团队 AI 分析历史记录, 每队一个数组, 新的在前) ----
  getTeamAIHistory(teamId: string): TeamAIResult[] {
    const results = this.store.get('aiResults');
    const val = results[teamId] as unknown;
    if (!val) return [];
    // 向后兼容: 旧版存的是单个对象
    const raw: TeamAIResult[] = Array.isArray(val)
      ? (val as TeamAIResult[])
      : [val as TeamAIResult];
    // 为缺少 id 的旧记录补全稳定 id 并持久化, 避免删除/React key 依赖时间戳导致碰撞
    let changed = false;
    const normalized = raw.map((r) => {
      if (!r.id) {
        changed = true;
        return { ...r, id: randomUUID() };
      }
      return r;
    });
    if (changed) {
      results[teamId] = normalized;
      safeSet(this.store, 'aiResults', results);
    }
    return normalized;
  }

  addTeamAIResult(teamId: string, result: TeamAIResult): void {
    const results = this.store.get('aiResults');
    const existing = results[teamId] as unknown;
    const arr: TeamAIResult[] = Array.isArray(existing)
      ? (existing as TeamAIResult[])
      : existing
        ? [existing as TeamAIResult]
        : [];
    arr.unshift(result);
    // 限制最多保留 20 条, 避免无限增长
    if (arr.length > 20) arr.length = 20;
    results[teamId] = arr;
    safeSet(this.store, 'aiResults', results);
  }

  removeTeamAIResult(teamId: string, id: string): void {
    const results = this.store.get('aiResults');
    const existing = results[teamId] as unknown;
    if (!existing) return;
    const arr = (
      Array.isArray(existing) ? (existing as TeamAIResult[]) : [existing as TeamAIResult]
    ).filter((r) => r.id !== id);
    results[teamId] = arr;
    safeSet(this.store, 'aiResults', results);
  }

  clearTeamAIHistory(teamId: string): void {
    const results = this.store.get('aiResults');
    delete results[teamId];
    safeSet(this.store, 'aiResults', results);
  }

  // ---- 通知中心 ----
  getNotifications(): NotificationItem[] {
    return this.store.get('notifications');
  }

  addNotification(item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>): NotificationItem {
    const list = this.store.get('notifications');
    const full: NotificationItem = {
      ...item,
      id: randomUUID(),
      createdAt: Date.now(),
      read: false,
    };
    list.unshift(full);
    if (list.length > NOTIFICATION_LIMIT) list.length = NOTIFICATION_LIMIT;
    safeSet(this.store, 'notifications', list);
    return full;
  }

  markNotificationRead(id: string): void {
    const list = this.store.get('notifications');
    const idx = list.findIndex((n) => n.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], read: true };
      safeSet(this.store, 'notifications', list);
    }
  }

  markAllNotificationsRead(): void {
    const list = this.store.get('notifications');
    const changed = list.some((n) => !n.read);
    if (!changed) return;
    safeSet(this.store, 'notifications', list.map((n) => ({ ...n, read: true })));
  }

  clearNotifications(): void {
    safeSet(this.store, 'notifications', []);
  }

  // ---- 好友分组定义 ----
  getGroupDefs(): string[] {
    return this.store.get('groupDefs');
  }

  setGroupDefs(groups: string[]): void {
    safeSet(this.store, 'groupDefs', Array.from(new Set(groups.filter((g) => g && g.trim()))));
  }

  // 设置某好友所属的分组列表
  setFriendGroups(handle: string, groups: string[]): boolean {
    const friends = this.getFriends();
    const idx = friends.findIndex((f) => f.handle === handle);
    if (idx < 0) return false;
    friends[idx] = { ...friends[idx], groups: Array.from(new Set(groups.filter((g) => g && g.trim()))) };
    safeSet(this.store, 'friends', friends);
    return true;
  }

  // ---- 数据备份与迁移 ----
  // 导出全部持久化数据为可序列化对象(用于写文件迁移到另一台机器)
  exportAll(): BackupData {
    return {
      version: 1,
      exportedAt: Date.now(),
      friends: this.getFriends(),
      cache: this.getAllCache(),
      settings: this.getSettings(),
      teams: this.getTeams(),
      windowState: this.getWindowState(),
      viewedRatings: this.getViewedRatings(),
      aiResults: this.store.get('aiResults'),
      problemCacheDir: this.getSettings().problemCacheDir,
    };
  }

  // 从备份对象整体写回(用于导入)。settings.problemCacheDir 仅记录,
  // 题面/代码文件的实际迁移由 ipc 层调用 problem-store.migrateProblemCache 完成。
  importAll(data: Partial<BackupData>): BackupResult {
    try {
      if (!data || typeof data !== 'object') return { ok: false, error: '备份文件格式无效' };
      if (Array.isArray(data.friends)) safeSet(this.store, 'friends', data.friends);
      if (data.cache && typeof data.cache === 'object') safeSet(this.store, 'cache', data.cache);
      if (data.settings && typeof data.settings === 'object') {
        // 与默认值合并, 保证新字段有默认值, 向后兼容旧备份
        const merged = { ...DEFAULT_SETTINGS, ...data.settings };
        safeSet(this.store, 'settings', merged);
      }
      if (Array.isArray(data.teams)) safeSet(this.store, 'teams', data.teams);
      if (data.windowState) safeSet(this.store, 'windowState', data.windowState);
      if (data.viewedRatings && typeof data.viewedRatings === 'object')
        safeSet(this.store, 'viewedRatings', data.viewedRatings);
      if (data.aiResults && typeof data.aiResults === 'object')
        safeSet(this.store, 'aiResults', data.aiResults);
      return {
        ok: true,
        imported: {
          friends: Array.isArray(data.friends) ? data.friends.length : 0,
          teams: Array.isArray(data.teams) ? data.teams.length : 0,
          cacheMoved: 0,
        },
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}