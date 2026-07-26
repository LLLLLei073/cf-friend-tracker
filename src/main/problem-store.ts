import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ProblemListItem, ProblemStatement } from '../shared/types';

// 题目数据缓存目录（位于用户数据目录下, 与应用数据隔离）
function cacheDir(): string {
  return path.join(app.getPath('userData'), 'problem-cache');
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
