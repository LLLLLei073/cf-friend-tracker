import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProblemListItem, AIProblemSet } from '../types';
import { getRatingColor } from '../utils/rank';
import { translateTag } from '../utils/tagLabels';
import styles from '../styles/problems.module.css';

const PAGE_SIZE = 50;
const SEARCH_PREFS_KEY = 'cf-friend-tracker:problemsSearch';

// 把题目编号(如 "1234A" / "1234a" / "1900B2")解析为比赛编号与题号
function parseProblemCode(code: string): { contestId: number; index: string } | null {
  const m = code.trim().match(/^(\d+)\s*([A-Za-z]\d?)$/);
  if (!m) return null;
  return { contestId: parseInt(m[1], 10), index: m[2].toUpperCase() };
}

// AI 报告「推荐题单」模块: 每次报告合成一个模块
interface ReportModule {
  reportId: string;
  teamId: string;
  teamName: string;
  generatedAt: number;
  model: string;
  problemSets: AIProblemSet[];
  problemCount: number;
}

type SearchPrefs = {
  contestQuery?: string;
  currentContest?: number | null;
};

function readSearchPrefs(): SearchPrefs {
  try {
    const raw = localStorage.getItem(SEARCH_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SearchPrefs;
    return {
      contestQuery: typeof parsed.contestQuery === 'string' ? parsed.contestQuery : '',
      currentContest:
        typeof parsed.currentContest === 'number' ? parsed.currentContest : null,
    };
  } catch {
    return {};
  }
}

function writeSearchPrefs(prefs: SearchPrefs): void {
  try {
    localStorage.setItem(SEARCH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* 忽略写入失败 */
  }
}

export default function Problems() {
  const navigate = useNavigate();
  const [all, setAll] = useState<ProblemListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initialPrefs = readSearchPrefs();

  // 比赛搜索框（输入比赛编号或具体题目, 如 2250 / 2250C）
  const [contestQuery, setContestQuery] = useState(initialPrefs.contestQuery ?? '');
  const [currentContest, setCurrentContest] = useState<number | null>(
    initialPrefs.currentContest ?? null,
  );

  // 比赛内筛选条件
  const [page, setPage] = useState(1);

  // 首次使用刷题功能时, 若未设置题目缓存目录则弹出设置引导
  const [showCacheSetup, setShowCacheSetup] = useState(false);
  const [cacheSetupMsg, setCacheSetupMsg] = useState('');
  // 清空题目缓存的结果反馈
  const [clearMsg, setClearMsg] = useState('');

  // AI 报告推荐的题单模块（每次报告合成一个模块）
  const [reportModules, setReportModules] = useState<ReportModule[]>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // 从输入中解析比赛编号（取第一个出现的数字），"2250C" / "2250" 均得到 2250
  const parseContestId = (q: string): number | null => {
    const m = q.trim().match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };

  // 加载所有团队的 AI 分析报告, 将「每次报告」合成一个推荐题单模块
  const loadReportModules = useCallback(async () => {
    try {
      const teams = await window.api.store.getTeams();
      const mods: ReportModule[] = [];
      for (const t of teams) {
        const history = await window.api.ai.getTeamAIHistory(t.id);
        for (const r of history) {
          const count = r.problemSets.reduce((sum, ps) => sum + ps.problems.length, 0);
          if (count === 0) continue;
          mods.push({
            reportId: r.id,
            teamId: t.id,
            teamName: t.name,
            generatedAt: r.generatedAt,
            model: r.model,
            problemSets: r.problemSets,
            problemCount: count,
          });
        }
      }
      // 按生成时间倒序(新报告在前)
      mods.sort((a, b) => b.generatedAt - a.generatedAt);
      setReportModules(mods);
    } catch (e) {
      console.error('加载 AI 报告推荐题单失败:', e);
    }
  }, []);

  // 展开 / 收起某个报告模块
  const toggleModule = (reportId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  // 点击推荐题目: 解析后用题目练习视图打开(题面未缓存会自动用本地浏览器打开原题)
  const openRecommendedProblem = (code: string) => {
    const p = parseProblemCode(code);
    if (!p) return;
    navigate(`/problems/${p.contestId}/${p.index}`);
  };

  // 加载某场比赛的题目（按比赛顺序 A, B, C...），不再首屏拉取全量
  const loadContest = useCallback(async (contestId: number, force = false) => {
    setLoading(true);
    setError('');
    try {
      const data = await window.api.problem.getContestProblems(contestId, force);
      const usable = data.filter((p) => p.contestId && p.contestId > 0);
      setAll(usable);
      setCurrentContest(contestId);
    } catch (e) {
      let msg = (e as Error).message || String(e);
      msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
      setError(`加载失败: ${msg}`);
      setCurrentContest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 搜索：从输入解析比赛编号并拉取该场比赛题目
  const handleSearch = useCallback(async () => {
    const cid = parseContestId(contestQuery);
    if (!cid) {
      setError('请输入比赛编号，例如 2250（或具体题目如 2250C）。');
      return;
    }
    setPage(1);
    await loadContest(cid, false);
  }, [contestQuery, loadContest]);

  // 首次进入刷题页: 若尚未配置题目缓存目录, 弹出设置引导
  useEffect(() => {
    (async () => {
      try {
        const s = await window.api.store.getSettings();
        if (!s.problemCacheDir) setShowCacheSetup(true);
      } catch {
        /* 忽略, 不影响刷题功能 */
      }
    })();
  }, []);

  // 加载 AI 报告推荐题单模块; 报告生成写盘后(即使本页已挂载)也自动刷新
  useEffect(() => {
    loadReportModules();
    const off = window.api.ai.onTeamAnalysisDone(() => {
      loadReportModules();
    });
    return off;
  }, [loadReportModules]);

  // 记住搜索框内容, 返回页面时不丢失
  useEffect(() => {
    writeSearchPrefs({ contestQuery, currentContest });
  }, [contestQuery, currentContest]);

  // 若上次记住了比赛编号, 返回页面时自动恢复该场比赛列表
  useEffect(() => {
    if (currentContest != null && all.length === 0 && !loading) {
      loadContest(currentContest, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 完成缓存目录设置（选择目录 / 使用默认均走此流程）
  const finishCacheSetup = async (dir: string | null) => {
    if (!dir) return; // 用户取消选择
    try {
      await window.api.problem.setCacheDir(dir);
      const s = await window.api.store.getSettings();
      await window.api.store.setSettings({ ...s, problemCacheDir: dir });
      setShowCacheSetup(false);
    } catch (e) {
      setCacheSetupMsg(`设置失败: ${(e as Error).message}`);
    }
  };

  const handlePickCacheDir = async () => {
    setCacheSetupMsg('');
    const dir = await window.api.problem.selectCacheDir();
    await finishCacheSetup(dir);
  };

  const handleDefaultCacheDir = async () => {
    setCacheSetupMsg('');
    const dir = await window.api.problem.getCacheDir();
    await finishCacheSetup(dir);
  };

  // 清空题目缓存（题面 / 题目清单 / 保存的代码），保留目录本身
  const handleClearCache = async () => {
    if (
      !confirm(
        '确定要清空题目缓存吗？已下载的题面、题目清单和保存的代码都会被删除（缓存目录本身保留）。下次打开题目会重新抓取。',
      )
    ) {
      return;
    }
    setClearMsg('');
    try {
      const res = await window.api.problem.clearCache();
      if (res.ok) {
        setClearMsg(`已清空题目缓存，共删除 ${res.removed} 个文件。`);
        // 重新拉取当前比赛（内存缓存已随题面删除失效，这里强制刷新本场列表）
        if (currentContest != null) await loadContest(currentContest, true);
        else setAll([]);
      } else {
        setClearMsg(`清空失败: ${res.errors.join('; ')}`);
      }
    } catch (e) {
      setClearMsg(`清空失败: ${(e as Error).message}`);
    }
  };

  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const pageItems = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>题目练习</h2>
        <div className={styles.headerBtns}>
          {currentContest != null && (
            <button
              className={styles.refreshBtn}
              onClick={() => loadContest(currentContest, true)}
              disabled={loading}
            >
              {loading ? '加载中...' : '刷新本场'}
            </button>
          )}
          <button className={styles.clearCacheBtn} onClick={handleClearCache}>
            清空题目缓存
          </button>
        </div>
      </div>
      <p className={styles.subtitle}>
        输入比赛编号（如 2250）或具体题目（如 2250C）搜索该场比赛的题目，按比赛顺序列出。题面需在系统浏览器中查看（Codeforces 反爬限制，应用内无法加载），点击题目会自动用本地浏览器打开原题；代码编辑与对拍基于已缓存的题面。下方「AI 报告推荐题单」会把每次 AI 分析报告的推荐题目聚合为模块，点击模块即可挑选题目练习。
      </p>

      <div className={styles.testNotice}>
        ⚠️ 刷题功能目前仅为测试功能，功能并不稳定，可能随时出现无法加载、对拍异常等问题，请谨慎使用。
      </div>

      {reportModules.length > 0 && (
        <div className={styles.reportPanel}>
          <div className={styles.reportPanelHeader}>
            <span className={styles.reportPanelTitle}>AI 报告推荐题单</span>
            <span className={styles.reportPanelCount}>{reportModules.length} 份报告</span>
          </div>
          <div className={styles.reportModules}>
            {reportModules.map((m) => {
              const isOpen = expandedModules.has(m.reportId);
              return (
                <div key={m.reportId} className={styles.reportModule}>
                  <button
                    className={styles.moduleHeader}
                    onClick={() => toggleModule(m.reportId)}
                  >
                    <span className={styles.moduleChevron}>{isOpen ? '▾' : '▸'}</span>
                    <span className={styles.moduleTeam}>{m.teamName}</span>
                    <span className={styles.moduleMeta}>
                      {new Date(m.generatedAt).toLocaleString()}
                    </span>
                    <span className={styles.moduleCount}>{m.problemCount} 题</span>
                  </button>
                  {isOpen && (
                    <div className={styles.moduleBody}>
                      {m.problemSets.map((ps, i) => (
                        <div key={i} className={styles.problemSet}>
                          <div className={styles.psHead}>
                            <span className={styles.psTitle}>{ps.title}</span>
                            {ps.difficulty && (
                              <span className={styles.psDiff}>{ps.difficulty}</span>
                            )}
                          </div>
                          {ps.topic && <div className={styles.psTopic}>知识点：{ps.topic}</div>}
                          <div className={styles.psProblems}>
                            {ps.problems.map((code, j) => {
                              const parsed = parseProblemCode(code);
                              return (
                                <button
                                  key={j}
                                  className={styles.problemChip}
                                  disabled={!parsed}
                                  title={
                                    parsed
                                      ? `打开题目 ${code}`
                                      : `无法解析题目编号：${code}`
                                  }
                                  onClick={() => openRecommendedProblem(code)}
                                >
                                  {code}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.searchRow}>
        <input
          className={styles.contestInput}
          placeholder="输入比赛编号，如 2250 或 2250C"
          value={contestQuery}
          onChange={(e) => setContestQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
        />
        <button className={styles.searchBtn} onClick={handleSearch} disabled={loading}>
          搜索
        </button>
      </div>
      {clearMsg && <p className={styles.clearMsg}>{clearMsg}</p>}

      {error && <p className={styles.error}>{error}</p>}

      {loading && all.length === 0 ? (
        <p className={styles.empty}>正在加载该场比赛的题目...</p>
      ) : all.length === 0 ? error ? null : currentContest == null ? (
        <p className={styles.empty}>输入比赛编号（如 2250）或具体题目（如 2250C）即可列出该场比赛的全部题目。</p>
      ) : (
        <p className={styles.empty}>该比赛没有符合条件的题目。</p>
      ) : (
        <>
          <p className={styles.count}>
            共 {all.length} 道题 · 第 {page}/{totalPages} 页
          </p>
          <div className={styles.list}>
            {pageItems.map((p) => (
              <div
                key={`${p.contestId}${p.index}`}
                className={styles.row}
                onClick={() => navigate(`/problems/${p.contestId}/${p.index}`)}
              >
                <span className={styles.rowId}>
                  {p.contestId}
                  {p.index}
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{p.name}</div>
                  {p.tags.length > 0 && (
                    <div className={styles.rowTags}>
                      {p.tags.slice(0, 6).map((t) => (
                        <span key={t} className={styles.tag}>
                          {translateTag(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.rowRight}>
                  {p.rating !== undefined ? (
                    <span className={styles.ratingBadge} style={{ color: getRatingColor(p.rating) }}>
                      {p.rating}
                    </span>
                  ) : (
                    <span className={styles.ratingBadge} style={{ color: 'var(--text-muted)' }}>
                      —
                    </span>
                  )}
                  {p.solvedCount !== undefined && (
                    <span className={styles.solved}>{p.solvedCount.toLocaleString()} 通过</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              上一页
            </button>
            <span className={styles.pageInfo}>
              {page} / {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              下一页
            </button>
          </div>
        </>
      )}

      {showCacheSetup && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>设置题目缓存目录</h3>
            <p className={styles.modalText}>
              题目会缓存在本地以便离线查看。请选择保存位置（首次使用需设置）。
            </p>
            <div className={styles.modalBtns}>
              <button className={styles.modalPrimary} onClick={handlePickCacheDir}>
                选择目录
              </button>
              <button className={styles.modalBtn} onClick={handleDefaultCacheDir}>
                使用默认位置
              </button>
              <button
                className={styles.modalBtn}
                onClick={() => setShowCacheSetup(false)}
              >
                稍后设置
              </button>
            </div>
            {cacheSetupMsg && <p className={styles.modalMsg}>{cacheSetupMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
