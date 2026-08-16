import { Notification, BrowserWindow } from 'electron';
import { StoreManager } from './store';
import { fetchContests, fetchUserInfoSafe, fetchUserRating, fetchUserStatus } from './cf-api';
import type { FriendCache, CFContest, Settings, NotificationItem } from '../shared/types';

// 已通知过的比赛提醒（避免重复通知）
const notifiedContests = new Set<number>();
// 已通知过的比赛开始通知
const notifiedContestStarted = new Set<number>();

/**
 * 统一的通知出口: 既弹系统通知, 又写入应用内通知中心历史, 并向渲染端广播红点。
 * type / handle / link 用于在通知中心里分类与点击跳转。
 */
function pushNotification(
  store: StoreManager,
  type: NotificationItem['type'],
  title: string,
  body: string,
  opts: { handle?: string; link?: string; onClick?: () => void } = {},
): void {
  // 1. 系统通知(若支持)
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: false });
    const clickHandler = opts.onClick ?? (() => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.show();
        win.focus();
      });
    });
    notification.on('click', clickHandler);
    notification.show();
  }
  // 2. 写入应用内通知中心历史 + 广播红点
  store.addNotification({ type, title, body, handle: opts.handle, link: opts.link });
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notify:new'));
}

/**
 * 检测好友 Rating 变化并发送通知。
 * 对比刷新前后的缓存数据。
 */
export function checkRatingChanges(
  store: StoreManager,
  oldCaches: Record<string, FriendCache | undefined>,
  settings: Settings
): void {
  if (!settings.notifyRatingChange) return;

  const newCaches = store.getAllCache();

  for (const [handle, newCache] of Object.entries(newCaches)) {
    const oldCache = oldCaches[handle];
    if (!oldCache || !newCache) continue;

    const oldRating = oldCache.info?.rating;
    const newRating = newCache.info?.rating;

    if (oldRating === undefined || newRating === undefined) continue;
    if (oldRating === newRating) continue;

    const delta = newRating - oldRating;
    const direction = delta > 0 ? '↑' : '↓';
    const friendAlias = store.getFriends().find((f) => f.handle === handle)?.alias || handle;

    const title = `${friendAlias} Rating ${direction} ${Math.abs(delta)}`;
    const body = `${oldRating} → ${newRating}${delta > 0 ? ' (涨了!)' : ' (掉了)'}`;

    pushNotification(store, 'rating', title, body, { handle, link: `/friends/${handle}` });
  }
}

/**
 * 检查即将开始的比赛并发送通知。
 * 在应用启动后和定时刷新时调用。
 */
export async function checkContestReminders(store: StoreManager): Promise<void> {
  const settings = store.getSettings();
  if (!settings.notifyContestStart) return;

  try {
    const contests = await fetchContests();
    const now = Math.floor(Date.now() / 1000);
    const notifySeconds = settings.contestNotifyMinutes * 60;

    for (const contest of contests) {
      if (contest.phase !== 'BEFORE') continue;

      const timeUntilStart = contest.startTimeSeconds - now;
      // 在赛前 X 分钟窗口内（且尚未通知过）
      if (timeUntilStart > 0 && timeUntilStart <= notifySeconds) {
        if (notifiedContests.has(contest.id)) continue;
        notifiedContests.add(contest.id);

        const minutes = Math.floor(timeUntilStart / 60);
        const title = `比赛提醒: ${contest.name}`;
        const body = `${minutes} 分钟后开始，点击查看`;

        pushNotification(store, 'contest', title, body, {
          link: '/contests',
          onClick: () => {
            BrowserWindow.getAllWindows().forEach((win) => {
              win.show();
              win.focus();
            });
          },
        });
      }
    }

    // 检查已经开始的比赛（通知一次）
    for (const contest of contests) {
      if (contest.phase === 'CODING') {
        if (notifiedContestStarted.has(contest.id)) continue;
        const timeSinceStart = now - contest.startTimeSeconds;
        // 只通知刚开始的比赛（5分钟内）
        if (timeSinceStart < 300) {
          notifiedContestStarted.add(contest.id);
          pushNotification(store, 'contest', `比赛已开始: ${contest.name}`, '快去参赛吧!', { link: '/contests' });
        }
      }
    }
  } catch (e) {
    console.error('checkContestReminders failed:', e);
  }
}

/**
 * 检查好友刷题里程碑。
 * 在刷新后对比新旧提交数，达到里程碑时通知。
 */
export function checkMilestones(
  store: StoreManager,
  oldCaches: Record<string, FriendCache | undefined>
): void {
  const newCaches = store.getAllCache();

  for (const [handle, newCache] of Object.entries(newCaches)) {
    const oldCache = oldCaches[handle];
    if (!oldCache || !newCache) continue;

    const oldACCount = countUniqueAC(oldCache.recentSubmissions);
    const newACCount = countUniqueAC(newCache.recentSubmissions);

    if (newACCount <= oldACCount) continue;

    const friendAlias = store.getFriends().find((f) => f.handle === handle)?.alias || handle;

    // 里程碑：每 10 题
    const oldMilestone = Math.floor(oldACCount / 10);
    const newMilestone = Math.floor(newACCount / 10);

    if (newMilestone > oldMilestone && newMilestone > 0) {
      const title = `${friendAlias} 又 AC 了!`;
      const body = `近期 AC 题数达到 ${newACCount} 题`;
      pushNotification(store, 'milestone', title, body, { handle, link: `/friends/${handle}` });
    }
  }
}

/**
 * 统计去重后的 AC 题数。
 */
function countUniqueAC(submissions: { verdict: string; problem: { contestId?: number; index: string } }[] | undefined): number {
  if (!submissions) return 0;
  const set = new Set<string>();
  for (const s of submissions) {
    if (s.verdict !== 'OK') continue;
    if (!s.problem.contestId) continue;
    set.add(`${s.problem.contestId}-${s.problem.index}`);
  }
  return set.size;
}

/**
 * 启动比赛提醒定时检查（每 5 分钟检查一次）。
 */
let contestTimer: NodeJS.Timeout | null = null;

export function startContestReminderTimer(store: StoreManager): void {
  if (contestTimer) clearInterval(contestTimer);

  // 启动时立即检查一次
  setTimeout(() => checkContestReminders(store), 5000);

  // 每 5 分钟检查一次
  contestTimer = setInterval(() => checkContestReminders(store), 5 * 60 * 1000);
}

/**
 * 停止比赛提醒定时器。
 */
export function stopContestReminderTimer(): void {
  if (contestTimer) {
    clearInterval(contestTimer);
    contestTimer = null;
  }
}

/**
 * 后台静默刷新"特别关注"好友并触发通知检查。
 * 供系统托盘常驻模式下的定时后台刷新使用, 不依赖 IPC 调用链。
 * 失败静默, 不影响应用运行。
 */
export async function refreshStarredInBackground(store: StoreManager): Promise<void> {
  try {
    const friends = store.getFriends();
    const starred = friends.filter((f) => f.starred);
    if (starred.length === 0) return;
    const handles = starred.map((f) => f.handle);

    const oldCaches = store.getAllCache();
    const { infos } = await fetchUserInfoSafe(handles);

    for (const info of infos) {
      try {
        const [ratingHistory, recentSubmissions] = await Promise.all([
          fetchUserRating(info.handle),
          fetchUserStatus(info.handle, 20),
        ]);
        store.setCache(info.handle, {
          handle: info.handle,
          info,
          ratingHistory,
          recentSubmissions,
          cachedAt: Date.now(),
        });
      } catch {
        // 单个失败不中断
      }
    }

    const settings = store.getSettings();
    checkRatingChanges(store, oldCaches, settings);
    checkMilestones(store, oldCaches);
  } catch (e) {
    console.error('refreshStarredInBackground failed:', e);
  }
}
