import { useEffect, useState } from 'react';

/**
 * 团队 AI 分析状态的「全局管理器」。
 *
 * 为什么需要它: 原本「分析中 / 出错」状态放在 TeamAISection 的组件本地 state,
 * 而该组件只在团队展开时挂载。一旦用户点击别处(收起团队、点成员跳转到好友页导致 Teams 整页卸载),
 * 组件卸载后本地状态与完成回调一起丢失 —— 主进程其实仍在跑并写盘, 但前端重新进来看到的是报错或空白,
 * 表现就像「分析中断」。
 *
 * 解法: 把状态放进程级单例, 与任何组件生命周期解耦; 主进程写盘后主动推送 ai:teamAnalysisDone 事件,
 * 由管理器统一广播「完成」并触发历史重载。组件卸载再挂载都不会丢失「分析中」状态。
 */

export type TeamAnalysisStatus = 'idle' | 'loading' | 'error';

interface TeamStatusEntry {
  status: TeamAnalysisStatus;
  error: string;
}

const statusMap = new Map<string, TeamStatusEntry>();
const statusListeners = new Set<() => void>();
const doneListeners = new Set<(teamId: string) => void>();
let eventsInitialized = false;

function emitStatus() {
  for (const l of statusListeners) l();
}

/** 订阅任意团队状态变化(组件用 useTeamAnalysisStatus 间接订阅自己的 teamId) */
export function subscribeTeamStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

export function getTeamStatus(teamId: string): TeamStatusEntry {
  return statusMap.get(teamId) ?? { status: 'idle', error: '' };
}

/** 标记某团队开始分析(组件卸载也不丢失) */
export function startTeamAnalysis(teamId: string) {
  statusMap.set(teamId, { status: 'loading', error: '' });
  emitStatus();
}

/** 分析失败: 记录错误信息供组件展示 */
export function failTeamAnalysis(teamId: string, error: string) {
  statusMap.set(teamId, { status: 'error', error });
  emitStatus();
}

/**
 * 分析完成: 清状态 + 通知所有关心该团队的监听者(通常触发历史重载)。
 * 由主进程 ai:teamAnalysisDone 事件驱动。
 */
export function finishTeamAnalysis(teamId: string) {
  statusMap.delete(teamId);
  emitStatus();
  for (const l of doneListeners) l(teamId);
}

/** 注册「某团队分析完成」回调, 返回取消函数 */
export function onTeamAnalysisDone(cb: (teamId: string) => void): () => void {
  doneListeners.add(cb);
  return () => doneListeners.delete(cb);
}

/** 注册一次性的全局主进程完成事件监听(多次调用只生效一次) */
export function initTeamAnalysisEvents() {
  if (eventsInitialized) return;
  eventsInitialized = true;
  window.api.ai.onTeamAnalysisDone((_e, payload: { teamId: string }) => {
    const teamId = payload?.teamId;
    if (teamId) finishTeamAnalysis(teamId);
  });
}

/** React Hook: 订阅指定团队的瞬时分析状态(loading / error) */
export function useTeamAnalysisStatus(teamId: string): TeamStatusEntry {
  const [entry, setEntry] = useState<TeamStatusEntry>(() => getTeamStatus(teamId));
  useEffect(() => {
    setEntry(getTeamStatus(teamId));
    return subscribeTeamStatus(() => setEntry(getTeamStatus(teamId)));
  }, [teamId]);
  return entry;
}
