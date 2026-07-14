import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Friend, FriendCache, Settings as SettingsType } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/leaderboard.module.css';

type Tab = 'solved' | 'rating';

interface SolvedEntry {
  handle: string;
  alias: string;
  isMe: boolean;
  avatar?: string;
  rank?: string;
  rating?: number;
  solvedCount: number;
}

interface RatingEntry {
  handle: string;
  alias: string;
  isMe: boolean;
  avatar?: string;
  rank?: string;
  rating?: number;
  maxRating?: number;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('solved');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [myHandle, setMyHandle] = useState('');

  useEffect(() => {
    (async () => {
      const fr = await window.api.store.getFriends();
      setFriends(fr);
      const c = await window.api.store.getAllCache();
      setCaches(c);
      const s: SettingsType = await window.api.store.getSettings();
      setMyHandle(s.myHandle);
    })();
  }, []);

  // 合并:自己 + 好友(去重)
  const allPeople = useMemo(() => {
    const me = myHandle ? [{ handle: myHandle, alias: myHandle, isMe: true }] : [];
    const fr = friends
      .filter((f) => f.handle !== myHandle)
      .map((f) => ({ handle: f.handle, alias: f.alias || f.handle, isMe: false }));
    return [...me, ...fr];
  }, [friends, myHandle]);

  // 近两天做题排行:统计最近2天内 AC 的不重复题目数
  const solvedRanking = useMemo<SolvedEntry[]>(() => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 3600;
    return allPeople
      .map((p) => {
        const cache = caches[p.handle];
        const subs = cache?.recentSubmissions ?? [];
        const acProblems = new Set<string>();
        for (const s of subs) {
          if (s.verdict === 'OK' && s.creationTimeSeconds >= twoDaysAgo) {
            const key = `${s.problem.contestId ?? ''}-${s.problem.index}`;
            acProblems.add(key);
          }
        }
        return {
          handle: p.handle,
          alias: p.alias,
          isMe: p.isMe,
          avatar: cache?.info?.avatar,
          rank: cache?.info?.rank,
          rating: cache?.info?.rating,
          solvedCount: acProblems.size,
        };
      })
      .filter((e) => e.solvedCount > 0)
      .sort((a, b) => b.solvedCount - a.solvedCount);
  }, [allPeople, caches]);

  // Rating 排行:按当前 rating 降序
  const ratingRanking = useMemo<RatingEntry[]>(() => {
    return allPeople
      .map((p) => {
        const cache = caches[p.handle];
        return {
          handle: p.handle,
          alias: p.alias,
          isMe: p.isMe,
          avatar: cache?.info?.avatar,
          rank: cache?.info?.rank,
          rating: cache?.info?.rating,
          maxRating: cache?.info?.maxRating,
        };
      })
      .filter((e) => e.rating !== undefined)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [allPeople, caches]);

  return (
    <div>
      <h2 className={styles.heading}>排行榜</h2>
      <div className={styles.tabs}>
        <button
          className={tab === 'solved' ? styles.activeTab : styles.tab}
          onClick={() => setTab('solved')}
        >
          近两天做题
        </button>
        <button
          className={tab === 'rating' ? styles.activeTab : styles.tab}
          onClick={() => setTab('rating')}
        >
          Rating 排行
        </button>
      </div>

      {tab === 'solved' && (
        <div>
          {solvedRanking.length === 0 ? (
            <p className={styles.empty}>近两天暂无好友有 AC 记录,点击左下角刷新拉取数据。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>#</th>
                  <th>好友</th>
                  <th>段位</th>
                  <th className={styles.numCol}>AC 题数</th>
                </tr>
              </thead>
              <tbody>
                {solvedRanking.map((e, i) => (
                  <tr key={e.handle} className={styles.row} onClick={() => navigate(`/friends/${e.handle}`)}>
                    <td className={styles.rankCol}>
                      <span className={i < 3 ? styles.medal : styles.rankNum}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                          className={styles.avatar}
                          alt={e.handle}
                        />
                        <span>{e.alias}</span>
                        {e.isMe && <span className={styles.meTag}>我</span>}
                      </div>
                    </td>
                    <td style={{ color: getRankColor(e.rank) }}>
                      {getRankLabel(e.rank)}
                    </td>
                    <td className={styles.numCol}>
                      <span className={styles.solvedCount}>{e.solvedCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'rating' && (
        <div>
          {ratingRanking.length === 0 ? (
            <p className={styles.empty}>暂无 Rating 数据,点击左下角刷新拉取数据。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>#</th>
                  <th>好友</th>
                  <th>段位</th>
                  <th className={styles.numCol}>Rating</th>
                  <th className={styles.numCol}>最高</th>
                </tr>
              </thead>
              <tbody>
                {ratingRanking.map((e, i) => (
                  <tr key={e.handle} className={styles.row} onClick={() => navigate(`/friends/${e.handle}`)}>
                    <td className={styles.rankCol}>
                      <span className={i < 3 ? styles.medal : styles.rankNum}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                          className={styles.avatar}
                          alt={e.handle}
                        />
                        <span>{e.alias}</span>
                        {e.isMe && <span className={styles.meTag}>我</span>}
                      </div>
                    </td>
                    <td style={{ color: getRankColor(e.rank) }}>
                      {getRankLabel(e.rank)}
                    </td>
                    <td className={styles.numCol}>
                      <span style={{ color: getRankColor(e.rank), fontWeight: 'bold' }}>
                        {e.rating}
                      </span>
                    </td>
                    <td className={styles.numCol}>
                      <span className={styles.maxRating}>{e.maxRating}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
