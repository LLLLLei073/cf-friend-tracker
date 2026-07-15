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
