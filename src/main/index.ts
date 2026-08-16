import { app, BrowserWindow, dialog, Notification, Menu, Tray, nativeImage, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { StoreManager } from './store';
import { setProblemCacheDir } from './problem-store';
import { registerIpcHandlers } from './ipc-handlers';
import { initUpdater } from './updater';
import { startContestReminderTimer, stopContestReminderTimer } from './notifier';
import { refreshStarredInBackground } from './notifier';

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

// 禁用 Electron 默认菜单栏: 否则按 Alt 会先激活原生菜单, 松开 Alt 的 keyup 可能
// 收不到, 导致 Alt 径向轮盘导航卡在打开态。Alt 轮盘是自定义交互, 不需要原生菜单。
// (macOS 保留默认菜单栏体验, 故仅对非 darwin 平台禁用)
if (process.platform !== 'darwin') {
  Menu.setApplicationMenu(null);
  debugLog('default application menu disabled');
}

// 本机安全软件/实时防护(Windows Defender / 第三方杀软实时扫描)会拦截对
// AppData\Roaming\cf-friend-tracker 目录下部分文件的写入, 导致 Chromium 网络服务
// 写缓存索引失败( Failed to write the temporary index file / Network service crashed ),
// 渲染进程无法通过 HTTP 加载 dev server 页面, 表现为启动期白屏。
// 将 Chromium 磁盘缓存重定向到用户可写的临时目录, 使索引文件能正常写出, 规避崩溃。
try {
  const chromiumCacheDir = path.join(os.tmpdir(), 'cf-friend-tracker-chromium');
  fs.mkdirSync(chromiumCacheDir, { recursive: true });
  app.commandLine.appendSwitch('disk-cache-dir', chromiumCacheDir);
  debugLog(`disk-cache-dir set to: ${chromiumCacheDir}`);
} catch (e) {
  debugLog(`disk-cache-dir setup failed: ${String(e)}`);
}
app.commandLine.appendSwitch('disable-gpu');

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
// 启动时将已保存的自定义题目缓存目录注入 problem-store, 使后续读写使用正确位置
setProblemCacheDir(store.getSettings().problemCacheDir);
registerIpcHandlers(store);
debugLog('IPC handlers registered');

// ---- 系统托盘常驻(可选, 由设置 enableTray 控制) ----
let tray: Tray | null = null;
let backgroundTimer: NodeJS.Timeout | null = null;
const trayEnabled = store.getSettings().enableTray;

function createTray(): void {
  // 无内置图标资源: 用 nativeImage 生成一个 16x16 的纯色占位图标。
  // 建议后续替换为真实的 .ico 资源以获得更好观感。
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVR42mNk+M9QzwAFjFAGI4QyBsaRjCYYjEYYDAYDAB8eAQEJ9t+1AAAAAElFTkSuQmCC',
  );
  tray = new Tray(icon);
  tray.setToolTip('CF Friend Tracker');

  const menuTemplate: MenuItemConstructorOptions[] = [
    { label: '显示窗口', click: () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } } },
    { label: '刷新特别关注', click: () => { refreshStarredInBackground(store); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));

  tray.on('click', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isVisible()) w.hide();
      else { w.show(); w.focus(); }
    }
  });
}

if (trayEnabled) {
  app.whenReady().then(() => {
    createTray();
    // 后台定时刷新特别关注好友(每 20 分钟), 有动态会弹通知
    backgroundTimer = setInterval(() => {
      refreshStarredInBackground(store);
    }, 20 * 60 * 1000);
  });
}

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

app.whenReady().then(async () => {
  debugLog('app.whenReady fired');
  // 一次性迁移: 若 keytar 可用, 把明文 AI Key 迁入系统凭据库并清空明文
  try {
    await store.migrateApiKeyIfNeeded();
  } catch (e) {
    debugLog(`migrateApiKeyIfNeeded failed: ${String(e)}`);
  }
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
  // 托盘常驻模式: 关闭窗口不退出应用, 隐藏到托盘后台运行
  if (trayEnabled) {
    BrowserWindow.getAllWindows().forEach((w) => w.hide());
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopContestReminderTimer();
  if (backgroundTimer) clearInterval(backgroundTimer);
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
