import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Friend, ProblemListItem, CFContest } from '../types';
import styles from '../styles/command-palette.module.css';

type ItemType = 'friend' | 'problem' | 'contest' | 'page';

interface SearchItem {
  id: string;
  type: ItemType;
  title: string;
  subtitle?: string;
  link: string;
  icon: string;
}

const PAGES: SearchItem[] = [
  { id: 'page-friends', type: 'page', title: '好友列表', link: '/friends', icon: '👥' },
  { id: 'page-feed', type: 'page', title: '动态', link: '/feed', icon: '📡' },
  { id: 'page-leaderboard', type: 'page', title: '排行榜', link: '/leaderboard', icon: '🏆' },
  { id: 'page-teams', type: 'page', title: '团队', link: '/teams', icon: '👥' },
  { id: 'page-contests', type: 'page', title: '近期比赛', link: '/contests', icon: '📅' },
  { id: 'page-problems', type: 'page', title: '刷题', link: '/problems', icon: '✎' },
  { id: 'page-training', type: 'page', title: '训练看板', link: '/training', icon: '📈' },
  { id: 'page-virtual', type: 'page', title: '虚拟比赛', link: '/virtual', icon: '⏱' },
  { id: 'page-compare', type: 'page', title: '好友对比', link: '/compare', icon: '📊' },
  { id: 'page-report', type: 'page', title: '周报/月报', link: '/report', icon: '📝' },
  { id: 'page-add', type: 'page', title: '添加好友', link: '/add', icon: '＋' },
  { id: 'page-settings', type: 'page', title: '设置', link: '/settings', icon: '⚙' },
];

const TYPE_LABEL: Record<ItemType, string> = {
  friend: '好友',
  problem: '题目',
  contest: '比赛',
  page: '页面',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 全局命令面板(Ctrl+K)。聚合 好友 / 题目 / 比赛 / 页面 四类,
 * 模糊匹配并键盘导航(↑↓选择, Enter 跳转, Esc 关闭)。
 *
 * 数据在打开时按需拉取(题目列表与比赛均本地缓存, 无网络压力)。
 */
export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [contests, setContests] = useState<CFContest[]>([]);

  // 打开时拉取数据(题目/比赛为本地缓存, 好友为内存)
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    Promise.all([
      window.api.store.getFriends(),
      window.api.problem.getList(),
      window.api.cf.getFinishedContests(50),
    ]).then(([f, p, c]) => {
      setFriends(f);
      setProblems(p);
      setContests(c);
    });
    // 聚焦输入框
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // 模糊匹配: query 为空时仅展示页面快捷入口(避免一次渲染上万题目)
  const results = useMemo<SearchItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;

    const items: SearchItem[] = [];

    // 好友: handle / alias
    for (const f of friends) {
      const label = (f.alias || f.handle).toLowerCase();
      const handle = f.handle.toLowerCase();
      if (label.includes(q) || handle.includes(q)) {
        items.push({
          id: `friend-${f.handle}`,
          type: 'friend',
          title: f.alias || f.handle,
          subtitle: f.handle,
          link: `/friends/${f.handle}`,
          icon: '👤',
        });
      }
    }

    // 题目: "1234A" / "1234" / 题名(取前 40 条避免过多)
    let problemHits = 0;
    for (const p of problems) {
      if (problemHits >= 40) break;
      const code = `${p.contestId}${p.index}`.toLowerCase();
      const name = p.name.toLowerCase();
      if (code.startsWith(q) || code.includes(q) || name.includes(q)) {
        items.push({
          id: `problem-${p.contestId}-${p.index}`,
          type: 'problem',
          title: `${p.contestId}${p.index} - ${p.name}`,
          subtitle: p.rating ? `难度 ${p.rating}` : undefined,
          link: `/problems/${p.contestId}/${p.index}`,
          icon: '✎',
        });
        problemHits++;
      }
    }

    // 比赛: 名称 / id
    for (const c of contests) {
      const label = c.name.toLowerCase();
      if (label.includes(q) || String(c.id) === q) {
        items.push({
          id: `contest-${c.id}`,
          type: 'contest',
          title: c.name,
          subtitle: `#${c.id}`,
          link: '/contests',
          icon: '📅',
        });
      }
    }

    // 页面: 始终参与匹配
    for (const pg of PAGES) {
      if (pg.title.toLowerCase().includes(q)) {
        items.push(pg);
      }
    }

    return items.slice(0, 50);
  }, [query, friends, problems, contests]);

  // activeIndex 越界修正
  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(0);
  }, [results, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) {
        navigate(item.link);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="搜索好友 / 题目 / 比赛 / 页面..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.results}>
          {results.length === 0 && (
            <div className={styles.empty}>未找到匹配项</div>
          )}
          {results.map((item, i) => (
            <div
              key={item.id}
              className={`${styles.row} ${i === activeIndex ? styles.rowActive : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                navigate(item.link);
                onClose();
              }}
            >
              <span className={styles.icon}>{item.icon}</span>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>{item.title}</span>
                {item.subtitle && (
                  <span className={styles.rowSubtitle}>{item.subtitle}</span>
                )}
              </div>
              <span className={styles.typeTag}>{TYPE_LABEL[item.type]}</span>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <span>↑↓ 选择</span>
          <span>↵ 跳转</span>
          <span>esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
