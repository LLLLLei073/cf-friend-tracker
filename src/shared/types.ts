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
  defaultPage: 'friends' | 'feed' | 'leaderboard' | 'teams' | 'contests' | 'report';
  lastViewedChangelog: string; // 最后查看过的更新日志版本
  // 通知配置
  notifyRatingChange: boolean;
  notifyContestStart: boolean;
  contestNotifyMinutes: number; // 赛前几分钟提醒
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