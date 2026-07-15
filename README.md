# CF Friends - Codeforces 好友关注桌面应用

Electron + React 桌面应用，用于关注 Codeforces 好友的 Rating 变化、做题记录、比赛情况和在线状态。

## 功能

- **好友管理**：手动添加/删除好友，或从 Codeforces 关注列表同步。右键好友可修改备注或删除。
- **好友详情**：Rating 历史曲线、比赛记录、提交记录，做题热力图，题目推荐。所有链接可点击跳转。
- **排行榜**：近两天做题排行 + Rating 排行，前三名奖牌显示。
- **团队**：创建团队（最多 3 人），点击展开查看今日最卷/今日最拉战况。
- **近期比赛**：拉取 CF 比赛列表，赛前倒计时，进行中高亮，点击跳转。
- **好友对比**：双人 Rating 曲线对比，做题统计对比表格。
- **团队周报/月报**：按团队统计做题量、Rating 变化、活跃度热力图，自动生成总结。
- **侧边栏**：搜索过滤、排序（Rating/最近活跃）、Rating 变动小红点、开机自动刷新、刷新间隔提示。
- **窗口记忆**：记住窗口大小和位置。

## 技术栈

- Electron 31 + electron-vite
- React 18 + TypeScript 5
- electron-store（本地持久化）
- Recharts（图表）
- React Router（路由）
- Vitest（测试）

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

## 配置

在设置页面填写：
- **Handle**：你的 Codeforces 用户名
- **API Key / API Secret**：从 [Codeforces API 设置页](https://codeforces.com/settings/api) 获取

配置 API 后，保存设置会自动同步好友列表（删除不在关注列表中的好友）并刷新数据。

## 项目结构

```
cf-friends/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── index.ts        # 入口，窗口创建
│   │   ├── store.ts        # electron-store 封装
│   │   ├── cf-api.ts       # Codeforces API 客户端
│   │   └── ipc-handlers.ts # IPC 通信处理
│   ├── preload/        # 预加载脚本
│   │   └── index.ts        # contextBridge API
│   ├── shared/         # 主进程/渲染进程共享
│   │   └── types.ts        # 类型定义
│   └── renderer/       # React 渲染进程
│       └── src/
│           ├── components/  # 组件
│           ├── pages/       # 页面
│           ├── hooks/       # 自定义 Hook
│           ├── utils/       # 工具函数
│           └── styles/      # CSS Modules
├── tests/              # 单元测试
└── package.json
```

## Codeforces API

使用以下接口（遵守 2 秒间隔限制）：
- `user.info` — 用户信息
- `user.rating` — Rating 历史
- `user.status` — 提交记录
- `user.friends` — 关注列表（需 API 认证）
- `contest.list` — 比赛列表
