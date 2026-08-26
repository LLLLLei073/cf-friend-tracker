import type { ContestLevel, SpecialContestType } from '../types';

/** 从比赛名称解析 Div 级别（Div.1+2 优先于单独的 Div.1/Div.2） */
export function parseContestLevel(name: string): ContestLevel {
  if (/Div\.\s*1\s*\+\s*Div\.\s*2/i.test(name)) return 'Div.1+2';
  if (/Div\.\s*4\b/i.test(name)) return 'Div.4';
  if (/Div\.\s*3\b/i.test(name)) return 'Div.3';
  if (/Div\.\s*2\b/i.test(name)) return 'Div.2';
  if (/Div\.\s*1\b/i.test(name)) return 'Div.1';
  return 'Other';
}

/** 从比赛名称识别特殊赛事类型（教育场 / 全球赛 / 主题赛等） */
export function parseSpecialType(name: string): SpecialContestType {
  if (/Educational/i.test(name)) return 'Educational';
  if (/Global\s*Round/i.test(name)) return 'Global';
  if (/Hello/i.test(name)) return 'Hello';
  if (/Good\s*Bye/i.test(name)) return 'GoodBye';
  if (/Kotlin/i.test(name)) return 'Kotlin';
  if (/Marathon/i.test(name)) return 'Marathon';
  if (/\bICPC\b/i.test(name)) return 'ICPC';
  if (/\bIOI\b/i.test(name)) return 'IOI';
  return 'Other';
}

export const LEVEL_OPTIONS: ContestLevel[] = ['Div.1', 'Div.1+2', 'Div.2', 'Div.3', 'Div.4', 'Other'];
export const SPECIAL_OPTIONS: SpecialContestType[] = [
  'Educational',
  'Global',
  'Hello',
  'GoodBye',
  'Kotlin',
  'Marathon',
  'ICPC',
  'IOI',
  'Other',
];
