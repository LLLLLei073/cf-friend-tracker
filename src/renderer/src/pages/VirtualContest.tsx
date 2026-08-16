import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ProblemListItem, CFContest, CFSubmission } from '../types';
import { getRatingColor } from '../utils/rank';
import styles from '../styles/virtualContest.module.css';

// 已 AC 的题目 index 集合
type AcMap = Record<string, number>; // index -> first AC time (ms since contest start)

interface ProblemState {
  problem: ProblemListItem;
  ac: boolean;
  acAt?: number; // 距比赛开始的毫秒数
}

export default function VirtualContest() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contestIdInput, setContestIdInput] = useState(searchParams.get('contestId') ?? '');
  const [contestId, setContestId] = useState<number | null>(null);
  const [contest, setContest] = useState<CFContest | null>(null);
  const [problems, setProblems] = useState<ProblemState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [myHandle, setMyHandle] = useState('');

  // 计时: 比赛开始时间(本地, 毫秒) 与 是否进行中
  const [startTime, setStartTime] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载 myHandle
  useEffect(() => {
    (async () => {
      const s = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
    })();
  }, []);

  // 启动比赛: 拉取题目 + 比赛信息
  const startContest = useCallback(async (cid: number) => {
    setLoading(true);
    setError('');
    try {
      const [probs, info] = await Promise.all([
        window.api.problem.startVirtual(cid),
        window.api.cf.getContestInfo(cid),
      ]);
      if (!info) {
        setError('无法获取比赛信息，请确认比赛编号是否正确。');
        return;
      }
      setContest(info);
      setProblems(probs.map((p) => ({ problem: p, ac: false })));
      setContestId(cid);
      const start = Date.now();
      setStartTime(start);
      setRunning(true);
      setFinished(false);
      setSearchParams({ contestId: String(cid) }, { replace: true });
    } catch (e) {
      setError(`开始失败: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  // 轮询 user.status 检测本窗口内的新 AC
  const pollAc = useCallback(async () => {
    if (!myHandle || !contestId || !startTime) return;
    try {
      const subs = await window.api.cf.getSubmissions(myHandle, 200);
      // 只看比赛开始后的提交, 且属于本比赛
      const startSec = Math.floor(startTime / 1000);
      const acSet = new Map<string, number>();
      for (const s of subs) {
        if (s.verdict !== 'OK') continue;
        if (s.problem.contestId !== contestId) continue;
        if (s.creationTimeSeconds < startSec) continue;
        const key = s.problem.index;
        if (!acSet.has(key)) {
          acSet.set(key, (s.creationTimeSeconds - startSec) * 1000);
        }
      }
      setProblems((prev) =>
        prev.map((p) => {
          const acAt = acSet.get(p.problem.index);
          if (acAt !== undefined && !p.ac) return { ...p, ac: true, acAt };
          return p;
        }),
      );
    } catch {
      // 轮询失败静默, 下次再试
    }
  }, [myHandle, contestId, startTime]);

  // 计时 tick + 轮询
  useEffect(() => {
    if (!running || !startTime) return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    pollRef.current = setInterval(pollAc, 60000);
    // 立即先轮询一次
    pollAc();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running, startTime, pollAc]);

  // 判断比赛结束
  const durationMs = (contest?.durationSeconds ?? 0) * 1000;
  const elapsed = startTime ? now - startTime : 0;
  const remaining = Math.max(0, durationMs - elapsed);

  useEffect(() => {
    if (running && durationMs > 0 && elapsed >= durationMs) {
      setRunning(false);
      setFinished(true);
    }
  }, [now, running, durationMs, elapsed]);

  const handleStart = () => {
    const cid = parseInt(contestIdInput.trim(), 10);
    if (!cid || isNaN(cid)) {
      setError('请输入正确的比赛编号，如 2250');
      return;
    }
    if (!myHandle) {
      setError('请先在设置中填写你的 CF Handle，虚拟比赛需要检测你的提交。');
      return;
    }
    startContest(cid);
  };

  const handleEnd = () => {
    setRunning(false);
    setFinished(true);
  };

  const handleReset = () => {
    if (!confirm('确定结束本次虚拟比赛吗？')) return;
    handleEnd();
  };

  // 格式化时间 mm:ss
  const fmt = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const acCount = problems.filter((p) => p.ac).length;
  // 简单罚时: 每 AC 一题记其 acAt + 20分钟*未AC前尝试(此处仅用 AC 时间近似, 无WA计数)
  const totalPenalty = problems
    .filter((p) => p.ac)
    .reduce((sum, p) => sum + (p.acAt ?? 0), 0);

  // ---- 未开始: 输入界面 ----
  if (!contestId) {
    return (
      <div className={styles.container}>
        <h2 className={styles.heading}>虚拟比赛 (Virtual Contest)</h2>
        <p className={styles.subtitle}>
          选择一场 Codeforces 比赛，应用会模拟比赛计时。你在系统浏览器里写代码并提交到 CF，
          应用每分钟轮询你的提交记录，自动检测 AC 并刷新实时记分板。题面需用浏览器打开（CF 反爬限制）。
        </p>
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            placeholder="输入比赛编号，如 2250"
            value={contestIdInput}
            onChange={(e) => setContestIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStart();
            }}
          />
          <button className={styles.startBtn} onClick={handleStart} disabled={loading}>
            {loading ? '加载中...' : '开始虚拟比赛'}
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {!myHandle && (
          <p className={styles.hint}>⚠️ 未检测到你的 Handle，请先到「设置」填写后再开始。</p>
        )}
      </div>
    );
  }

  // ---- 进行中 / 已结束 ----
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>{contest?.name ?? `比赛 ${contestId}`}</h2>
        {running ? (
          <div className={styles.timer}>
            <span className={styles.timerLabel}>剩余</span>
            <span className={styles.timerValue}>{fmt(remaining)}</span>
            <button className={styles.endBtn} onClick={handleReset}>结束</button>
          </div>
        ) : (
          <span className={styles.finishedTag}>{finished ? '已结束' : ''}</span>
        )}
      </div>

      <div className={styles.scoreRow}>
        <div className={styles.scoreCard}>
          <div className={styles.scoreValue}>{acCount}</div>
          <div className={styles.scoreLabel}>AC</div>
        </div>
        <div className={styles.scoreCard}>
          <div className={styles.scoreValue}>{problems.length}</div>
          <div className={styles.scoreLabel}>总题数</div>
        </div>
        <div className={styles.scoreCard}>
          <div className={styles.scoreValue}>{fmt(totalPenalty)}</div>
          <div className={styles.scoreLabel}>累计用时</div>
        </div>
      </div>

      <div className={styles.problemList}>
        {problems.map((p) => (
          <div key={p.problem.index} className={`${styles.problemItem} ${p.ac ? styles.problemAc : ''}`}>
            <span className={styles.problemIndex}>{p.problem.index}</span>
            <span className={styles.problemName}>{p.problem.name}</span>
            {p.problem.rating !== undefined && (
              <span className={styles.problemRating} style={{ color: getRatingColor(p.problem.rating) }}>
                {p.problem.rating}
              </span>
            )}
            <span className={styles.problemStatus}>{p.ac ? `✓ ${p.acAt !== undefined ? fmt(p.acAt) : ''}` : '—'}</span>
            <button
              className={styles.openBtn}
              onClick={() => window.api.problem.openInBrowser(contestId, p.problem.index)}
            >
              打开原题
            </button>
          </div>
        ))}
      </div>

      {finished && (
        <div className={styles.summary}>
          <h3 className={styles.summaryTitle}>比赛小结</h3>
          <p>AC {acCount}/{problems.length} 题</p>
          <p>累计用时: {fmt(totalPenalty)}</p>
          <button className={styles.startBtn} onClick={() => { setContestId(null); setProblems([]); setContest(null); }}>
            再来一场
          </button>
        </div>
      )}
    </div>
  );
}
