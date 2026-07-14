import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Team, FriendCache } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import styles from '../styles/teams.module.css';

export default function Teams() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [memberInputs, setMemberInputs] = useState<string[]>(['', '', '']);
  const [error, setError] = useState('');

  const loadData = async () => {
    const t = await window.api.store.getTeams();
    setTeams(t);
    const c = await window.api.store.getAllCache();
    setCaches(c);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    setError('');
    const members = memberInputs.map((m) => m.trim()).filter((m) => m.length > 0);
    if (!teamName.trim()) {
      setError('请填写团队名称');
      return;
    }
    if (members.length === 0) {
      setError('至少添加一名成员');
      return;
    }
    if (members.length > 3) {
      setError('最多 3 名成员');
      return;
    }
    // 验证 handle 是否存在
    try {
      const infos = await window.api.cf.getUserInfo(members);
      const validHandles = infos.map((i) => i.handle);
      const team: Team = {
        id: `team_${Date.now()}`,
        name: teamName.trim(),
        members: validHandles,
        createdAt: Date.now(),
      };
      await window.api.store.addTeam(team);
      setTeamName('');
      setMemberInputs(['', '', '']);
      setShowCreate(false);
      await loadData();
    } catch (e) {
      setError(`验证失败: ${(e as Error).message}`);
    }
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

      <button onClick={() => setShowCreate(!showCreate)} className={styles.createBtn}>
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
            <label>成员 CF Handle(最多 3 人)</label>
            {memberInputs.map((m, i) => (
              <input
                key={i}
                type="text"
                value={m}
                onChange={(e) => {
                  const next = [...memberInputs];
                  next[i] = e.target.value;
                  setMemberInputs(next);
                }}
                placeholder={`成员 ${i + 1} 的 handle`}
                className={styles.input}
              />
            ))}
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
            const totalRating = team.members.reduce(
              (sum, h) => sum + (caches[h]?.info?.rating ?? 0),
              0
            );
            return (
              <div key={team.id} className={styles.teamCard}>
                <div className={styles.teamHeader}>
                  <h3 className={styles.teamName}>{team.name}</h3>
                  <button onClick={() => handleDelete(team.id)} className={styles.deleteBtn}>删除</button>
                </div>
                <div className={styles.teamStats}>
                  <span className={styles.totalRating}>总 Rating: {totalRating}</span>
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
                        onClick={() => navigate(`/friends/${h}`)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
