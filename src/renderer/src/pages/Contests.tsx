import { useEffect, useState, useCallback } from 'react';
import type { CFContest, ContestPrediction } from '../types';
import { getRatingColor } from '../utils/rank';
import styles from '../styles/contests.module.css';

type StatusVariant = 'before' | 'coding' | 'system' | 'finished' | 'default';

interface ContestStatus {
  text: string;
  variant: StatusVariant;
}

// 把秒数格式化为友好的持续时间(如 "2小时30分钟")
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  if (hours > 0) {
    return `${hours}小时`;
  }
  if (minutes > 0) {
    return `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

// 赛前倒计时:不足1天显示小时,不足1小时显示分钟,临近时显示秒
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '即将开始';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}天后 ${hours}小时后开始`;
  }
  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟后开始`;
  }
  if (minutes > 0) {
    return `${minutes}分 ${secs}秒后开始`;
  }
  return `${secs}秒后开始`;
}

// 比赛中剩余时间
function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '即将结束';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `剩余 ${hours}小时 ${minutes}分钟`;
  }
  if (minutes > 0) {
    return `剩余 ${minutes}分钟 ${secs}秒`;
  }
  return `剩余 ${secs}秒`;
}

// 格式化开始时间为本地时间
function formatStartTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 从比赛名称中提取类型(Div.2 / Div.1 / Educational 等)
function getContestType(name: string): string {
  const divMatch = name.match(/Div\.\s*\d+(\s*\+\s*Div\.\s*\d+)?/i);
  if (divMatch) {
    return divMatch[0].replace(/\s+/g, ' ').trim();
  }
  if (/Educational/i.test(name)) return 'Educational';
  if (/Global\s*Round/i.test(name)) return 'Global';
  if (/Kotlin/i.test(name)) return 'Kotlin';
  if (/April\s*Fools/i.test(name)) return 'April Fools';
  if (/Codeforces\s*Round/i.test(name)) return 'CF Round';
  return '其他';
}

export default function Contests() {
  const [contests, setContests] = useState<CFContest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 每1秒更新一次,用于驱动倒计时
  const [now, setNow] = useState(() => Date.now());
  // 预测状态: contestId -> { data, loading, error }
  const [predictions, setPredictions] = useState<Record<number, { data: ContestPrediction | null; loading: boolean; error: string }>>({});

  const loadContests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await window.api.cf.getContests();
      // 按开始时间排序,最近的在前
      const sorted = [...data].sort((a, b) => b.startTimeSeconds - a.startTimeSeconds);
      setContests(sorted);
    } catch (e) {
      // 去掉 Electron IPC 自动添加的 "Error invoking remote method '...': " 前缀
      let msg = (e as Error).message || String(e);
      msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
      setError(`加载失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContests();
  }, [loadContests]);

  // 倒计时实时更新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenContest = (id: number) => {
    window.api.app.openExternal(`https://codeforces.com/contest/${id}`);
  };

  const handlePredict = async (contest: CFContest) => {
    setPredictions((prev) => ({
      ...prev,
      [contest.id]: { data: null, loading: true, error: '' },
    }));
    try {
      const result = await window.api.predict.contest(contest.id, contest.name);
      setPredictions((prev) => ({
        ...prev,
        [contest.id]: { data: result, loading: false, error: '' },
      }));
    } catch (e) {
      setPredictions((prev) => ({
        ...prev,
        [contest.id]: { data: null, loading: false, error: (e as Error).message },
      }));
    }
  };

  // 根据比赛阶段计算状态文案与样式变体
  const getStatus = (contest: CFContest): ContestStatus => {
    const nowSec = Math.floor(now / 1000);
    switch (contest.phase) {
      case 'BEFORE': {
        const remain = contest.startTimeSeconds - nowSec;
        return { text: formatCountdown(remain), variant: 'before' };
      }
      case 'CODING': {
        const end = contest.startTimeSeconds + contest.durationSeconds;
        const remain = end - nowSec;
        return { text: formatRemaining(remain), variant: 'coding' };
      }
      case 'PENDING_SYSTEM_TEST':
      case 'SYSTEM_TEST':
        return { text: '系统测试中', variant: 'system' };
      case 'FINISHED':
        return { text: '已结束', variant: 'finished' };
      default:
        return { text: '未知', variant: 'default' };
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>近期比赛</h2>
        <button
          className={styles.refreshBtn}
          onClick={async () => {
            if (contests.length === 0) return;
            const res = await window.api.contest.exportIcs(contests);
            if (res.ok) alert(`已导出 ${res.path}`);
            else if (res.error && !res.canceled) alert(`导出失败: ${res.error}`);
          }}
          disabled={loading || contests.length === 0}
          title="把当前比赛列表导出为 .ics 日历文件"
        >
          导出日历(.ics)
        </button>
        <button
          className={styles.refreshBtn}
          onClick={loadContests}
          disabled={loading}
        >
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading && contests.length === 0 ? (
        <div className={styles.emptyState}>加载中...</div>
      ) : contests.length === 0 ? (
        // 有错误时不显示"暂无比赛",避免与错误提示重复造成误导
        error ? null : <div className={styles.emptyState}>暂无比赛数据,点击右上角刷新拉取。</div>
      ) : (
        <div className={styles.list}>
          {contests.map((c) => {
            const status = getStatus(c);
            const cardClass = [
              styles.card,
              status.variant === 'before' ? styles.cardBefore : '',
              status.variant === 'coding' ? styles.cardCoding : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={c.id} className={cardClass}>
                <div className={styles.cardHeader}>
                  <span
                    className={styles.name}
                    onClick={() => handleOpenContest(c.id)}
                    title={c.name}
                  >
                    {c.name}
                  </span>
                  <span className={styles.typeTag}>{getContestType(c.name)}</span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>开始时间</span>
                    <span className={styles.infoValue}>
                      {formatStartTime(c.startTimeSeconds)}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>持续时间</span>
                    <span className={styles.infoValue}>
                      {formatDuration(c.durationSeconds)}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>状态</span>
                    <span className={`${styles.infoValue} ${styles[status.variant]}`}>
                      {status.text}
                    </span>
                  </div>
                </div>

                {/* 比赛进行中: 显示评级预测按钮和结果 */}
                {status.variant === 'coding' && (
                  <div className={styles.predictionSection}>
                    {predictions[c.id]?.data ? null : (
                      <button
                        className={styles.predictBtn}
                        onClick={() => handlePredict(c)}
                        disabled={predictions[c.id]?.loading}
                      >
                        {predictions[c.id]?.loading
                          ? '预测中... (需获取排名+Rating,请耐心等待)'
                          : '预测好友 Rating'}
                      </button>
                    )}
                    {predictions[c.id]?.error && (
                      <p className={styles.predictError}>
                        预测失败: {predictions[c.id]!.error}
                      </p>
                    )}
                    {predictions[c.id]?.data && (
                      <div className={styles.predictionResults}>
                        <div className={styles.predictionHeader}>
                          <span>
                            好友评级预测
                            {predictions[c.id]!.data!.predictions.length === 0 && ' (无好友参赛)'}
                          </span>
                          <button
                            className={styles.predictRefreshBtn}
                            onClick={() => handlePredict(c)}
                            disabled={predictions[c.id]?.loading}
                          >
                            刷新
                          </button>
                        </div>
                        {predictions[c.id]!.data!.predictions.length > 0 && (
                          <table className={styles.predictionTable}>
                            <thead>
                              <tr>
                                <th>Handle</th>
                                <th>排名</th>
                                <th>当前</th>
                                <th>预测</th>
                                <th>变化</th>
                                <th>表现分</th>
                              </tr>
                            </thead>
                            <tbody>
                              {predictions[c.id]!.data!.predictions.map((p) => (
                                <tr key={p.handle}>
                                  <td style={{ color: getRatingColor(p.oldRating), fontWeight: 700 }}>
                                    {p.handle}
                                  </td>
                                  <td>#{p.rank}</td>
                                  <td style={{ color: getRatingColor(p.oldRating) }}>
                                    {p.oldRating}
                                  </td>
                                  <td style={{ color: getRatingColor(p.predictedRating), fontWeight: 700 }}>
                                    {p.predictedRating}
                                  </td>
                                  <td
                                    style={{
                                      color: p.predictedDelta > 0 ? '#4A7C3A' : p.predictedDelta < 0 ? '#C41E3A' : '#8C857B',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {p.predictedDelta > 0 ? '+' : ''}{p.predictedDelta}
                                  </td>
                                  <td style={{ color: getRatingColor(p.performanceRating) }}>
                                    {p.performanceRating}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className={styles.predictionNote}>
                          共 {predictions[c.id]!.data!.totalParticipants} 人参赛
                          · 预测基于当前排名,仅供参考
                        </p>
                      </div>
                    )}
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