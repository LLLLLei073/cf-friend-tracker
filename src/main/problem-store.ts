import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ProblemListItem, ProblemStatement } from '../shared/types';

// 题目数据缓存目录（默认位于 userData/problem-cache, 可通过设置 problemCacheDir 自定义）
let customCacheDir = '';

// 由主进程在启动和更换目录时注入; 传空字符串表示恢复默认位置
export function setProblemCacheDir(dir: string): void {
  customCacheDir = dir && dir.trim() ? dir.trim() : '';
}

// 返回当前生效的缓存目录（自定义目录优先, 否则默认位置）
export function getProblemCacheDir(): string {
  if (customCacheDir) return customCacheDir;
  return path.join(app.getPath('userData'), 'problem-cache');
}

function cacheDir(): string {
  return getProblemCacheDir();
}
function listFile(): string {
  return path.join(cacheDir(), 'problem-list.json');
}
function statementsDir(): string {
  return path.join(cacheDir(), 'statements');
}
function codeDir(): string {
  return path.join(cacheDir(), 'code');
}

function ensureDir(d: string): void {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// 列表刷新周期: 7 天。CF 题目集合变动不频繁, 避免每次启动都拉全量。
const LIST_TTL_MS = 7 * 24 * 3600 * 1000;

export function problemId(contestId: number, index: string): string {
  return `${contestId}_${index}`;
}

export function getProblemList(): { list: ProblemListItem[]; cachedAt: number } | null {
  try {
    const f = listFile();
    if (!fs.existsSync(f)) return null;
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    if (!Array.isArray(data.list)) return null;
    return data as { list: ProblemListItem[]; cachedAt: number };
  } catch {
    return null;
  }
}

export function setProblemList(list: ProblemListItem[]): void {
  ensureDir(cacheDir());
  fs.writeFileSync(listFile(), JSON.stringify({ list, cachedAt: Date.now() }), 'utf-8');
}

export function isListFresh(): boolean {
  const data = getProblemList();
  if (!data) return false;
  return Date.now() - data.cachedAt < LIST_TTL_MS;
}

export function getStatement(contestId: number, index: string): ProblemStatement | null {
  try {
    const f = path.join(statementsDir(), `${problemId(contestId, index)}.json`);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf-8')) as ProblemStatement;
  } catch {
    return null;
  }
}

export function setStatement(stmt: ProblemStatement): void {
  ensureDir(statementsDir());
  fs.writeFileSync(
    path.join(statementsDir(), `${problemId(stmt.contestId, stmt.index)}.json`),
    JSON.stringify(stmt),
    'utf-8',
  );
}

// 用户为某题保存的代码（按 contestId_index 区分）
export function getCode(id: string): string | null {
  try {
    const f = path.join(codeDir(), `${id}.txt`);
    if (!fs.existsSync(f)) return null;
    return fs.readFileSync(f, 'utf-8');
  } catch {
    return null;
  }
}

export function setCode(id: string, code: string): void {
  ensureDir(codeDir());
  fs.writeFileSync(path.join(codeDir(), `${id}.txt`), code, 'utf-8');
}

// ---- 目录迁移 ----

function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function countFiles(dir: string): number {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

export interface MigrateResult {
  ok: boolean;
  moved: number; // 移动的文件数
  targetDir: string; // 最终生效的目录
  errors: string[];
}

export interface ClearResult {
  ok: boolean;
  removed: number; // 删除的文件数
  errors: string[];
}

// 清空当前题目缓存目录下的全部内容（statements/ code/ problem-list.json），但保留目录本身，
// 避免误删用户专门挑选的自定义目录。
export function clearProblemCache(): ClearResult {
  const dir = getProblemCacheDir();
  const errors: string[] = [];
  const targets = ['statements', 'code', 'problem-list.json'].map((n) => path.join(dir, n));
  let removed = 0;
  for (const t of targets) {
    if (!fs.existsSync(t)) continue;
    try {
      const stat = fs.statSync(t);
      if (stat.isDirectory()) {
        const c = countFiles(t);
        fs.rmSync(t, { recursive: true, force: true });
        removed += c;
      } else {
        fs.rmSync(t, { force: true });
        removed += 1;
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { ok: errors.length === 0, removed, errors };
}

// 将当前缓存目录下的全部内容（statements/ code/ problem-list.json）移动到 newDir。
// 采用「先复制后删除」策略, 跨盘移动也安全; oldDir 不存在时仅切换目录不移动。
export function migrateProblemCache(newDir: string): MigrateResult {
  const oldDir = getProblemCacheDir();
  const target =
    newDir && newDir.trim()
      ? newDir.trim()
      : path.join(app.getPath('userData'), 'problem-cache');
  const errors: string[] = [];

  // 目录未变化: 仅确保生效, 不移动
  if (path.resolve(oldDir) === path.resolve(target)) {
    customCacheDir = target;
    return { ok: true, moved: 0, targetDir: target, errors };
  }

  try {
    if (!fs.existsSync(oldDir)) {
      fs.mkdirSync(target, { recursive: true });
      customCacheDir = target;
      return { ok: true, moved: 0, targetDir: target, errors };
    }
    const before = countFiles(oldDir);
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(oldDir, { withFileTypes: true })) {
      const s = path.join(oldDir, entry.name);
      const d = path.join(target, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(s, d);
        fs.rmSync(s, { recursive: true, force: true });
      } else {
        fs.copyFileSync(s, d);
        fs.rmSync(s, { force: true });
      }
    }
    customCacheDir = target;
    return { ok: true, moved: before, targetDir: target, errors };
  } catch (e) {
    errors.push((e as Error).message);
    return { ok: false, moved: 0, targetDir: target, errors };
  }
}
