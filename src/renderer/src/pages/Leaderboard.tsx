import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FriendCache, LuoguCache } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import { NO_AVATAR, countACProblems, getMedalClass } from '../utils/helpers';
import { useAppData } from '../hooks/useAppData';
import { exportCSV } from '../utils/export';
import styles from '../styles/leaderboard.module.css';

type Tab = 'solved' | 'rating' | 'luogu';

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

interface LuoguEntry {
  handle: string;
  alias: string;
  isMe: boolean;
  uid: number;
  name: string;
  avatar?: string;
  passed: number;
  submitted: number;
  color?: string;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('solved');
  const { friends, caches, luoguCaches, myHandle, myLuogu } = useAppData();

  // 合并:自己 + 好友(去重)
  const allPeople = useMemo(() => {
    const me = myHandle ? [{ handle: myHandle, alias: myHandle, isMe: true }] : [];
    const fr = friends
      .filter((f) => f.handle !== myHandle)
      .map((f) => ({ handle: f.handle, alias: f.alias || f.handle, isMe: false }));
    return [...me, ...fr];
  }, [friends, myHandle]);

  // 洛谷榜单: 取有洛谷账号的好友 + 「我的洛谷」(若已绑定), 按通过题数(passed)降序
  // 之前漏了 myLuogu —— 用户绑定后排行榜看不到自己的数据, 体验差。
  // myLuogu 标记 isMe=true, 用 myHandle 充当列表 handle (与 CF 端共用「我」识别)
  const luoguRanking = useMemo<LuoguEntry[]>(() => {
    const fromFriends: LuoguEntry[] = friends
      .filter((f) => f.luogu && luoguCaches[f.luogu.uid])
      .map((f) => {
        const lg = luoguCaches[f.luogu!.uid].info;
        return {
          handle: f.handle,
          alias: f.alias || f.handle,
          isMe: f.handle === myHandle,
          uid: f.luogu!.uid,
          name: f.luogu!.name,
          avatar: lg.avatar,
          passed: lg.passed,
          submitted: lg.submitted,
          color: lg.color,
        };
      });
    // 「我的洛谷」: 即使我不在 friends 里 (跨平台孤立绑定), 也作为一条记录入榜
    let fromMe: LuoguEntry[] = [];
    if (myLuogu && luoguCaches[myLuogu.uid] && !fromFriends.some((e) => e.isMe)) {
      const lg = luoguCaches[myLuogu.uid].info;
      fromMe = [
        {
          handle: myHandle || `__me_luogu_${myLuogu.uid}`,
          alias: myLuogu.name,
          isMe: true,
          uid: myLuogu.uid,
          name: myLuogu.name,
          avatar: lg.avatar,
          passed: lg.passed,
          submitted: lg.submitted,
          color: lg.color,
        },
      ];
    }
    return [...fromFriends, ...fromMe].sort((a, b) => b.passed - a.passed);
  }, [friends, luoguCaches, myHandle, myLuogu]);

  // 近两天做题排行:统计最近2天内 AC 的不重复题目数
  const solvedRanking = useMemo<SolvedEntry[]>(() => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 3600;
    return allPeople
      .map((p) => {
        const cache = caches[p.handle];
        const subs = cache?.recentSubmissions ?? [];
        return {
          handle: p.handle,
          alias: p.alias,
          isMe: p.isMe,
          avatar: cache?.info?.avatar,
          rank: cache?.info?.rank,
          rating: cache?.info?.rating,
          solvedCount: countACProblems(subs, twoDaysAgo),
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

  const tableRef = useRef<HTMLDivElement>(null);

  const handleExportCSV = () => {
    if (tab === 'solved') {
      exportCSV(
        ['排名', 'Handle', '别名', 'Rating', '近两天 AC'],
        solvedRanking.map((e, i) => [i + 1, e.handle, e.alias, e.rating ?? '', e.solvedCount]),
        '排行榜-近两天做题',
      );
    } else if (tab === 'luogu') {
      exportCSV(
        ['排名', 'Handle', '别名', '洛谷名', '通过题数', '提交题数'],
        luoguRanking.map((e, i) => [i + 1, e.handle, e.alias, e.name, e.passed, e.submitted]),
        '排行榜-洛谷',
      );
    } else {
      exportCSV(
        ['排名', 'Handle', '别名', 'Rating', '最高 Rating'],
        ratingRanking.map((e, i) => [i + 1, e.handle, e.alias, e.rating ?? '', e.maxRating ?? '']),
        '排行榜-Rating',
      );
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>排行榜</h2>
        <button className={styles.exportBtn} onClick={handleExportCSV}>
          导出 CSV
        </button>
      </div>
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
        <button
          className={tab === 'luogu' ? styles.activeTab : styles.tab}
          onClick={() => setTab('luogu')}
        >
          洛谷
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
                      <span className={getMedalClass(i, { gold: styles.medal, silver: styles.medal, bronze: styles.medal, normal: styles.rankNum })}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || NO_AVATAR}
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
                      <span className={getMedalClass(i, { gold: styles.medal, silver: styles.medal, bronze: styles.medal, normal: styles.rankNum })}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || NO_AVATAR}
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

      {tab === 'luogu' && (
        <div>
          {luoguRanking.length === 0 ? (
            <p className={styles.empty}>暂无洛谷数据。在「添加好友」里添加洛谷账号,或刷新后查看。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>#</th>
                  <th>好友</th>
                  <th>洛谷名</th>
                  <th className={styles.numCol}>通过</th>
                  <th className={styles.numCol}>提交</th>
                </tr>
              </thead>
              <tbody>
                {luoguRanking.map((e, i) => (
                  <tr key={e.handle} className={styles.row} onClick={() => navigate(`/friends/${e.handle}`)}>
                    <td className={styles.rankCol}>
                      <span className={getMedalClass(i, { gold: styles.medal, silver: styles.medal, bronze: styles.medal, normal: styles.rankNum })}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <img
                          src={e.avatar || NO_AVATAR}
                          className={styles.avatar}
                          alt={e.alias}
                        />
                        <span>{e.alias}</span>
                        {e.isMe && <span className={styles.meTag}>我</span>}
                      </div>
                    </td>
                    <td>
                      <span
                        className={styles.luoguName}
                        style={{ color: e.color ? e.color : undefined }}
                      >
                        {e.name}
                      </span>
                    </td>
                    <td className={styles.numCol}>
                      <span className={styles.solvedCount}>{e.passed}</span>
                    </td>
                    <td className={styles.numCol}>
                      <span className={styles.maxRating}>{e.submitted}</span>
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
