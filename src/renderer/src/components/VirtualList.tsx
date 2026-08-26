import { useMemo, useRef, useState, useCallback, type ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  /** 单行高度(px), 必须固定才能正确计算可见区间 */
  rowHeight: number;
  /** 渲染单行; index 为原始下标, 便于取 key 与跳转 */
  renderRow: (item: T, index: number) => ReactNode;
  /** 可视区外额外渲染的行数, 减少滚动时空白闪烁(默认 4) */
  overscan?: number;
  /** 列表高度, 默认 100% 撑满父容器 */
  height?: number | string;
  className?: string;
  /** 空数据时展示 */
  emptyPlaceholder?: ReactNode;
}

/**
 * 通用虚拟列表: 只渲染可视区 + overscan 行, 长列表(>200)显著降低 DOM 节点数。
 *
 * 约束: rowHeight 必须固定。若行高动态变化, 此实现不适用(需 resize observer 版本)。
 * 用于好友列表 / Feed / 题目列表等可定高场景。
 */
export default function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  overscan = 4,
  height = '100%',
  className,
  emptyPlaceholder,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { totalHeight, startIndex, endIndex, visibleItems } = useMemo(() => {
    const total = items.length * rowHeight;
    const containerH = containerRef.current?.clientHeight ?? 600;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + containerH) / rowHeight) + overscan,
    );
    return {
      totalHeight: total,
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end),
    };
  }, [items, rowHeight, scrollTop, overscan]);

  if (items.length === 0 && emptyPlaceholder) {
    return <div style={{ height }}>{emptyPlaceholder}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={onScroll}
      style={{ height, overflowY: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startIndex * rowHeight,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, i) => renderRow(item, startIndex + i))}
        </div>
      </div>
    </div>
  );
}
