import { useNavigate } from 'react-router-dom';
import type { Friend, FriendCache } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/friendList.module.css';

interface Props {
  friend: Friend;
  cache?: FriendCache;
  onToggleStar?: (handle: string, starred: boolean) => void;
}

function formatRelativeTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export default function FriendRow({ friend, cache, onToggleStar }: Props) {
  const navigate = useNavigate();
  const info = cache?.info;
  const online = info ? Date.now() / 1000 - info.lastOnlineTimeSeconds < 300 : false;
  const delta = cache?.ratingHistory?.length
    ? cache.ratingHistory[cache.ratingHistory.length - 1].newRating -
      cache.ratingHistory[cache.ratingHistory.length - 1].oldRating
    : 0;

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(friend.handle, !friend.starred);
  };

  return (
    <div className={`${styles.row} ${friend.starred ? styles.rowStarred : ''}`} onClick={() => navigate(`/friends/${friend.handle}`)}>
      <img
        src={info?.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
        className={styles.avatar}
        alt={friend.handle}
      />
      <div className={styles.details}>
        <span className={styles.handle}>{friend.alias || friend.handle}</span>
        {friend.alias && <span className={styles.alias}>({friend.handle})</span>}
        <span className={styles.rank} style={{ color: getRankColor(info?.rank) }}>
          {getRankLabel(info?.rank)}
        </span>
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