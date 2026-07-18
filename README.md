# CF Friends - Codeforces 好友关注桌面应用

Electron + React 桌面应用，用于关注 Codeforces 好友的 Rating 变化、做题记录、比赛情况和在线状态。

## 功能

### 好友管理
- 手动添加/删除好友，或从 Codeforces 关注列表同步
- 右键好友可修改备注、删除或设为"特别关注"
- 特别关注好友在列表中置顶显示并带星标高亮
- 仅刷新特别关注：底部独立按钮，只刷新重点好友

### 好友详情
- Rating 历史曲线、比赛记录、提交记录
- 做题热力图（90 天）、题目推荐
- **标签维度分析**：雷达图、难度分布直方图、判定结果饼图、弱项识别
- 所有链接可点击跳转

### 排行榜
- 近两天做题排行 + Rating 排行，前三名奖牌显示
- 连续做题 Streak 排行

### 动态（Feed）
- 聚合所有好友的 Rating 变化和 AC 记录
- 实时追踪谁在卷
- 「今日谁最卷」每日 AC 排行榜

### 团队
- 创建团队（最多 3 人），点击展开查看今日最卷/今日最拉战况
- 团队周报/月报：按团队统计做题量、Rating 变化、活跃度热力图，自动生成总结

### 近期比赛
- 拉取 CF 比赛列表，赛前倒计时，进行中高亮，点击跳转
- **比赛评级预测**：比赛进行中实时预测好友 Rating 变化

### 好友对比
- 双人 Rating 曲线对比（比赛时间轴），做题统计对比表格
- 支持跳转比赛链接

### 桌面通知
- Rating 变化通知、比赛开始提醒、刷题里程碑

### 数据导出
- 排行榜、好友对比、团队报告支持导出 CSV 和图片

### 深色模式
- 支持浅色 / 深色 / 跟随系统三种主题切换

### 其他
- 悬浮导航面板，不挤占好友列表空间
- 启动默认页面：可在设置中选择打开应用后进入哪个页面
- 搜索过滤、排序（Rating/最近活跃）
- Rating 变动小红点、开机自动刷新、刷新间隔提示
- 窗口记忆大小和位置
- CF API 网络错误自动重试（指数退避，最多 3 次）
- 加载失败时显示明确错误信息

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
│   │   ├── ipc-handlers.ts # IPC 通信处理
│   │   ├── notifier.ts     # 桌面通知
│   │   ├── predictor.ts    # 评级预测
│   │   └── updater.ts      # 自动更新
│   ├── preload/        # 预加载脚本
│   │   └── index.ts        # contextBridge API
│   ├── shared/         # 主进程/渲染进程共享
│   │   └── types.ts        # 类型定义
│   └── renderer/       # React 渲染进程
│       └── src/
│           ├── components/  # 组件
│           ├── pages/       # 页面
│           ├── hooks/       # 自定义 Hook
│           ├── utils/       # 工具函数（analytics, export, helpers, rank）
│           ├── data/        # 更新日志数据
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
- `contest.standings` — 比赛排名（评级预测）
- `contest.ratingChanges` — Rating 变化（评级预测）

## 更新日志

### v1.2.0 (2026-07-18)
- ⭐ 特别关注：右键好友可设为特别关注，列表中置顶显示并带星标高亮
- ⚡ 仅刷新特别关注：底部新增独立按钮，只刷新重点好友
- 🚀 全量刷新优先级：特别关注的好友优先处理
- 🎯 好友列表页同步支持星标切换按钮和置顶排序
- 🐛 修复近期比赛页面无法刷新的问题
- 🔁 CF API 网络错误支持自动重试（指数退避，最多 3 次）
- ⏱ API 请求超时从 10s 提升到 15s
- 💡 加载失败时显示明确错误信息

### v1.1.0 (2026-07-17)
- 📡 新增「动态」页面：聚合所有好友的 Rating 变化和 AC 记录
- 🔥 连续做题 Streak 排行
- 🏆 「今日谁最卷」每日 AC 排行榜
- 🌙 深色模式：支持浅色/深色/跟随系统三种主题切换
- 📊 数据导出：排行榜、好友对比、团队报告支持导出 CSV 和图片
- 🎯 标签维度分析：雷达图、难度分布、判定结果饼图、弱项识别
- 🔮 比赛评级预测：比赛进行中实时预测好友 Rating 变化
- 🔔 桌面通知：Rating 变化、比赛开始提醒、刷题里程碑
- 🧭 悬浮导航面板
- ⚡ 启动默认页面可配置
- 📈 好友对比曲线改用比赛时间轴，支持跳转比赛链接

### v1.0.0 (2026-07-15)
- 首个正式版本，包含好友管理、详情、排行榜、团队、比赛、对比、周报等核心功能
