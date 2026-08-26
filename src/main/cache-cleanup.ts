import fs from 'fs';
import path from 'path';
import { getProblemCacheDir } from './problem-store';
import type { CacheStats, CleanupResult } from '../shared/types';

/**
 * 缓存自动清理: 应用启动时跑一次, 淘汰过期的题面缓存文件, 防止磁盘占用无限增长。
 *
 * 清理策略(保守, 只删「明显过期」的):
 * - 题面(statements/*.json): 按文件最后修改时间(mtime), 超过阈值未访问的删除。
 *   用户可能浏览上千题, 题面是体积大头; 删旧的不影响近期使用, 下次访问会重新抓取。
 * - 代码(code/*.txt): 用户保存的代码, 有价值, 不自动删。
 * - 收藏(favorites.json): 用户数据, 不删。
 * - problem-list.json: 有 7 天 TTL 自动重拉, 不删文件。
 *
 * 默认 90 天阈值; 返回删除数与释放字节数。
 */
const DEFAULT_MAX_AGE_DAYS = 90;

function walkFiles(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(p, acc);
    } else {
      acc.push(p);
    }
  }
}

export function cleanupOldStatements(maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): CleanupResult {
  const result: CleanupResult = { removed: 0, freedBytes: 0, errors: [], scanned: 0 };
  const dir = path.join(getProblemCacheDir(), 'statements');
  if (!fs.existsSync(dir)) return result;

  const files: string[] = [];
  walkFiles(dir, files);
  result.scanned = files.length;

  const threshold = Date.now() - maxAgeDays * 24 * 3600 * 1000;
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      // mtime = 最后修改时间; 部分系统 atime 不可靠, 用 mtime 兜底
      const lastTime = Math.max(stat.mtimeMs, stat.atimeMs);
      if (lastTime < threshold) {
        const size = stat.size;
        fs.rmSync(f, { force: true });
        result.removed++;
        result.freedBytes += size;
      }
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  return result;
}

/**
 * 统计题面缓存目录占用, 供设置页展示与手动清理决策。
 */
export function getProblemCacheStats(): CacheStats {
  const base = getProblemCacheDir();
  const stats: CacheStats = {
    problemStatements: 0,
    problemCodeFiles: 0,
    favoritesCount: 0,
    totalBytes: 0,
    cacheDir: base,
  };
  if (!fs.existsSync(base)) return stats;

  const stmtDir = path.join(base, 'statements');
  const codeDir = path.join(base, 'code');
  const favFile = path.join(base, 'favorites.json');

  const count = (dir: string, cb: (f: string) => void): void => {
    if (!fs.existsSync(dir)) return;
    const files: string[] = [];
    walkFiles(dir, files);
    for (const f of files) {
      try {
        stats.totalBytes += fs.statSync(f).size;
        cb(f);
      } catch {
        /* ignore */
      }
    }
  };

  count(stmtDir, () => stats.problemStatements++);
  count(codeDir, () => stats.problemCodeFiles++);

  try {
    if (fs.existsSync(favFile)) {
      stats.totalBytes += fs.statSync(favFile).size;
      const data = JSON.parse(fs.readFileSync(favFile, 'utf-8'));
      stats.favoritesCount = Array.isArray(data) ? data.length : 0;
    }
  } catch {
    /* ignore */
  }
  return stats;
}

/**
 * 启动时清理入口: 题面旧文件清理。失败静默(不阻断应用启动)。
 */
export function runStartupCleanup(): void {
  try {
    const res = cleanupOldStatements();
    if (res.removed > 0) {
      console.log(
        `[cache-cleanup] 清理 ${res.removed} 个过期题面缓存, 释放 ${(
          res.freedBytes / 1024 / 1024
        ).toFixed(2)} MB`,
      );
    }
  } catch (e) {
    console.warn('[cache-cleanup] 启动清理失败:', (e as Error).message);
  }
}
