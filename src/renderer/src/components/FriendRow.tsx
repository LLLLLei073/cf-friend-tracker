import { useNavigate } from 'react-router-dom';
import type { Friend, FriendCache, LuoguCache, NowcoderCache } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/friendList.module.css';

interface Props {
  friend: Friend;
  cache?: FriendCache;
  luoguCache?: LuoguCache;
  nowcoderCache?: NowcoderCache;
  onToggleStar?: (handle: string, starred: boolean) => void;
}

function formatRelativeTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export default function FriendRow({ friend, cache, luoguCache, nowcoderCache, onToggleStar }: Props) {
  const navigate = useNavigate();
  const info = cache?.info;
  const online = info ? Date.now() / 1000 - info.lastOnlineTimeSeconds < 300 : false;
  const delta = cache?.ratingHistory?.length
    ? cache.ratingHistory[cache.ratingHistory.length - 1].newRating -
      cache.ratingHistory[cache.ratingHistory.length - 1].oldRating
    : 0;

  // 洛谷徽章: 通过 friend.luogu?.uid 取缓存, 显示通过数 + 等级颜色点
  const luogu = friend.luogu ? luoguCache : undefined;
  const luoguInfo = luogu?.info;

  // 牛客徽章: 通过 friend.nowcoder?.uid 取缓存, 显示 rating; 抓取失败灰化显示 N/A
  const nc = friend.nowcoder ? nowcoderCache : undefined;
  const ncInfo = nc?.info;
  const ncUnavailable = !!nc?.unavailable;

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(friend.handle, !friend.starred);
  };

  return (
    <div className={`${styles.row} ${friend.starred ? styles.rowStarred : ''}`} onClick={() => navigate(`/friends/${friend.handle}`)}>
      <img
        src={info?.avatar || luoguInfo?.avatar || ncInfo?.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
        className={styles.avatar}
        alt={friend.handle}
      />
      <div className={styles.details}>
        <span className={styles.handle}>{friend.alias || friend.handle}</span>
        {friend.alias && <span className={styles.alias}>({friend.handle})</span>}
        <span className={styles.rank} style={{ color: getRankColor(info?.rank) }}>
          {getRankLabel(info?.rank)}
        </span>
        {luoguInfo && (
          <span
            className={styles.luoguBadge}
            style={{ background: luoguInfo.color ? luoguInfo.color : '#888' }}
            title={`洛谷: 通过 ${luoguInfo.passed} 题 · 提交 ${luoguInfo.submitted} 题`}
          >
            洛谷 {luoguInfo.passed}
          </span>
        )}
        {ncInfo && (
          <span
            className={`${styles.nowcoderBadge} ${ncUnavailable ? styles.nowcoderBadgeNA : ''}`}
            title={
              ncUnavailable
                ? '牛客: 数据抓取失败 (cookie 失效或接口变更)'
                : `牛客: rating ${ncInfo.rating ?? 'N/A'}${ncInfo.accepted !== undefined ? ` · 通过 ${ncInfo.accepted} 题` : ''}`
            }
          >
            牛客 {ncUnavailable ? 'N/A' : (ncInfo.rating ?? '—')}
          </span>
        )}
      </div>
      <div className={styles.stats}>
        {info?.rating !== undefined && (
          <span className={styles.rating} style={{ color: getRankColor(info?.rank) }}>
            {info.rating}
          </span>
        )}
        {delta !== 0 && (
          <span className={delta > 0 ? styles.up : styles.down}>
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}
          </span>
        )}
        <button
          className={styles.starBtn}
          onClick={handleToggleStar}
          title={friend.starred ? '取消特别关注' : '设为特别关注'}
        >
          {friend.starred ? '★' : '☆'}
        </button>
        <span className={`${styles.statusDot} ${online ? styles.online : ''}`}
          title={info ? `最近在线: ${formatRelativeTime(info.lastOnlineTimeSeconds)}` : ''}
        />
      </div>
    </div>
  );
}