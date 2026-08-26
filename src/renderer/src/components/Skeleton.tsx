import styles from '../styles/skeleton.module.css';
import type { ReactNode } from 'react';

/**
 * 骨架屏组件: 在数据加载期间展示占位, 替代空白 / "加载中..." 文案,
 * 让界面在感知响应速度上更平滑。样式跟随主题变量。
 */

export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: string | number }) {
  return <div className={styles.line} style={{ width, height }} />;
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return <div className={styles.avatar} style={{ width: size, height: size }} />;
}

/**
 * 好友列表项骨架(头像 + handle + rating)。
 */
export function SkeletonFriendRow() {
  return (
    <div className={styles.friendRow}>
      <SkeletonAvatar size={32} />
      <div className={styles.friendInfo}>
        <SkeletonLine width="40%" height={12} />
        <SkeletonLine width="24px" height={12} />
      </div>
      <div className={styles.friendDot} />
    </div>
  );
}

/**
 * 通用卡片骨架(用于 Feed / 详情等)。
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/**
 * 列表骨架: 渲染 count 个 row 组件。
 */
export function SkeletonList({ count = 6, children }: { count?: number; children?: ReactNode }) {
  return (
    <div className={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{children ?? <SkeletonFriendRow />}</div>
      ))}
    </div>
  );
}
