import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from '../styles/altNavWheel.module.css';

// 与侧边栏悬浮导航面板一致的导航项
const NAV = [
  { label: '添加好友', path: '/add', icon: '＋', match: (p: string) => p === '/add' },
  { label: '动态', path: '/feed', icon: '📡', match: (p: string) => p === '/feed' },
  { label: '排行榜', path: '/leaderboard', icon: '🏆', match: (p: string) => p === '/leaderboard' },
  { label: '团队', path: '/teams', icon: '👥', match: (p: string) => p === '/teams' },
  { label: '近期比赛', path: '/contests', icon: '📅', match: (p: string) => p === '/contests' },
  { label: '刷题 (test)', path: '/problems', icon: '✎', match: (p: string) => p.startsWith('/problems') },
  { label: '好友对比', path: '/compare', icon: '📊', match: (p: string) => p === '/compare' },
  { label: '周报/月报', path: '/report', icon: '📝', match: (p: string) => p === '/report' },
  { label: '设置', path: '/settings', icon: '⚙', match: (p: string) => p === '/settings' },
];

// 左侧半轮盘几何参数：直边在屏幕左侧，圆弧向右凸出；项目沿直边竖向排列。
const CX = 60; // 直边/圆心 x（贴近屏幕左缘）
const R = 230; // 半圆弧半径
const GAP = 56; // 项目竖向间距
const MOVE_TH = 80; // 滚轮触发一次移动所需累计 deltaY
const MOVE_COOLDOWN_MS = 130; // 滚轮事件冷却，避免触控板过于灵敏地连跳

export default function AltNavWheel() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0); // 当前选中项（滚轮/方向键控制）
  const [hover, setHover] = useState<number | null>(null); // 鼠标悬停项（仅高亮, 不移动列表）

  const openRef = useRef(false);
  const selRef = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const accRef = useRef(0);
  const lastMoveAtRef = useRef(0);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const move = useCallback((dir: number) => {
    const n = NAV.length;
    const next = (selRef.current + dir + n) % n;
    selRef.current = next;
    setSelected(next);
    // 用滚轮/方向键时, 悬停态失效, 高亮跟随旋转后的选中项
    hoverRef.current = null;
    setHover(null);
  }, []);

  const confirm = useCallback(() => {
    const target = hoverRef.current != null ? hoverRef.current : selRef.current;
    openRef.current = false;
    setOpen(false);
    navigate(NAV[target].path);
  }, [navigate]);

  const cancel = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    const currentIndex = () => {
      const i = NAV.findIndex((it) => it.match(pathRef.current));
      return i >= 0 ? i : 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (!openRef.current) {
          e.preventDefault();
          const idx = currentIndex();
          selRef.current = idx;
          setSelected(idx);
          hoverRef.current = null;
          setHover(null);
          accRef.current = 0;
          lastMoveAtRef.current = 0;
          openRef.current = true;
          setOpen(true);
        }
        return;
      }
      if (!openRef.current) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        move(1);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'AltLeft' || e.code === 'AltRight') && openRef.current) {
        e.preventDefault();
        confirm();
      }
    };

    // 滚轮上下滑动选择：累计阈值 + 冷却, 避免鼠标滚轮/触控板一次跳多项
    const onWheel = (e: WheelEvent) => {
      if (!openRef.current) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastMoveAtRef.current < MOVE_COOLDOWN_MS) return;
      accRef.current += e.deltaY;
      if (Math.abs(accRef.current) >= MOVE_TH) {
        move(accRef.current > 0 ? 1 : -1);
        accRef.current = 0;
        lastMoveAtRef.current = now;
      }
    };

    const onBlur = () => {
      if (openRef.current) cancel();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
    };
  }, [move, confirm, cancel]);

  if (!open) return null;

  const vh = window.innerHeight;
  const CY = vh / 2;
  const active = hover != null ? hover : selected;
  // 右侧半圆弧：从顶部 (CX, CY-R) 顺时针向右凸出到 底部 (CX, CY+R)
  const guidePath = `M ${CX} ${CY - R} A ${R} ${R} 0 0 1 ${CX} ${CY + R}`;

  return (
    <>
      <div className={styles.backdrop} onClick={cancel} />
      <div className={styles.wheel}>
        <svg className={styles.guide} width={CX + R + 40} height={vh}>
          <path d={guidePath} fill="none" />
        </svg>
        {NAV.map((it, i) => {
          const y = CY + (i - selected) * GAP;
          const dy = i - selected;
          const isActive = i === active;
          // 离中心越远越淡/越小, 营造滚轮立体感
          const distanceFactor = Math.min(Math.abs(dy) / 4, 1);
          return (
            <button
              key={it.path}
              className={`${styles.item} ${isActive ? styles.itemSelected : ''}`}
              style={{
                left: CX,
                top: y,
                transform: `translate(-50%, -50%) scale(${isActive ? 1.2 : 0.9 - 0.12 * distanceFactor})`,
                opacity: isActive ? 1 : 0.55 - 0.2 * distanceFactor,
              }}
              onMouseEnter={() => {
                // 仅设置悬停高亮, 不移动项目列表, 避免光标下元素移动导致闪烁
                hoverRef.current = i;
                setHover(i);
              }}
              onMouseLeave={() => {
                hoverRef.current = null;
                setHover(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                hoverRef.current = i;
                confirm();
              }}
            >
              <span className={styles.itemIcon}>{it.icon}</span>
              <span className={styles.itemLabel}>{it.label}</span>
            </button>
          );
        })}
        <div className={styles.readout}>
          <span className={styles.readoutIcon}>{NAV[active].icon}</span>
          <span className={styles.readoutLabel}>{NAV[active].label}</span>
        </div>
        <div className={styles.hint}>按住 Alt · 滚轮上下滑动 · 松开跳转</div>
      </div>
    </>
  );
}
