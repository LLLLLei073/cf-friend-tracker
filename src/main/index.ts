import { app, BrowserWindow } from 'electron';
import path from 'path';
import { StoreManager } from './store';
import { registerIpcHandlers } from './ipc-handlers';

const store = new StoreManager();
registerIpcHandlers(store);

let win: BrowserWindow | null = null;

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
  const saveWindowState = () => {
    const bounds = win.getBounds();
    store.setWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    });
  };

  win.on('resize', saveWindowState);
  win.on('move', saveWindowState);
  win.on('close', saveWindowState);

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
