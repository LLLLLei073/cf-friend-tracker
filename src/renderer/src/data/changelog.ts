export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  features: { icon: string; text: string }[];
  fixes?: { icon: string; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.6',
    date: '2026-07-26',
    title: '团队目标与 AI 报告图片导出',
    features: [
      { icon: '🎯', text: '团队可设置「目标」，AI 分析 / 推荐题单 / 知识点清单将围绕该目标给出针对性建议与题库' },
      { icon: '🖼️', text: '团队 AI 报告新增图片(PNG)导出形式，一键将分析报告截图保存为图片' },
    ],
    fixes: [
      { icon: '🐛', text: '修复团队目标输入框在中文输入法下拼音重复的问题（组合输入期间不再触发状态回灌）' },
    ],
  },
  {
    version: '1.2.5',
    date: '2026-07-26',
    title: '代码健壮性修复与打包优化',
    features: [],
    fixes: [
      { icon: '🔧', text: '修复应用版本号来源：不再写死常量，统一读取运行版本，更新日志与自动更新提示显示真实版本（1.2.4 起漏改常量导致版本展示漂移）' },
      { icon: '🐛', text: '修复 AI 分析历史记录删除键用时间戳导致的同毫秒碰撞误删，改用稳定随机 id' },
      { icon: '📦', text: '加固 Excel 导出运行时依赖：显式将 xlsx 标记为外部依赖并加容错，避免打包后 require 失败' },
      { icon: '⚙️', text: '修复 AI 测试连接/生成分析读取的是已保存设置而非编辑中值，现在使用界面当前输入' },
      { icon: '🛡️', text: '修复 AI 错误提取兜底返回 undefined 显示为「undefined」的问题' },
      { icon: '🧹', text: '清理导出对话框文件类型过滤器的冗余分支' },
      { icon: '📝', text: '设置页更新说明改用安全的 Markdown 渲染（不依赖 dangerouslySetInnerHTML，无 XSS 风险），支持标题/列表/引用排版' },
      { icon: '💾', text: '优化安装包体积：打包时自动裁剪开发依赖（typescript/vite/electron-builder 等不再进入 asar）' },
    ],
  },
  {
    version: '1.2.4',
    date: '2026-07-26',
    title: '补丁修复：更新日志崩溃',
    features: [],
    fixes: [
      { icon: '🐛', text: '修复设置页点击「查看更新日志」崩溃的问题（v1.2.1 条目缺 features 字段导致 entry.features.map 抛错）' },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-07-26',
    title: '团队 AI 分析与报告导出',
    features: [
      { icon: '🤖', text: '团队 AI 分析：基于成员 Rating 与近期战绩，自动生成团队整体实力与趋势分析' },
      { icon: '📋', text: '推荐题单：AI 根据队员水平与薄弱点，推荐适合的 Codeforces 题目清单' },
      { icon: '📚', text: '知识点清单：AI 梳理团队需要补强的知识点，按优先级排列' },
      { icon: '⚙️', text: '设置页新增 AI 接口配置：自定义 API 地址、Key、模型（兼容 OpenAI 格式）' },
      { icon: '🕘', text: 'AI 报告保留历史记录，可按条删除或清空，随时回看' },
      { icon: '📤', text: '报告导出支持 Markdown 与 Excel 双格式，合并到同一按钮弹出菜单选择' },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-07-25',
    title: '稳定性修复',
    features: [],
    fixes: [
      { icon: '🐛', text: '修复团队周报/月报页面 React hooks 顺序错误导致的打开即闪退问题' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-18',
    title: '特别关注与稳定性优化',
    features: [
      { icon: '⭐', text: '特别关注：右键好友可设为特别关注，列表中置顶显示并带星标高亮' },
      { icon: '⚡', text: '仅刷新特别关注：底部新增独立按钮，只刷新重点好友，大幅节省时间和请求量' },
      { icon: '🚀', text: '全量刷新优先级：特别关注的好友在全量刷新时优先处理，更快看到结果' },
      { icon: '🎯', text: '好友列表页同步支持星标切换按钮和置顶排序' },
    ],
    fixes: [
      { icon: '🐛', text: '修复近期比赛页面无法刷新的问题：网络错误被吞导致显示空列表' },
      { icon: '🔁', text: 'CF API 网络错误现支持自动重试（指数退避，最多 3 次），提升不稳定网络下的成功率' },
      { icon: '⏱', text: 'API 请求超时从 10s 提升到 15s，适配较大数据量拉取' },
      { icon: '💡', text: '加载失败时显示明确错误信息，不再误导性地显示"暂无数据"' },
    ],
  },
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