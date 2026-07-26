import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchProblemset } from './cf-api';
import { getProblemList, setProblemList, getStatement, setStatement, isListFresh } from './problem-store';
import type { ProblemListItem, ProblemStatement, SampleTest } from '../shared/types';

const PROBLEM_PAGE_TIMEOUT = 20000;

// 规范化样例文本: 统一换行符, 去掉首尾多余空行
function normalizeText(t: string): string {
  return t
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

// Codeforces 新版题面把每个样例行放在 <pre> 内的 <div class="test-example-line"> 里。
// cheerio 的 .text() 会直接拼接所有 div 的文本, 导致换行丢失、所有数字连成一行。
// 这里优先按 .test-example-line 分行, 没有该结构时再回退到 .text()。
function extractPreText($: cheerio.CheerioAPI, pre: cheerio.Element): string {
  const lines = $(pre)
    .find('.test-example-line')
    .map((_i, el) => $(el).text())
    .get();
  if (lines.length > 0) {
    return lines.join('\n');
  }
  return $(pre).text();
}

// 把 problemset.problems 的返回映射为浏览用的轻量列表, 并合并通过人数
async function mapProblemList(): Promise<ProblemListItem[]> {
  const data = await fetchProblemset();
  const statMap = new Map<string, number>();
  for (const s of data.problemStatistics) {
    if (s.contestId !== undefined) {
      statMap.set(`${s.contestId}_${s.index}`, s.solvedCount);
    }
  }
  return data.problems.map((p) => ({
    contestId: p.contestId ?? 0,
    index: p.index,
    name: p.name,
    rating: p.rating,
    tags: p.tags ?? [],
    type: p.type,
    solvedCount: p.contestId !== undefined ? statMap.get(`${p.contestId}_${p.index}`) : undefined,
  }));
}

// 抓取并解析单个题面（HTML + 样例）
async function scrapeStatement(contestId: number, index: string): Promise<ProblemStatement> {
  if (!contestId || contestId <= 0) {
    throw new Error('该题目缺少 contestId, 暂不支持抓取（多为 Gym/特殊赛题）');
  }
  const url = `https://codeforces.com/contest/${contestId}/problem/${index}`;
  const resp = await axios.get(url, {
    timeout: PROBLEM_PAGE_TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CFFriendTracker/1.0)',
      Accept: 'text/html',
    },
  });

  const $ = cheerio.load(resp.data as string);
  const stmtEl = $('.problem-statement');
  if (stmtEl.length === 0) {
    throw new Error('未能解析题面, 题目可能不存在或页面结构已变化');
  }

  // 题名: .title 形如 "A. Problem Name"
  const titleText = stmtEl.find('.title').first().text().trim();
  const name = titleText.replace(/^[A-Z0-9]+\.\s*/, '').trim() || `Problem ${index}`;

  // 样例: 按出现顺序收集所有 input / output 的 pre 文本, 再两两配对
  const inputs = stmtEl
    .find('.sample-tests .input pre')
    .map((_i, el) => extractPreText($, el))
    .get();
  const outputs = stmtEl
    .find('.sample-tests .output pre')
    .map((_i, el) => extractPreText($, el))
    .get();
  const samples: SampleTest[] = [];
  const n = Math.min(inputs.length, outputs.length);
  for (let i = 0; i < n; i++) {
    samples.push({ input: normalizeText(inputs[i]), output: normalizeText(outputs[i]) });
  }

  // 清洗: 去掉可能执行脚本/外链的元素, 避免注入到渲染进程后产生副作用
  const $stmt = stmtEl.clone();
  $stmt.find('script, iframe, object, embed, link, meta').remove();

  const html = $stmt.html() ?? '';
  const now = Date.now();
  return {
    contestId,
    index,
    name,
    html,
    samples,
    cachedAt: now,
    fetchedAt: now,
  };
}

// 获取题目列表: 优先返回本地缓存（未过期）, 否则拉取并缓存
export async function fetchProblemList(force = false): Promise<ProblemListItem[]> {
  if (!force && isListFresh()) {
    const cached = getProblemList();
    if (cached) return cached.list;
  }
  const list = await mapProblemList();
  setProblemList(list);
  return list;
}

// 强制刷新题目列表
export async function refreshProblemList(): Promise<ProblemListItem[]> {
  return fetchProblemList(true);
}

// 获取题面: 优先返回本地缓存, 否则抓取并缓存
export async function fetchProblemStatement(
  contestId: number,
  index: string,
): Promise<ProblemStatement> {
  const cached = getStatement(contestId, index);
  if (cached) return cached;
  const stmt = await scrapeStatement(contestId, index);
  setStatement(stmt);
  return stmt;
}
