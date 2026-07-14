import { useEffect, useState, useMemo, useCallback } from 'react';
import type { CFContest } from '../types';
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

  const loadContests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await window.api.cf.getContests();
      // 按开始时间排序,最近的在前
      const sorted = [...data].sort((a, b) => b.startTimeSeconds - a.startTimeSeconds);
      setContests(sorted);
    } catch (e) {
      setError(`加载失败: ${(e as Error).message}`);
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

  const sortedContests = useMemo(
    () => [...contests].sort((a, b) => b.startTimeSeconds - a.startTimeSeconds),
    [contests]
  );

  const handleOpenContest = (id: number) => {
    window.open(`https://codeforces.com/contest/${id}`, '_blank');
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
        <div className={styles.emptyState}>暂无比赛数据,点击右上角刷新拉取。</div>
      ) : (
        <div className={styles.list}>
          {sortedContests.map((c) => {
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
