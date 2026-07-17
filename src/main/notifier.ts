import { Notification, BrowserWindow } from 'electron';
import { StoreManager } from './store';
import { fetchContests } from './cf-api';
import type { FriendCache, CFContest, Settings } from '../shared/types';

// 已通知过的比赛提醒（避免重复通知）
const notifiedContests = new Set<number>();
// 已通知过的比赛开始通知
const notifiedContestStarted = new Set<number>();

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

    showNotification(title, body);
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

        showNotification(title, body, () => {
          BrowserWindow.getAllWindows().forEach((win) => {
            win.show();
            win.focus();
          });
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
          showNotification(`比赛已开始: ${contest.name}`, '快去参赛吧!');
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
      showNotification(title, body);
    }
  }
}

/**
 * 显示桌面通知。
 */
function showNotification(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: false,
  });

  if (onClick) {
    notification.on('click', onClick);
  }

  // 点击通知聚焦窗口
  if (!onClick) {
    notification.on('click', () => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.show();
        win.focus();
      });
    });
  }

  notification.show();
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
