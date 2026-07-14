import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Team, Friend, FriendCache, Settings as SettingsType } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/teams.module.css';

const MAX_MEMBERS = 3;

export default function Teams() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [myHandle, setMyHandle] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    const t = await window.api.store.getTeams();
    setTeams(t);
    const fr = await window.api.store.getFriends();
    setFriends(fr);
    const c = await window.api.store.getAllCache();
    setCaches(c);
    const s: SettingsType = await window.api.store.getSettings();
    setMyHandle(s.myHandle);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 合并:自己 + 好友(去重)
  const allOptions: { handle: string; alias: string; isMe: boolean }[] = [
    ...(myHandle ? [{ handle: myHandle, alias: myHandle, isMe: true }] : []),
    ...friends
      .filter((f) => f.handle !== myHandle)
      .map((f) => ({ handle: f.handle, alias: f.alias || f.handle, isMe: false })),
  ];

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
    };
    await window.api.store.addTeam(team);
    setTeamName('');
    setSelected(new Set());
    setShowCreate(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这个团队吗?')) {
      await window.api.store.removeTeam(id);
      await loadData();
    }
  };

  return (
    <div>
      <h2 className={styles.heading}>团队</h2>

      <button onClick={() => { setShowCreate(!showCreate); setSelected(new Set()); setError(''); }} className={styles.createBtn}>
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
                        src={info?.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
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
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayStartSec = Math.floor(todayStart.getTime() / 1000);

            const memberStats = team.members.map((h) => {
              const cache = caches[h];
              const subs = cache?.recentSubmissions ?? [];
              const acSet = new Set<string>();
              for (const s of subs) {
                if (s.verdict === 'OK' && s.creationTimeSeconds >= todayStartSec) {
                  acSet.add(`${s.problem.contestId ?? ''}-${s.problem.index}`);
                }
              }
              return {
                handle: h,
                avatar: cache?.info?.avatar,
                rank: cache?.info?.rank,
                rating: cache?.info?.rating,
                solvedToday: acSet.size,
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
                          src={info?.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
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
                              src={m.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                              className={styles.dailyAvatar}
                              alt={m.handle}
                            />
                            <div className={styles.dailyInfo}>
                              <span className={styles.dailyHandle}>{m.handle}</span>
                              <span className={styles.dailySolved}>
                                今日 AC <strong style={{ color: '#4ecca3' }}>{m.solvedToday}</strong> 题
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
                              src={m.avatar || 'https://userpic.codeforces.org/no-avatar.jpg'}
                              className={styles.dailyAvatar}
                              alt={m.handle}
                            />
                            <div className={styles.dailyInfo}>
                              <span className={styles.dailyHandle}>{m.handle}</span>
                              <span className={styles.dailySolved}>
                                今日 AC <strong style={{ color: m.solvedToday === 0 ? '#ff6b6b' : '#e0e0e0' }}>{m.solvedToday}</strong> 题
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
                                color: m.solvedToday === 0 ? '#ff6b6b' : m.solvedToday === maxSolved ? '#4ecca3' : '#e0e0e0',
                                fontWeight: 'bold',
                              }}>
                                {m.solvedToday}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
