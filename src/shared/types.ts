// Codeforces API 返回类型
export interface CFUser {
  handle: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  organization?: string;
  contribution?: number;
  rank?: string;
  maxRank?: string;
  rating?: number;
  maxRating?: number;
  friendOfCount?: number;
  titlePhoto?: string;
  avatar?: string;
  lastOnlineTimeSeconds: number;
  registrationTimeSeconds: number;
}

export interface CFRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

export interface CFProblem {
  contestId?: number;
  index: string;
  name: string;
  type: string;
  rating?: number;
  tags?: string[];
}

export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds: number;
  problem: CFProblem;
  language: string;
  verdict: string;
  testset?: string;
  passedTestCount?: number;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
}

// 应用内部类型
export interface Friend {
  handle: string;
  alias: string;
  addedAt: number;
  // 特别关注: starred 好友在列表中置顶显示, 且可一键仅刷新这些好友(节省资源)
  starred?: boolean;
  // 自定义分组: 一个好友可属于多个分组(如 队友/同学/大佬)
  groups?: string[];
}

export interface FriendCache {
  handle: string;
  info: CFUser;
  ratingHistory: CFRatingChange[];
  recentSubmissions: CFSubmission[];
  cachedAt: number;
}

export interface Settings {
  myHandle: string;
  apiKey: string;
  apiSecret: string;
  lastRefreshAt: number;
  theme: 'light' | 'dark' | 'system';
  defaultPage: 'friends' | 'feed' | 'leaderboard' | 'teams' | 'contests' | 'report' | 'problems' | 'training';
  lastViewedChangelog: string; // 最后查看过的更新日志版本
  // 通知配置
  notifyRatingChange: boolean;
  notifyContestStart: boolean;
  contestNotifyMinutes: number; // 赛前几分钟提醒
  // 开机自动刷新策略: true 时距上次刷新超过30分钟的开机仅刷新特别关注的好友,
  // 未设置特别关注的好友时回退为刷新全部(保证仍有数据更新)。
  launchRefreshStarredOnly: boolean;
  // ---- AI 接口配置 (OpenAI 兼容的 chat completions 端点) ----
  aiApiBase: string;   // 如 https://api.openai.com/v1
  aiApiKey: string;    // API Key
  aiModel: string;     // 模型名称, 如 gpt-4o-mini
  // ---- C++ 编译器路径 (代码运行功能使用) ----
  // 留空则自动探测 MinGW g++ (D:\mingw64\bin\g++.exe / C:\mingw64\bin\g++.exe) 或系统 PATH
  cppCompilerPath: string;
  // ---- 题目缓存目录 (刷题功能使用) ----
  // 留空则使用默认位置（即 userData/problem-cache）。非空为自定义目录,
  // 更换时主进程会自动将已保存的题目与代码移动到新目录。
  problemCacheDir: string;
  // ---- 系统托盘常驻: 开启后关闭窗口不退出应用, 后台驻留并定时刷新特别关注好友 ----
  enableTray: boolean;
}

export interface CFApiResponse<T> {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: T;
}

// 团队
export interface Team {
  id: string;
  name: string;
  members: string[]; // CF handles, 最多 3 个
  createdAt: number;
  goal?: string; // 团队训练目标, 供 AI 分析围绕目标给出建议与推荐题单
}

// 比赛
export interface CFContest {
  id: number;
  name: string;
  type: 'CF' | 'IOI' | 'ICPC';
  phase: 'BEFORE' | 'CODING' | 'PENDING_SYSTEM_TEST' | 'SYSTEM_TEST' | 'FINISHED';
  durationSeconds: number;
  startTimeSeconds: number;
  relativeTimeSeconds: number;
}

// 某人在某场比赛中的表现(用于动态-近期比赛板块)
export interface ContestPerformance {
  acCount: number; // AC 题数
  rank: number;    // 该场比赛排名
  points: number;  // 总得分
}

// 窗口状态
export interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
}

// 好友同步结果
export interface SyncResult {
  synced: number;
  removed: number;
  skipped: boolean;
  error: string;
}

// 刷新进度通知
export interface RefreshProgress {
  handle?: string;
  completed: number;
  total: number;
  errors: string[];
}

// ---- 自动更新 ----
export type UpdateStatus =
  | 'idle'          // 空闲
  | 'checking'      // 正在检查
  | 'available'     // 有新版本
  | 'not-available' // 已是最新
  | 'downloading'   // 正在下载
  | 'downloaded'    // 下载完成,等待安装
  | 'error';        // 出错

export interface UpdateInfo {
  version: string;       // 新版本号
  releaseNotes: string | null; // 更新说明(markdown 或纯文本)
  releaseName: string | null;
  releaseDate: string | null;
}

export interface UpdateProgress {
  percent: number;        // 0-100
  transferred: number;    // 已下载字节
  total: number;          // 总字节
  bytesPerSecond: number; // 下载速度
}

// ---- 评级预测 ----

// CF API: contest.standings 返回类型
export interface CFStandingsParty {
  contestId: number;
  members: { handle: string }[];
  participantType: string; // CONTESTANT, PRACTICE, VIRTUAL, OUT_OF_COMPETITION
  teamId?: string;
  teamName?: string;
  ghost: boolean;
  room?: number;
  startTimeSeconds?: number;
}

export interface CFProblemResult {
  points: number;
  rejectedAttemptCount: number;
  type: string;
  bestSubmissionTimeSeconds?: number;
}

export interface CFRanklistRow {
  party: CFStandingsParty;
  rank: number;
  points: number;
  penalty: number;
  successfulHackCount: number;
  unsuccessfulHackCount: number;
  problemResults: CFProblemResult[];
}

export interface CFContestStandings {
  contest: CFContest;
  problems: CFProblem[];
  rows: CFRanklistRow[];
}

// 预测结果
export interface PredictionResult {
  handle: string;
  rank: number;           // 当前比赛排名
  oldRating: number;      // 赛前 rating
  predictedRating: number; // 预测赛后 rating
  predictedDelta: number;  // 预测变化量
  performanceRating: number; // 表现分 (delta=0 时的 rating)
  points: number;          // 已解决题数
  penalty: number;         // 罚时
}

export interface ContestPrediction {
  contestId: number;
  contestName: string;
  predictions: PredictionResult[];
  totalParticipants: number;
}

// ---- 团队 AI 分析 ----

// 推荐题单中的单个题单
export interface AIProblemSet {
  title: string;        // 题单名称
  topic: string;        // 涉及知识点
  difficulty: string;   // 难度区间, 如 "1400-1600"
  reason: string;       // 推荐理由
  problems: string[];   // 题目编号, 如 ["1234A", "1567B"]
}

// 知识点清单中的单个知识点
export interface AIKnowledgePoint {
  topic: string;        // 知识点名称
  description: string;  // 需要掌握的内容
  members: string[];    // 需要加强该知识点的成员 handle
  priority: 'high' | 'medium' | 'low';
}

// 团队 AI 分析完整结果
export interface TeamAIResult {
  id: string;                // 稳定唯一标识(crypto.randomUUID),用于删除/React key,避免同一毫秒生成的时间戳碰撞
  analysis: string;          // 整体分析报告
  problemSets: AIProblemSet[];   // 推荐题单
  knowledgePoints: AIKnowledgePoint[]; // 知识点清单
  generatedAt: number;       // 生成时间戳
  model: string;             // 使用的模型
}

// AI 连接测试结果
export interface AIConnectionResult {
  ok: boolean;
  error?: string;
}

// 报告导出结果
export interface AIExportResult {
  ok: boolean;
  path?: string;     // 导出成功的文件路径
  error?: string;
  canceled?: boolean; // 用户取消保存
}

// 报告导出格式
export type AIExportFormat = 'markdown' | 'excel' | 'image';

// ---- 题目浏览 / 代码运行 ----

// 单个样例测试（输入 + 期望输出）
export interface SampleTest {
  input: string;
  output: string;
}

// 题面缓存：抓取并清洗后的题目正文 + 样例
export interface ProblemStatement {
  contestId: number;
  index: string; // 题号, 如 "A"
  name: string;
  html: string; // .problem-statement 内部 HTML（已清洗, 可注入渲染）
  samples: SampleTest[];
  cachedAt: number; // 写入缓存时间
  fetchedAt: number; // 实际抓取时间
  translation?: ProblemTranslation; // AI 中文翻译（缓存后离线可看）
}

// 题面的 AI 中文翻译结果
export interface ProblemTranslation {
  html: string; // 翻译后的 HTML（结构、公式与原文保持一致）
  model: string; // 使用的模型
  translatedAt: number;
}

// 题目列表中用于浏览的轻量项（来自 problemset.problems）
export interface ProblemListItem {
  contestId: number;
  index: string;
  name: string;
  rating?: number;
  tags: string[];
  type: string;
  solvedCount?: number; // 来自 problemStatistics
}

// 题目列表筛选条件
export interface ProblemFilter {
  keyword?: string; // 匹配题名 或 "contestId+index"（如 1234A / 1234）
  tag?: string;
  minRating?: number;
  maxRating?: number;
}

// 本地收藏的题目(独立于 AI 推荐题单, 用户手动收藏)
export interface FavoriteProblem {
  contestId: number;
  index: string; // 题号, 如 "A"
  name?: string;
  rating?: number;
  note?: string; // 用户备注(可选)
  addedAt: number;
}

// 单个样例的运行结果
export interface RunResult {
  index: number; // 第几个样例（从 0 开始）
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  exitCode: number | null;
  error?: string; // 编译错误 / 运行异常信息
  timedOut?: boolean;
  timeMs?: number;
}

// 运行全部样例的结果
export interface RunAllResult {
  results: RunResult[];
  compileError?: string; // 编译失败时的错误信息
  allPassed: boolean;
  compilerPath: string | null;
}

// ---- 数据备份与迁移 ----
// 整个 electron-store 数据的导出/导入结构, 用于换机/重装时迁移配置与缓存
export interface BackupData {
  version: 1;
  exportedAt: number;
  friends: Friend[];
  cache: Record<string, FriendCache>;
  settings: Settings;
  teams: Team[];
  windowState: WindowState | null;
  viewedRatings: Record<string, number>;
  aiResults: Record<string, TeamAIResult[]>;
  problemCacheDir?: string; // 题目缓存目录, 导入时用于迁移题面/代码文件
}

// 备份导入结果
export interface BackupResult {
  ok: boolean;
  error?: string;
  imported?: {
    friends: number;
    teams: number;
    cacheMoved: number; // 迁移的题目缓存文件数(可能为 0)
  };
}

// ---- 通知中心 ----
export interface NotificationItem {
  id: string; // crypto.randomUUID, 稳定唯一
  type: 'rating' | 'contest' | 'milestone';
  handle?: string; // 关联的好友 handle(可选)
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  // 点击通知后跳转的路由(可选), 如 /friends/tourist / /contests
  link?: string;
}

// ---- 好友博客 ----
// CF user.blogEntries 返回的单条博客(不含正文, 正文需浏览器打开)
export interface BlogEntry {
  id: number;
  title: string;
  handle: string;
  creationTimeSeconds: number;
  commentCount?: number;
  rating?: number;
  tags?: string[];
}