import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProblemListItem } from '../types';
import { getRatingColor } from '../utils/rank';
import styles from '../styles/problems.module.css';

const PAGE_SIZE = 50;

export default function Problems() {
  const navigate = useNavigate();
  const [all, setAll] = useState<ProblemListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [tag, setTag] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const data = force
        ? await window.api.problem.refreshList()
        : await window.api.problem.getList();
      // 仅保留可抓取的题目（有 contestId），按 contestId 倒序（新题在前）
      const usable = data
        .filter((p) => p.contestId && p.contestId > 0)
        .sort((a, b) => b.contestId - a.contestId || a.index.localeCompare(b.index));
      setAll(usable);
    } catch (e) {
      let msg = (e as Error).message || String(e);
      msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
      setError(`加载失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // 所有可用标签（去重排序），用于下拉筛选
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of all) for (const t of p.tags) set.add(t);
    return [...set].sort();
  }, [all]);

  // 应用筛选
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const min = minRating ? parseInt(minRating) : undefined;
    const max = maxRating ? parseInt(maxRating) : undefined;
    return all.filter((p) => {
      if (kw) {
        const id = `${p.contestId}${p.index}`.toLowerCase();
        const idSpace = `${p.contestId} ${p.index}`.toLowerCase();
        if (
          !p.name.toLowerCase().includes(kw) &&
          !id.includes(kw) &&
          !idSpace.includes(kw)
        ) {
          return false;
        }
      }
      if (tag && !p.tags.includes(tag)) return false;
      if (min !== undefined && (p.rating === undefined || p.rating < min)) return false;
      if (max !== undefined && (p.rating === undefined || p.rating > max)) return false;
      return true;
    });
  }, [all, keyword, tag, minRating, maxRating]);

  // 筛选变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [keyword, tag, minRating, maxRating]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setKeyword('');
    setTag('');
    setMinRating('');
    setMaxRating('');
  };

  const hasFilter = keyword || tag || minRating || maxRating;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>题目练习</h2>
        <button className={styles.refreshBtn} onClick={() => load(true)} disabled={loading}>
          {loading ? '加载中...' : '刷新题库'}
        </button>
      </div>
      <p className={styles.subtitle}>
        从 Codeforces 抓取题目，可离线查看题面、编写 C++ 代码并一键对拍样例。
      </p>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          placeholder="搜索题名或编号（如 1234A / 二分）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select className={styles.tagSelect} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className={styles.filterLabel}>难度</span>
        <input
          className={styles.ratingInput}
          type="number"
          placeholder="最低"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
        />
        <span className={styles.filterLabel}>-</span>
        <input
          className={styles.ratingInput}
          type="number"
          placeholder="最高"
          value={maxRating}
          onChange={(e) => setMaxRating(e.target.value)}
        />
        {hasFilter && (
          <button className={styles.clearBtn} onClick={clearFilters}>
            清空筛选
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading && all.length === 0 ? (
        <p className={styles.empty}>正在加载题库（首次会从 Codeforces 拉取全部题目，稍候）...</p>
      ) : filtered.length === 0 ? (
        error ? null : <p className={styles.empty}>没有符合条件的题目。</p>
      ) : (
        <>
          <p className={styles.count}>
            共 {filtered.length} 道题 · 第 {page}/{totalPages} 页
          </p>
          <div className={styles.list}>
            {pageItems.map((p) => (
              <div
                key={`${p.contestId}${p.index}`}
                className={styles.row}
                onClick={() => navigate(`/problems/${p.contestId}/${p.index}`)}
              >
                <span className={styles.rowId}>
                  {p.contestId}
                  {p.index}
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{p.name}</div>
                  {p.tags.length > 0 && (
                    <div className={styles.rowTags}>
                      {p.tags.slice(0, 6).map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.rowRight}>
                  {p.rating !== undefined ? (
                    <span className={styles.ratingBadge} style={{ color: getRatingColor(p.rating) }}>
                      {p.rating}
                    </span>
                  ) : (
                    <span className={styles.ratingBadge} style={{ color: 'var(--text-muted)' }}>
                      —
                    </span>
                  )}
                  {p.solvedCount !== undefined && (
                    <span className={styles.solved}>{p.solvedCount.toLocaleString()} 通过</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              上一页
            </button>
            <span className={styles.pageInfo}>
              {page} / {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
