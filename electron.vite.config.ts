import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // 显式把 xlsx 标记为外部依赖: 导出 Excel 在运行时通过 require('xlsx') 从打包后的
        // node_modules 动态加载, 不应被打包进 asar 内联, 否则运行时可能解析失败
        external: ['xlsx'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
        output: {
          banner: `process.env.ELECTRON_DISABLE_SANDBOX = '1';`,
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
