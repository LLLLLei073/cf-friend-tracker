export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  features: { icon: string; text: string }[];
  fixes?: { icon: string; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-07-17',
    title: '社交与个性化大更新',
    features: [
      { icon: '📡', text: '新增「动态」页面：聚合所有好友的 Rating 变化和 AC 记录，实时追踪谁在卷' },
      { icon: '🔥', text: '连续做题 Streak 排行：看看谁连续刷题不断更' },
      { icon: '🏆', text: '「今日谁最卷」每日 AC 排行榜' },
      { icon: '🌙', text: '深色模式：支持浅色/深色/跟随系统三种主题切换' },
      { icon: '📊', text: '数据导出：排行榜、好友对比、团队报告支持导出 CSV 和图片' },
      { icon: '🎯', text: '标签维度分析：雷达图、难度分布、判定结果饼图、弱项识别' },
      { icon: '🔮', text: '比赛评级预测：比赛进行中实时预测好友 Rating 变化' },
      { icon: '🔔', text: '桌面通知：Rating 变化、比赛开始提醒、刷题里程碑' },
      { icon: '🧭', text: '悬浮导航面板：不再挤占好友列表空间' },
      { icon: '⚡', text: '启动默认页面：可在设置中选择打开应用后进入哪个页面' },
      { icon: '📈', text: '好友对比曲线改用比赛时间轴，支持跳转比赛链接' },
    ],
    fixes: [
      { icon: '🐛', text: '修复设置修改后未自动保存的问题' },
      { icon: '🐛', text: '修复好友对比 Rating 曲线比赛序号不准确的问题' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-15',
    title: '首个正式版本',
    features: [
      { icon: '👥', text: '好友管理：添加、删除、备注好友，支持从 Codeforces 同步好友列表' },
      { icon: '📊', text: '好友详情：Rating 历史曲线、近期提交记录、题目标签统计' },
      { icon: '🏆', text: '排行榜：近两天做题排行、Rating 排行' },
      { icon: '👥', text: '团队管理：创建团队、添加成员、团队周报/月报' },
      { icon: '📅', text: '近期比赛：查看 Codeforces 近期比赛列表和倒计时' },
      { icon: '📊', text: '好友对比：两人数据对比、Rating 历史曲线' },
      { icon: '🔄', text: '一键刷新：批量更新所有好友数据' },
      { icon: '🎨', text: '手账风格 UI 设计' },
    ],
  },
];
