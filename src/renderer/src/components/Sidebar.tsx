import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Friend, FriendCache, CFUser } from '../types';
import { getRankColor, getRankLabel } from '../utils/rank';
import { NO_AVATAR } from '../utils/helpers';
import styles from '../styles/sidebar.module.css';

// 排序方式
type SortOption = 'default' | 'rating-desc' | 'recent';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [caches, setCaches] = useState<Record<string, FriendCache>>({});
  const [viewedRatings, setViewedRatings] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [refreshingHandles, setRefreshingHandles] = useState<Set<string>>(new Set());
  const [myHandle, setMyHandle] = useState('');
  const [myInfo, setMyInfo] = useState<CFUser | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  // 用于定时刷新"距上次刷新"的显示
  const [now, setNow] = useState(Date.now());
  // 导航区收起状态
  const [navCollapsed, setNavCollapsed] = useState(false);

  // 搜索 & 排序
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    handle: string;
    alias: string;
    x: number;
    y: number;
  } | null>(null);

  // 备注编辑
  const [editingFriend, setEditingFriend] = useState<{ handle: string; alias: string } | null>(null);
  const [editAlias, setEditAlias] = useState('');

  // 防止开机自动刷新重复触发
  const autoRefreshChecked = useRef(false);

  const loadData = async () => {
    const fr = await window.api.store.getFriends();
    setFriends(fr);
    const cacheMap = await window.api.store.getAllCache();
    setCaches(cacheMap);
    // 加载已查看的 rating 记录,用于 rating 变动标记
    const viewed = await window.api.store.getViewedRatings();
    setViewedRatings(viewed);
    const settings = await window.api.store.getSettings();
    setMyHandle(settings.myHandle);
    setLastRefreshAt(settings.lastRefreshAt || 0);
    if (settings.myHandle && cacheMap[settings.myHandle]) {
      setMyInfo(cacheMap[settings.myHandle].info);
    } else {
      setMyInfo(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [location.pathname]);

  // 启动时拉取自己的信息
  useEffect(() => {
    (async () => {
      const settings = await window.api.store.getSettings();
      if (settings.myHandle) {
        const result = await window.api.cf.refreshMyProfile();
        if (result) {
          setMyInfo(result);
          await loadData();
        }
      }
    })();
  }, []);

  // 监听刷新进度事件
  useEffect(() => {
    const unsubscribe = window.api.cf.onRefreshProgress((p) => {
      setProgress({ completed: p.completed, total: p.total });

      // 该好友完成,立即更新缓存
      if (p.handle) {
        setRefreshingHandles((prev) => {
          const next = new Set(prev);
          next.delete(p.handle!);
          return next;
        });
        window.api.store.getCache(p.handle).then((cache) => {
          if (cache) {
            setCaches((prev) => ({ ...prev, [p.handle!]: cache }));
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  // 定时器: 每30秒更新一次"距上次刷新"显示
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // 开机自动刷新: 距上次刷新超过30分钟则自动触发
  useEffect(() => {
    if (autoRefreshChecked.current) return;
    autoRefreshChecked.current = true;
    (async () => {
      const settings = await window.api.store.getSettings();
      const last = settings.lastRefreshAt || 0;
      // 从未刷新过或距上次刷新超过30分钟,自动触发
      if (!last || Date.now() - last > 30 * 60 * 1000) {
        // 先加载好友列表,确保刷新进度显示正确
        const fr = await window.api.store.getFriends();
        if (fr.length > 0) {
          handleRefresh(fr);
        }
      }
    })();
  }, []);

  const handleRefresh = async (friendList?: Friend[]) => {
    // 支持传入好友列表(开机自动刷新时 state 可能还未更新)
    const fr = friendList ?? friends;
    setRefreshing(true);
    setProgress({ completed: 0, total: fr.length });
    // 标记所有好友为刷新中
    setRefreshingHandles(new Set(fr.map((f) => f.handle)));
    try {
      await window.api.cf.refreshAll();
      // 同时刷新自己的信息
      const settings = await window.api.store.getSettings();
      if (settings.myHandle) {
        const myResult = await window.api.cf.refreshMyProfile();
        if (myResult) setMyInfo(myResult);
      }
      await loadData();
      // 更新刷新时间显示
      const newSettings = await window.api.store.getSettings();
      setLastRefreshAt(newSettings.lastRefreshAt || 0);
      setNow(Date.now());
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
      setProgress(null);
      setRefreshingHandles(new Set());
    }
  };

  const handleContextMenu = (e: React.MouseEvent, friend: Friend) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      handle: friend.handle,
      alias: friend.alias,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleEditAlias = (friend: Friend) => {
    setEditingFriend({ handle: friend.handle, alias: friend.alias });
    setEditAlias(friend.alias);
    setContextMenu(null);
  };

  const handleSaveAlias = async () => {
    if (!editingFriend) return;
    await window.api.store.updateFriend(editingFriend.handle, editAlias.trim());
    setEditingFriend(null);
    setEditAlias('');
    await loadData();
  };

  const handleRemoveFriend = async (handle: string) => {
    setContextMenu(null);
    if (confirm(`确定删除好友 ${handle} 吗?`)) {
      await window.api.store.removeFriend(handle);
      // 同时清除已查看的 rating 记录
      await window.api.store.removeViewedRating(handle);
      await loadData();
      // 如果在删除的好友详情页,返回列表
      if (location.pathname === `/friends/${handle}`) {
        navigate('/friends');
      }
    }
  };

  // 点击好友: 进入详情页并标记 rating 已查看,消除小红点
  const handleFriendClick = async (friend: Friend) => {
    const cache = caches[friend.handle];
    const rating = cache?.info?.rating;
    if (rating !== undefined) {
      // 更新已查看记录,清除变动标记
      await window.api.store.setViewedRating(friend.handle, rating);
      setViewedRatings((prev) => ({ ...prev, [friend.handle]: rating }));
    }
    navigate(`/friends/${friend.handle}`);
  };

  // 过滤 + 排序后的好友列表
  const displayFriends = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    let list = friends;
    // 搜索过滤: 匹配 handle 或 alias
    if (keyword) {
      list = friends.filter((f) => {
        const handle = f.handle.toLowerCase();
        const alias = (f.alias || '').toLowerCase();
        return handle.includes(keyword) || alias.includes(keyword);
      });
    }
    const sorted = [...list];
    if (sortBy === 'rating-desc') {
      // Rating 高→低
      sorted.sort((a, b) => {
        const ra = caches[a.handle]?.info?.rating ?? -1;
        const rb = caches[b.handle]?.info?.rating ?? -1;
        return rb - ra;
      });
    } else if (sortBy === 'recent') {
      // 最近活跃(按最后在线时间排序)
      sorted.sort((a, b) => {
        const ta = caches[a.handle]?.info?.lastOnlineTimeSeconds ?? 0;
        const tb = caches[b.handle]?.info?.lastOnlineTimeSeconds ?? 0;
        return tb - ta;
      });
    }
    // default: 保持添加顺序(friends 数组本身就是添加顺序)
    return sorted;
  }, [friends, caches, searchText, sortBy]);

  // 计算"距上次刷新"的文案
  const refreshHint = useMemo(() => {
    if (!lastRefreshAt) return '';
    const diffMs = now - lastRefreshAt;
    if (diffMs < 0) return '';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}天前`;
  }, [lastRefreshAt, now]);

  return (
    <aside className={styles.sidebar}>
      <h1 className={styles.title}>CF Friends</h1>

      {/* 搜索框 + 排序下拉 */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜索好友..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          title="排序方式"
        >
          <option value="default">默认</option>
          <option value="rating-desc">Rating 高→低</option>
          <option value="recent">最近活跃</option>
        </select>
      </div>

      <div className={styles.friendList}>
        {friends.length === 0 && (
          <p className={styles.empty}>点击下方 + 添加好友</p>
        )}
        {friends.length > 0 && displayFriends.length === 0 && (
          <p className={styles.empty}>未找到匹配的好友</p>
        )}
        {displayFriends.map((f) => {
          const cache = caches[f.handle];
          const rating = cache?.info?.rating;
          const online = cache?.info
            ? Date.now() / 1000 - cache.info.lastOnlineTimeSeconds < 300
            : false;
          const isRefreshing = refreshingHandles.has(f.handle);
          // Rating 变动标记: 当前缓存 rating 与已查看记录不一致时显示小红点
          const ratingChanged =
            rating !== undefined && rating !== viewedRatings[f.handle];
          return (
            <div
              key={f.handle}
              className={`${styles.friendItem} ${location.pathname === `/friends/${f.handle}` ? styles.friendItemActive : ''}`}
              onClick={() => handleFriendClick(f)}
              onContextMenu={(e) => handleContextMenu(e, f)}
            >
              <img
                src={cache?.info?.avatar || NO_AVATAR}
                className={styles.avatar}
                alt={f.handle}
              />
              <div className={styles.info}>
                <span className={styles.handle}>{f.alias || f.handle}</span>
                {isRefreshing ? (
                  <span className={styles.loadingText}>加载中...</span>
                ) : rating !== undefined ? (
                  <span
                    className={styles.rating}
                    style={{ color: getRankColor(cache?.info?.rank) }}
                  >
                    {rating}
                  </span>
                ) : null}
              </div>
              {isRefreshing ? (
                <span className={styles.spinner} />
              ) : ratingChanged ? (
                <span className={styles.ratingDot} title="Rating 有变动" />
              ) : (
                <span className={`${styles.dot} ${online ? styles.online : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* 左下角个人信息 */}
      <div className={styles.myProfile} onClick={() => myHandle && navigate(`/friends/${myHandle}`)}>
        {myInfo ? (
          <>
            <img
              src={myInfo.avatar || NO_AVATAR}
              className={styles.myAvatar}
              alt={myInfo.handle}
            />
            <div className={styles.myInfo}>
              <span className={styles.myHandle}>{myInfo.handle}</span>
              <span className={styles.myRating} style={{ color: getRankColor(myInfo.rank) }}>
                {getRankLabel(myInfo.rank)} · {myInfo.rating ?? 'N/A'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className={styles.myAvatarPlaceholder}>?</div>
            <div className={styles.myInfo}>
              <span className={styles.myHandle}>未设置</span>
              <span className={styles.myRating}>去设置填写 handle</span>
            </div>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button onClick={() => setNavCollapsed(!navCollapsed)} className={styles.collapseToggle}>
          {navCollapsed ? '▶ 导航' : '▼ 导航'}
        </button>
        {!navCollapsed && (
          <>
            <button onClick={() => navigate('/add')} className={location.pathname === '/add' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>＋</span> 添加好友
            </button>
            <button onClick={() => navigate('/leaderboard')} className={location.pathname === '/leaderboard' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>🏆</span> 排行榜
            </button>
            <button onClick={() => navigate('/teams')} className={location.pathname === '/teams' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>👥</span> 团队
            </button>
            <button onClick={() => navigate('/contests')} className={location.pathname === '/contests' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>📅</span> 近期比赛
            </button>
            <button onClick={() => navigate('/compare')} className={location.pathname === '/compare' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>📊</span> 好友对比
            </button>
            <button onClick={() => navigate('/report')} className={location.pathname === '/report' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>📝</span> 周报/月报
            </button>
            <button onClick={() => navigate('/settings')} className={location.pathname === '/settings' ? `${styles.btn} ${styles.btnActive}` : styles.btn}>
              <span className={styles.btnIcon}>⚙</span> 设置
            </button>
          </>
        )}
        <button onClick={() => handleRefresh()} disabled={refreshing} className={styles.refreshBtn}>
          {refreshing && progress
            ? `刷新中 ${progress.completed}/${progress.total}`
            : refreshHint
              ? `↻ 刷新全部 (${refreshHint})`
              : '↻ 刷新全部'}
        </button>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className={styles.overlay} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className={styles.contextMenu}
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div
              className={styles.contextItem}
              onClick={() => {
                const friend = friends.find((f) => f.handle === contextMenu.handle);
                if (friend) handleEditAlias(friend);
              }}
            >
              ✏️ 修改备注
            </div>
            <div
              className={`${styles.contextItem} ${styles.contextDanger}`}
              onClick={() => handleRemoveFriend(contextMenu.handle)}
            >
              🗑️ 删除好友
            </div>
          </div>
        </>
      )}

      {/* 备注编辑弹窗 */}
      {editingFriend && (
        <div className={styles.modalOverlay} onClick={() => setEditingFriend(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>修改备注</h3>
            <p className={styles.modalHandle}>{editingFriend.handle}</p>
            <input
              type="text"
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              placeholder="输入备注名(留空则显示 handle)"
              className={styles.modalInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAlias();
                if (e.key === 'Escape') setEditingFriend(null);
              }}
            />
            <div className={styles.modalActions}>
              <button onClick={() => setEditingFriend(null)} className={styles.modalCancel}>取消</button>
              <button onClick={handleSaveAlias} className={styles.modalConfirm}>保存</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
