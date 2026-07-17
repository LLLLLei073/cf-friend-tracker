import { app, BrowserWindow, dialog, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { StoreManager } from './store';
import { registerIpcHandlers } from './ipc-handlers';
import { initUpdater } from './updater';
import { startContestReminderTimer, stopContestReminderTimer } from './notifier';

// 调试日志
const logFile = path.join(app.getPath('userData'), 'debug.log');
function debugLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
}
debugLog('=== App starting ===');
debugLog(`Electron: ${process.versions.electron}, Node: ${process.versions.node}, Chromium: ${process.versions.chrome}`);
debugLog(`Platform: ${process.platform}, Arch: ${process.arch}`);
debugLog(`App path: ${app.getAppPath()}`);
debugLog(`__dirname: ${__dirname}`);
debugLog(`EXEC_PATH: ${process.execPath}`);

// 未签名的 Electron 应用在 Windows 上需要禁用 Chromium 沙箱, 否则会崩溃
app.commandLine.appendSwitch('no-sandbox');
debugLog('no-sandbox switch added');

// 全局异常捕获: 防止 electron-store 写入 EPERM 等错误导致崩溃
let hasShownError = false;
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // EPERM 错误是 electron-store 原子写入时常见的临时性错误, 只记录不崩溃
  if (err.message?.includes('EPERM') && err.message?.includes('.tmp')) {
    console.warn('Store write EPERM (likely AV interference), ignoring.');
    return;
  }
  // 其他严重错误: 只在第一次时弹窗提示
  if (!hasShownError) {
    hasShownError = true;
    dialog.showErrorBox('应用错误', `发生了一个错误:\n${err.message}\n\n应用可能需要重启。`);
  }
});

const store = new StoreManager();
debugLog('StoreManager created');
registerIpcHandlers(store);
debugLog('IPC handlers registered');

function createWindow(): void {
  debugLog('createWindow called');
  const savedState = store.getWindowState();
  debugLog(`Window state: ${JSON.stringify(savedState)}`);
  const win = new BrowserWindow({
    width: savedState?.width ?? 1100,
    height: savedState?.height ?? 750,
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  debugLog('BrowserWindow created');

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    debugLog(`did-fail-load: code=${code}, desc=${desc}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    debugLog(`render-process-gone: ${JSON.stringify(details)}`);
  });
  win.webContents.on('console-message', (_e, level, msg) => {
    debugLog(`renderer-console[${level}]: ${msg}`);
  });

  // 保存窗口状态
  const persistBounds = () => {
    try {
      const bounds = win.getBounds();
      store.setWindowState({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      });
    } catch (e) {
      console.warn('Failed to save window state:', e);
    }
  };

  // resize/move 用防抖, 避免频繁写入触发 EPERM
  let saveTimer: NodeJS.Timeout | null = null;
  const saveWindowStateDebounced = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistBounds, 500);
  };

  win.on('resize', saveWindowStateDebounced);
  win.on('move', saveWindowStateDebounced);
  // close 时同步保存, 避免防抖延迟导致窗口状态丢失
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    persistBounds();
  });

  // 开发环境加载 dev server,生产环境加载打包文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    debugLog(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`);
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    debugLog(`Loading file: ${htmlPath}`);
    debugLog(`File exists: ${fs.existsSync(htmlPath)}`);
    win.loadFile(htmlPath);
  }
  debugLog('loadFile/loadURL called');
}

app.whenReady().then(() => {
  debugLog('app.whenReady fired');
  createWindow();

  // 初始化自动更新(生产模式启动后延迟自动检查)
  initUpdater();
  debugLog('Updater initialized');

  // 请求通知权限并启动比赛提醒定时器
  if (Notification.isSupported()) {
    debugLog('Notification is supported');
    startContestReminderTimer(store);
  } else {
    debugLog('Notification is NOT supported');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopContestReminderTimer();
});
