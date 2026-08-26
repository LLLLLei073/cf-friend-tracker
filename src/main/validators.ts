import { z } from 'zod';

/**
 * 数据校验层: 用 zod 对外部平台 API(CF / 洛谷 / 牛客) 返回与缓存数据做 schema 校验。
 *
 * 设计原则:
 * 1. 外部数据不可信(接口改版、字段缺失、HTML 抓取抖动), 必须在写入持久化缓存前校验。
 * 2. 校验失败时优雅降级(返回 null 或过滤掉脏数据), 不抛异常阻断整批刷新。
 * 3. 校验通过的数据保证 TypeScript 类型安全, 下游消费无需再做防御性判空。
 *
 * 用法: validateCFUser(raw) 返回 CFUser | null; validateCFUserArray 校验批量。
 */

// ---- Codeforces ----
export const CFUserSchema = z.object({
  handle: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  organization: z.string().optional(),
  contribution: z.number().optional(),
  rank: z.string().optional(),
  maxRank: z.string().optional(),
  rating: z.number().optional(),
  maxRating: z.number().optional(),
  friendOfCount: z.number().optional(),
  titlePhoto: z.string().optional(),
  avatar: z.string().optional(),
  lastOnlineTimeSeconds: z.number(),
  registrationTimeSeconds: z.number(),
});
// zod 的 .optional() 对 null 不宽容(CF 偶有 null 字段), 用 preprocess 容错: null -> undefined
export const CFUserSchemaLoose = z.preprocess(
  (v) => (v == null ? undefined : v),
  CFUserSchema,
);

export const CFRatingChangeSchema = z.object({
  contestId: z.number(),
  contestName: z.string(),
  handle: z.string(),
  rank: z.number(),
  ratingUpdateTimeSeconds: z.number(),
  oldRating: z.number(),
  newRating: z.number(),
});

export const CFProblemSchema = z.object({
  contestId: z.number().optional(),
  index: z.string(),
  name: z.string(),
  type: z.string(),
  rating: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

export const CFSubmissionSchema = z.object({
  id: z.number(),
  contestId: z.number().optional(),
  creationTimeSeconds: z.number(),
  relativeTimeSeconds: z.number(),
  problem: CFProblemSchema,
  programmingLanguage: z.string(),
  verdict: z.string(),
  testset: z.string().optional(),
  passedTestCount: z.number().optional(),
  timeConsumedMillis: z.number().optional(),
  memoryConsumedBytes: z.number().optional(),
});

export const CFContestSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['CF', 'IOI', 'ICPC']),
  phase: z.enum(['BEFORE', 'CODING', 'PENDING_SYSTEM_TEST', 'SYSTEM_TEST', 'FINISHED']),
  durationSeconds: z.number(),
  startTimeSeconds: z.number(),
  relativeTimeSeconds: z.number(),
});

// ---- 洛谷 ----
export const LuoguUserSchema = z.object({
  uid: z.number(),
  name: z.string(),
  avatar: z.string().optional(),
  slogan: z.string().optional(),
  passed: z.number(),
  submitted: z.number(),
  ccfLevel: z.number().optional(),
  xcpcLevel: z.number().optional(),
  color: z.string().optional(),
  ranking: z.number().nullable().optional(),
  followerCount: z.number().optional(),
  followingCount: z.number().optional(),
  elo: z.number().nullable().optional(),
  registerTime: z.number().optional(),
});

// 牛客 validator 已移除 (Phase 1b 退役, 2026-08)

// ---- 校验工具 ----

/**
 * 校验单个对象: 通过返回强类型数据, 失败返回 null 并记录 warn 日志。
 */
export function validateOne<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  label: string,
): T | null {
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  console.warn(`[validator] ${label} 校验失败, 已丢弃脏数据:`, res.error.issues[0]?.message);
  return null;
}

/**
 * 校验数组: 过滤掉不合法元素, 返回合法子集(可能为空)。
 * 用于批量用户信息抓取, 避免单个脏数据拖垮整批。
 */
export function validateMany<T>(
  schema: z.ZodType<T>,
  rawList: unknown,
  label: string,
): T[] {
  if (!Array.isArray(rawList)) {
    console.warn(`[validator] ${label} 期望数组, 实际为 ${typeof rawList}, 返回空数组`);
    return [];
  }
  const out: T[] = [];
  for (const item of rawList) {
    const res = schema.safeParse(item);
    if (res.success) {
      out.push(res.data);
    } else {
      console.warn(`[validator] ${label} 某元素校验失败, 已过滤`);
    }
  }
  return out;
}

// 便捷封装: CF
export const validateCFUser = (raw: unknown) => validateOne(CFUserSchemaLoose, raw, 'CFUser');
export const validateCFUserArray = (raw: unknown) =>
  validateMany(CFUserSchemaLoose, raw, 'CFUser[]');
export const validateCFRatingArray = (raw: unknown) =>
  validateMany(CFRatingChangeSchema, raw, 'CFRatingChange[]');
export const validateCFSubmissionArray = (raw: unknown) =>
  validateMany(CFSubmissionSchema, raw, 'CFSubmission[]');
export const validateCFContestArray = (raw: unknown) =>
  validateMany(CFContestSchema, raw, 'CFContest[]');

// 便捷封装: 洛谷
export const validateLuoguUser = (raw: unknown) => validateOne(LuoguUserSchema, raw, 'LuoguUser');
// 牛客 validator 已移除 (Phase 1b 退役, 2026-08)
