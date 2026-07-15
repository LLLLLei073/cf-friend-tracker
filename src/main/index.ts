import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { StoreManager } from './store';
import { registerIpcHandlers } from './ipc-handlers';

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
registerIpcHandlers(store);

function createWindow(): void {
  const savedState = store.getWindowState();
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
    },
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
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

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
