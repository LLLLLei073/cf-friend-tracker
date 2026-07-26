import { useEffect, useState, useMemo, useRef } from 'react';
import type { ChangeEvent, CompositionEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import type { Team, TeamAIResult, AIProblemSet, AIKnowledgePoint, AIExportFormat } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import { NO_AVATAR, countACProblems } from '../utils/helpers';
import { useAppData } from '../hooks/useAppData';
import styles from '../styles/teams.module.css';

const MAX_MEMBERS = 3;

const PRIORITY_LABEL: Record<AIKnowledgePoint['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};
const PRIORITY_COLOR: Record<AIKnowledgePoint['priority'], string> = {
  high: '#C41E3A',
  medium: '#E8820C',
  low: '#6B655A',
};

/** 把题目编号(如 1234A)转成 CF 题目页链接, 无法解析时返回 null */
function problemUrl(code: string): string | null {
  const m = code.trim().match(/^(\d+)([A-Za-z]\d?)$/);
  if (!m) return null;
  return `https://codeforces.com/problemset/problem/${m[1]}/${m[2]}`;
}

/** 单个团队的 AI 分析区块: 维护历史记录、导出与查看 */
function TeamAISection({ team, aiReady, onTeamUpdate }: { team: Team; aiReady: boolean; onTeamUpdate?: (t: Team) => void }) {
  const [history, setHistory] = useState<TeamAIResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    const list = await window.api.ai.getTeamAIHistory(team.id);
    setHistory(list);
    setSelectedIdx((prev) => (prev >= list.length ? 0 : prev));
  };

  useEffect(() => {
    setError('');
    setExportMsg('');
    loadHistory();
  }, [team.id]);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      // 取最新已保存的 settings 传入, 避免依赖自动保存时序
      const settings = await window.api.store.getSettings();
      await window.api.ai.analyzeTeam(team.id, settings);
      const list = await window.api.ai.getTeamAIHistory(team.id);
      setHistory(list);
      setSelectedIdx(0); // 新生成的在最前
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const cur = history[selectedIdx];
    if (!cur) return;
    if (!confirm('确定删除这条历史记录吗?')) return;
    await window.api.ai.removeTeamAIResult(team.id, cur.id);
    const list = await window.api.ai.getTeamAIHistory(team.id);
    setHistory(list);
    setSelectedIdx(0);
  };

  const handleClear = async () => {
    if (history.length === 0) return;
    if (!confirm('确定清空该团队的全部 AI 分析历史吗?')) return;
    await window.api.ai.clearTeamAIHistory(team.id);
    setHistory([]);
    setSelectedIdx(0);
  };

  const handleExport = async (format: AIExportFormat) => {
    const cur = history[selectedIdx];
    if (!cur) return;
    setExportMenuOpen(false);
    setExporting(true);
    setExportMsg('');
    try {
      if (format === 'image') {
        if (!reportRef.current) throw new Error('报告尚未渲染, 请稍候再试');
        // 用当前主题背景色作为画布底, 保证文字在图片中可读
        const bg = getComputedStyle(document.body).backgroundColor || '#FFFEF9';
        const dataUrl = await toPng(reportRef.current, {
          backgroundColor: bg,
          pixelRatio: 2,
          cacheBust: true,
        });
        const res = await window.api.ai.exportReport(team.name, cur, 'image', dataUrl, team.goal);
        if (res.ok) {
          setExportMsg(`✓ 已导出图片到: ${res.path}`);
        } else if (res.canceled) {
          setExportMsg('');
        } else {
          setExportMsg(`✗ 导出失败: ${res.error ?? '未知错误'}`);
        }
      } else {
        const res = await window.api.ai.exportReport(team.name, cur, format, undefined, team.goal);
        if (res.ok) {
          setExportMsg(`✓ 已导出到: ${res.path}`);
        } else if (res.canceled) {
          setExportMsg('');
        } else {
          setExportMsg(`✗ 导出失败: ${res.error ?? '未知错误'}`);
        }
      }
    } catch (e) {
      setExportMsg(`✗ 导出失败: ${(e as Error).message}`);
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(''), 6000);
    }
  };

  const selected = history[selectedIdx];

  // 目标输入框本地草稿：避免中文输入法组合期间把父级状态(setTeams 经异步写文件)回灌进 value 导致拼音重复
  const [goalDraft, setGoalDraft] = useState(team.goal ?? '');
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    setGoalDraft(team.goal ?? '');
  }, [team.id, team.goal]);

  const commitGoal = (val: string) => {
    onTeamUpdate?.({ ...team, goal: val });
  };
  const handleGoalChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGoalDraft(val); // 同步更新本地受控值(受 React composition 保护, 不会干扰输入法)
    if (!composing) commitGoal(val); // 非组合输入(英文/数字/已定稿)才提交父级
  };
  const handleGoalCompositionStart = () => setComposing(true);
  const handleGoalCompositionEnd = (e: CompositionEvent<HTMLInputElement>) => {
    setComposing(false);
    const val = e.currentTarget.value;
    setGoalDraft(val);
    commitGoal(val); // 拼音选字完成后一次性提交, 避免每次按键都跨进程写文件+setTeams
  };

  return (
    <div className={styles.aiSection}>
      <div className={styles.goalEdit}>
        <label className={styles.goalLabel} htmlFor={`goal-${team.id}`}>🎯 团队目标</label>
        <input
          id={`goal-${team.id}`}
          className={styles.goalInput}
          type="text"
          value={goalDraft}
          placeholder="如：冲击 Div.2 前 500 / 两周内全员蓝名"
          onChange={handleGoalChange}
          onCompositionStart={handleGoalCompositionStart}
          onCompositionEnd={handleGoalCompositionEnd}
        />
        <span className={styles.goalHint}>AI 分析将围绕此目标给出建议与推荐题库</span>
      </div>

      <div className={styles.aiHeader}>
        <h4 className={styles.aiTitle}>🤖 AI 教练分析</h4>
        <div className={styles.aiHeaderBtns}>
          <button
            onClick={run}
            className={styles.aiBtn}
            disabled={loading || !aiReady}
            title={!aiReady ? '请先在设置中配置 AI 接口' : ''}
          >
            {loading ? '分析中...' : '生成分析'}
          </button>
          <div className={styles.exportWrap}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              className={styles.aiGhostBtn}
              disabled={exporting || !selected}
              title={selected ? '导出当前报告' : '暂无报告可导出'}
            >
              {exporting ? '导出中...' : '⬇ 导出报告 ▾'}
            </button>
            {exportMenuOpen && selected && !exporting && (
              <>
                <div className={styles.exportOverlay} onClick={() => setExportMenuOpen(false)} />
                <div className={styles.exportMenu}>
                  <button className={styles.exportMenuItem} onClick={() => handleExport('markdown')}>
                    📄 Markdown (.md)
                  </button>
                  <button className={styles.exportMenuItem} onClick={() => handleExport('excel')}>
                    📊 Excel (.xlsx)
                  </button>
                  <button className={styles.exportMenuItem} onClick={() => handleExport('image')}>
                    🖼️ 图片 (.png)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!aiReady && (
        <p className={styles.aiHint}>未配置 AI 接口，请先在「设置」中填写 API 地址、Key 与模型。</p>
      )}

      {history.length > 0 && (
        <div className={styles.aiHistoryBar}>
          <label className={styles.aiHistoryLabel}>历史记录 ({history.length})</label>
          <select
            className={styles.aiHistorySelect}
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
          >
            {history.map((r, i) => (
              <option key={r.id} value={i}>
                {new Date(r.generatedAt).toLocaleString()} · {r.model}
              </option>
            ))}
          </select>
          <button onClick={handleDelete} className={styles.aiMiniBtn} disabled={!selected}>删除此条</button>
          <button onClick={handleClear} className={styles.aiMiniBtn}>清空历史</button>
        </div>
      )}

      {loading && <p className={styles.aiLoading}>⏳ AI 正在根据队伍数据生成分析，请稍候（可能需要 10-30 秒）...</p>}

      {error && <p className={styles.aiError}>✗ {error}</p>}

      {exportMsg && (
        <p className={styles.aiExportMsg} style={{ color: exportMsg.startsWith('✓') ? '#4A7C3A' : '#C41E3A' }}>
          {exportMsg}
        </p>
      )}

      {selected && !loading && (
        <div className={styles.aiBody} ref={reportRef}>
          <div className={styles.aiCaptureHead}>
            <div className={styles.aiCaptureTitle}>{team.name} · AI 分析报告</div>
            {team.goal?.trim() && (
              <div className={styles.aiCaptureGoal}>🎯 目标：{team.goal.trim()}</div>
            )}
          </div>
          <section className={styles.aiBlock}>
            <h5 className={styles.aiBlockTitle}>📊 整体分析</h5>
            <p className={styles.aiAnalysis}>{selected.analysis}</p>
          </section>

          {selected.problemSets.length > 0 && (
            <section className={styles.aiBlock}>
              <h5 className={styles.aiBlockTitle}>📝 推荐题单</h5>
              <div className={styles.aiProblemList}>
                {selected.problemSets.map((ps, i) => (
                  <ProblemSetCard key={i} ps={ps} />
                ))}
              </div>
            </section>
          )}

          {selected.knowledgePoints.length > 0 && (
            <section className={styles.aiBlock}>
              <h5 className={styles.aiBlockTitle}>🧠 知识点清单</h5>
              <div className={styles.aiKpList}>
                {selected.knowledgePoints.map((kp, i) => (
                  <div key={i} className={styles.aiKpItem}>
                    <div className={styles.aiKpHead}>
                      <span className={styles.aiKpTopic}>{kp.topic}</span>
                      <span
                        className={styles.aiPriority}
                        style={{ color: PRIORITY_COLOR[kp.priority], borderColor: PRIORITY_COLOR[kp.priority] }}
                      >
                        优先级: {PRIORITY_LABEL[kp.priority]}
                      </span>
                    </div>
                    <p className={styles.aiKpDesc}>{kp.description}</p>
                    {kp.members.length > 0 && (
                      <div className={styles.aiMembers}>
                        {kp.members.map((m) => (
                          <span key={m} className={styles.aiMemberTag}>{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className={styles.aiFooter}>
            生成于 {new Date(selected.generatedAt).toLocaleString()} · 模型 {selected.model}
          </p>
        </div>
      )}
    </div>
  );
}

function ProblemSetCard({ ps }: { ps: AIProblemSet }) {
  return (
    <div className={styles.aiProblemCard}>
      <div className={styles.aiProblemTitle}>{ps.title}</div>
      <div className={styles.aiProblemMeta}>
        {ps.topic && <span className={styles.aiMetaTag}>知识点: {ps.topic}</span>}
        {ps.difficulty && <span className={styles.aiMetaTag}>难度: {ps.difficulty}</span>}
      </div>
      {ps.reason && <p className={styles.aiReason}>{ps.reason}</p>}
      {ps.problems.length > 0 && (
        <div className={styles.aiProblems}>
          {ps.problems.map((code) => {
            const url = problemUrl(code);
            return url ? (
              <a
                key={code}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={styles.aiProblemChip}
              >
                {code}
              </a>
            ) : (
              <span key={code} className={styles.aiProblemChip}>{code}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Teams() {
  const navigate = useNavigate();
  const { friends, caches, myHandle } = useAppData();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamGoal, setTeamGoal] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(false);

  const loadTeams = async () => {
    const t = await window.api.store.getTeams();
    setTeams(t);
  };

  useEffect(() => {
    loadTeams();
    // 检测 AI 接口是否已配置, 用于在团队页提示/禁用 AI 分析按钮
    window.api.store.getSettings().then((s) => {
      setAiReady(!!(s.aiApiBase && s.aiApiKey && s.aiModel));
    });
  }, []);

  // 合并:自己 + 好友(去重)
  const allOptions = useMemo(() => [
    ...(myHandle ? [{ handle: myHandle, alias: myHandle, isMe: true }] : []),
    ...friends
      .filter((f) => f.handle !== myHandle)
      .map((f) => ({ handle: f.handle, alias: f.alias || f.handle, isMe: false })),
  ], [friends, myHandle]);

  const toggleMember = (handle: string) => {
    setError('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) {
        next.delete(handle);
      } else {
        if (next.size >= MAX_MEMBERS) {
          setError(`最多选择 ${MAX_MEMBERS} 名成员`);
          return prev;
        }
        next.add(handle);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    setError('');
    if (!teamName.trim()) {
      setError('请填写团队名称');
      return;
    }
    if (selected.size === 0) {
      setError('至少选择一名成员');
      return;
    }
    const team: Team = {
      id: `team_${Date.now()}`,
      name: teamName.trim(),
      members: Array.from(selected),
      createdAt: Date.now(),
      goal: teamGoal.trim() || undefined,
    };
    await window.api.store.addTeam(team);
    setTeamName('');
    setTeamGoal('');
    setSelected(new Set());
    setShowCreate(false);
    await loadTeams();
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这个团队吗?')) {
      await window.api.store.removeTeam(id);
      await loadTeams();
    }
  };

  // 更新团队(目标等字段), 持久化并同步本地列表, 供 TeamAISection 编辑目标时回调
  const handleTeamUpdate = async (updated: Team) => {
    await window.api.store.updateTeam(updated);
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  // 今日 AC 统计的时间起点(移到 map 外部避免重复计算)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartSec = Math.floor(todayStart.getTime() / 1000);

  return (
    <div>
      <h2 className={styles.heading}>团队</h2>

      <button onClick={() => { setShowCreate(!showCreate); setSelected(new Set()); setTeamGoal(''); setError(''); }} className={styles.createBtn}>
        {showCreate ? '取消' : '+ 创建团队'}
      </button>

      {showCreate && (
        <div className={styles.createForm}>
          <div className={styles.field}>
            <label>团队名称</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="给团队起个名字"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>
              团队目标（选填，AI 分析将围绕目标给出建议与推荐题库）
            </label>
            <input
              type="text"
              value={teamGoal}
              onChange={(e) => setTeamGoal(e.target.value)}
              placeholder="如：冲击 Div.2 前 500"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>
              选择成员(最多 {MAX_MEMBERS} 人,已选 {selected.size})
            </label>
            {allOptions.length === 0 ? (
              <p className={styles.hintText}>请先在设置中填写自己的 handle,或添加好友。</p>
            ) : (
              <div className={styles.friendPicker}>
                {allOptions.map((opt) => {
                  const cache = caches[opt.handle];
                  const info = cache?.info;
                  const isChecked = selected.has(opt.handle);
                  return (
                    <label
                      key={opt.handle}
                      className={`${styles.friendOption} ${isChecked ? styles.friendOptionActive : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMember(opt.handle)}
                      />
                      <img
                        src={info?.avatar || NO_AVATAR}
                        className={styles.pickAvatar}
                        alt={opt.handle}
                      />
                      <span className={styles.pickName}>
                        {opt.alias}
                        {opt.isMe && <span className={styles.meTag}>我</span>}
                      </span>
                      {info?.rating !== undefined && (
                        <span
                          className={styles.pickRating}
                          style={{ color: getRankColor(info.rank) }}
                        >
                          {info.rating}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button onClick={handleCreate} className={styles.submitBtn}>创建</button>
        </div>
      )}

      {teams.length === 0 && !showCreate ? (
        <p className={styles.empty}>还没有团队,点击上方按钮创建。</p>
      ) : (
        <div className={styles.teamList}>
          {teams.map((team) => {
            const ratings = team.members
              .map((h) => caches[h]?.info?.rating)
              .filter((r): r is number => r !== undefined);
            const avgRating = ratings.length > 0
              ? Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
              : 0;

            // 计算今日 AC 题数
            const memberStats = team.members.map((h) => {
              const cache = caches[h];
              const subs = cache?.recentSubmissions ?? [];
              return {
                handle: h,
                avatar: cache?.info?.avatar,
                rank: cache?.info?.rank,
                rating: cache?.info?.rating,
                solvedToday: countACProblems(subs, todayStartSec),
              };
            });

            const sortedBySolved = [...memberStats].sort((a, b) => b.solvedToday - a.solvedToday);
            const maxSolved = sortedBySolved[0]?.solvedToday ?? 0;
            const minSolved = sortedBySolved[sortedBySolved.length - 1]?.solvedToday ?? 0;
            const hardestList = sortedBySolved.filter((m) => m.solvedToday === maxSolved);
            const slackerList = sortedBySolved.filter((m) => m.solvedToday === minSolved);
            const isExpanded = expandedId === team.id;

            return (
              <div key={team.id} className={styles.teamCard}>
                <div
                  className={styles.teamHeader}
                  onClick={() => setExpandedId(isExpanded ? null : team.id)}
                >
                  <div className={styles.teamHeaderLeft}>
                    <h3 className={styles.teamName}>{team.name}</h3>
                    <span className={styles.expandHint}>{isExpanded ? '▼ 收起' : '▶ 展开详情'}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                    className={styles.deleteBtn}
                  >删除</button>
                </div>
                <div className={styles.teamStats}>
                  <span className={styles.totalRating}>平均 Rating: {avgRating}</span>
                  <span className={styles.memberCount}>{team.members.length} 人</span>
                </div>
                <div className={styles.memberList}>
                  {team.members.map((h) => {
                    const cache = caches[h];
                    const info = cache?.info;
                    return (
                      <div
                        key={h}
                        className={styles.memberItem}
                        onClick={(e) => { e.stopPropagation(); navigate(`/friends/${h}`); }}
                      >
                        <img
                          src={info?.avatar || NO_AVATAR}
                          className={styles.memberAvatar}
                          alt={h}
                        />
                        <div className={styles.memberInfo}>
                          <span className={styles.memberHandle}>{h}</span>
                          {info && (
                            <span style={{ color: getRankColor(info.rank), fontSize: '12px' }}>
                              {getRankLabel(info.rank)} · {info.rating ?? 'N/A'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isExpanded && (
                  <div className={styles.dailySection}>
                    <h4 className={styles.dailyTitle}>今日战况</h4>
                    <div className={styles.dailyGrid}>
                      <div className={styles.dailyCard}>
                        <div className={styles.dailyLabel}>🔥 今日最卷{hardestList.length > 1 && ` (${hardestList.length}人并列)`}</div>
                        {hardestList.map((m) => (
                          <div
                            key={m.handle}
                            className={styles.dailyMember}
                            onClick={() => navigate(`/friends/${m.handle}`)}
                          >
                            <img
                              src={m.avatar || NO_AVATAR}
                              className={styles.dailyAvatar}
                              alt={m.handle}
                            />
                            <div className={styles.dailyInfo}>
                              <span className={styles.dailyHandle}>{m.handle}</span>
                              <span className={styles.dailySolved}>
                                今日 AC <strong style={{ color: '#4A7C3A' }}>{m.solvedToday}</strong> 题
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={styles.dailyCard}>
                        <div className={styles.dailyLabel}>😴 今日最拉{slackerList.length > 1 && ` (${slackerList.length}人并列)`}</div>
                        {slackerList.map((m) => (
                          <div
                            key={m.handle}
                            className={styles.dailyMember}
                            onClick={() => navigate(`/friends/${m.handle}`)}
                          >
                            <img
                              src={m.avatar || NO_AVATAR}
                              className={styles.dailyAvatar}
                              alt={m.handle}
                            />
                            <div className={styles.dailyInfo}>
                              <span className={styles.dailyHandle}>{m.handle}</span>
                              <span className={styles.dailySolved}>
                                今日 AC <strong style={{ color: m.solvedToday === 0 ? '#C41E3A' : '#2C2A26' }}>{m.solvedToday}</strong> 题
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <table className={styles.dailyTable}>
                      <thead>
                        <tr>
                          <th>成员</th>
                          <th>今日 AC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBySolved.map((m, i) => (
                          <tr key={m.handle}>
                            <td>
                              <span style={{ marginRight: 6 }}>
                                {m.solvedToday === maxSolved && maxSolved > 0 ? '🔥' : m.solvedToday === minSolved ? '😴' : '  '}
                              </span>
                              {m.handle}
                            </td>
                            <td className={styles.dailyNum}>
                              <span style={{
                                color: m.solvedToday === 0 ? '#C41E3A' : m.solvedToday === maxSolved ? '#4A7C3A' : '#2C2A26',
                                fontWeight: 'bold',
                              }}>
                                {m.solvedToday}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <TeamAISection team={team} aiReady={aiReady} onTeamUpdate={handleTeamUpdate} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
