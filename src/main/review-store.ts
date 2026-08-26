import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ReviewState, ReviewProblem, DailyPractice } from '../shared/types';

// 复习库持久化文件（独立于 electron-store，单独管理题目练习数据）
const FILE = path.join(app.getPath('userData'), 'review-library.json');

function defaultState(): ReviewState {
  return { problems: [], performance: {} };
}

function load(): ReviewState {
  try {
    if (!fs.existsSync(FILE)) return defaultState();
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return {
      problems: Array.isArray(data.problems) ? (data.problems as ReviewProblem[]) : [],
      daily: data.daily ?? undefined,
      performance:
        data.performance && typeof data.performance === 'object'
          ? (data.performance as Record<number, number>)
          : {},
    };
  } catch {
    return defaultState();
  }
}

function save(): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(state), 'utf-8');
  } catch (e) {
    console.error('写入复习库失败:', (e as Error).message);
  }
}

// 模块级单例（进程内缓存，避免每次读盘）
const state: ReviewState = load();

export function getReviewState(): ReviewState {
  return state;
}

export function addReviewProblems(items: ReviewProblem[]): number {
  let added = 0;
  for (const item of items) {
    const key = `${item.contestId}_${item.index}`;
    if (state.problems.some((p) => `${p.contestId}_${p.index}` === key)) continue;
    state.problems.unshift({ ...item });
    added++;
  }
  if (added > 0) save();
  return added;
}

export function removeReviewProblem(contestId: number, index: string): boolean {
  const next = state.problems.filter((p) => !(p.contestId === contestId && p.index === index));
  if (next.length === state.problems.length) return false;
  state.problems = next;
  save();
  return true;
}

export function setReviewNote(contestId: number, index: string, note: string): boolean {
  const p = state.problems.find((x) => x.contestId === contestId && x.index === index);
  if (!p) return false;
  p.note = note;
  save();
  return true;
}

export function clearReviewProblems(): void {
  state.problems = [];
  save();
}

export function setDailyPractice(daily: DailyPractice): void {
  state.daily = daily;
  save();
}

export function getPerformance(contestId: number): number | undefined {
  return state.performance[contestId];
}

export function setPerformance(contestId: number, score: number): void {
  state.performance[contestId] = score;
  save();
}
