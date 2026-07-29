import { autoUpdater } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { UpdateStatus, UpdateInfo, UpdateProgress } from '../shared/types';

// 当前状态
let currentStatus: UpdateStatus = 'idle';
let currentInfo: UpdateInfo | null = null;
let currentError: string | null = null;
let hasAutoChecked = false;

/**
 * 判断是否为开发模式。
 * electron-vite dev 模式会设置 ELECTRON_RENDERER_URL 环境变量,
 * 这比 app.isPackaged 更可靠(electron-vite dev 下 isPackaged 可能误判)。
 */
function isDevMode(): boolean {
  return !app.isPackaged || !!process.env.ELECTRON_RENDERER_URL;
}

function debugLog(msg: string): void {
  const logFile = path.join(app.getPath('userData'), 'debug.log');
  const line = `[${new Date().toISOString()}] [updater] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, data);
  });
}

function setStatus(
  status: UpdateStatus,
  info?: UpdateInfo | null,
  error?: string | null,
): void {
  currentStatus = status;
  if (info !== undefined) currentInfo = info;
  if (error !== undefined) currentError = error;
  sendToRenderer('updater:status', {
    status: currentStatus,
    info: currentInfo,
    error: currentError,
  });
}

/**
 * 将 electron-updater 的 UpdateInfo 转换为内部 UpdateInfo 类型。
 * releaseNotes 可能是 string 或 ReleaseNoteInfo[],统一转为 string。
 */
function normalizeUpdateInfo(info: { version: string; releaseNotes?: unknown; releaseName?: string | null; releaseDate?: string | null }): UpdateInfo {
  let notes: string | null = null;
  if (typeof info.releaseNotes === 'string') {
    notes = info.releaseNotes;
  } else if (Array.isArray(info.releaseNotes)) {
    notes = info.releaseNotes
      .map((n: { note?: string; version?: string }) => n.note ?? '')
      .filter(Boolean)
      .join('\n\n') || null;
  }
  return {
    version: info.version,
    releaseNotes: notes,
    releaseName: info.releaseName ?? null,
    releaseDate: info.releaseDate ?? null,
  };
}

/**
 * 初始化自动更新模块。
 * 仅在打包环境(生产模式)下生效,开发模式自动跳过。
 * 启动后延迟 10 秒自动检查一次更新。
 */
export function initUpdater(): void {
  if (isDevMode()) {
    debugLog('Skipped updater init: dev mode (isPackaged=' + app.isPackaged + ', ELECTRON_RENDERER_URL=' + (process.env.ELECTRON_RENDERER_URL || 'none') + ')');
    return;
  }

  // 自动下载更新包(发现新版本后自动开始下载)
  autoUpdater.autoDownload = true;
  // 应用退出时自动安装已下载的更新
  autoUpdater.autoInstallOnAppQuit = true;
  // 不允许降级
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    debugLog('Event: checking-for-update');
    setStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    debugLog(`Event: update-available v${info.version}`);
    const updateInfo = normalizeUpdateInfo(info);
    // autoDownload = true, 状态先设为 available,下载开始后会切到 downloading
    setStatus('available', updateInfo);
  });

  autoUpdater.on('update-not-available', (info) => {
    debugLog(`Event: update-not-available (current v${info.version})`);
    setStatus('not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (currentStatus !== 'downloading') {
      setStatus('downloading');
    }
    const p: UpdateProgress = {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    };
    sendToRenderer('updater:progress', p);
  });

  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`Event: update-downloaded v${info.version}`);
    const updateInfo = normalizeUpdateInfo(info);
    setStatus('downloaded', updateInfo);
  });

  autoUpdater.on('error', (err) => {
    debugLog(`Event: error — ${err?.message ?? err}`);
    setStatus('error', null, err?.message ?? String(err));
  });

  debugLog('Updater initialized. Auto-check scheduled in 10s.');

  // 启动后延迟 10 秒自动检查(避免与启动加载争抢资源)
  setTimeout(() => {
    if (!hasAutoChecked) {
      hasAutoChecked = true;
      checkForUpdates().catch((e) => {
        debugLog(`Auto-check failed: ${(e as Error).message}`);
      });
    }
  }, 10000);
}

/**
 * 手动检查更新。
 */
export async function checkForUpdates(): Promise<void> {
  if (isDevMode()) {
    debugLog('checkForUpdates skipped: dev mode');
    setStatus('error', null, '开发模式下不支持自动更新,请使用打包后的应用');
    return;
  }
  try {
    debugLog('Manually checking for updates...');
    await autoUpdater.checkForUpdates();
  } catch (e) {
    debugLog(`checkForUpdates error: ${(e as Error).message}`);
    setStatus('error', null, (e as Error).message);
  }
}

/**
 * 退出并安装已下载的更新。
 */
export function installUpdate(): void {
  debugLog('installUpdate: calling quitAndInstall');
  autoUpdater.quitAndInstall();
}

/**
 * 获取当前更新状态(供渲染进程初次加载时同步)。
 */
export function getUpdateStatus(): {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error: string | null;
  appVersion: string;
} {
  return { status: currentStatus, info: currentInfo, error: currentError, appVersion: app.getVersion() };
}
