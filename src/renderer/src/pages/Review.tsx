import { useEffect, useMemo, useState, useCallback } from 'react';
import type { CFContest, CFRatingChange, CFSubmission, MeCache, ReviewState, ReviewProblem } from '../types';
import { useToast } from '../components/Toast';
import { callApi } from '../utils/safe-call';
import { SkeletonCard } from '../components/Skeleton';
import ContestReview from '../components/review/ContestReview';
import ReviewLibrary from '../components/review/ReviewLibrary';
import DailyPractice from '../components/review/DailyPractice';
import PracticeTimeline from '../components/review/PracticeTimeline';
import styles from '../styles/review.module.css';

type Tab = 'review' | 'library' | 'daily' | 'timeline';

// 复盘页缓存 TTL: 5 分钟内视为新鲜, 直接命中, 零网络; 过期则后台静默刷新
const ME_CACHE_TTL_MS = 5 * 60 * 1000;

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.round(hr / 24)} 天前`;
}

function buildContestMap(contests: CFContest[]): Map<number, CFContest> {
  const map = new Map<number, CFContest>();
  for (const c of contests) map.set(c.id, c);
  return map;
}

export default function Review() {
  const toast = useToast();
  const [myHandle, setMyHandle] = useState('');
  const [ratingHistory, setRatingHistory] = useState<CFRatingChange[]>([]);
  const [contestMap, setContestMap] = useState<Map<number, CFContest>>(new Map());
  const [submissions, setSubmissions] = useState<CFSubmission[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState>({ problems: [], performance: {} });
  const [tab, setTab] = useState<Tab>('review');
  // 'init' = 首次无缓存, 显示骨架屏; 'ready' = 已有数据(来自缓存或网络), 可正常渲染
  const [phase, setPhase] = useState<'init' | 'ready'>('init');
  // 后台刷新进行中(用于按钮 spinner, 不阻塞已有数据的渲染)
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<number>(0);

  const hydrateFromCache = useCallback((cache: MeCache) => {
    setRatingHistory(cache.ratingHistory);
    setContestMap(buildContestMap(cache.finishedContests));
    setSubmissions(cache.submissions);
    setCachedAt(cache.cachedAt);
  }, []);

  const refreshReview = useCallback(async () => {
    const rs = await callApi(window.api.review.getState(), toast);
    if (rs) setReviewState(rs);
  }, [toast]);

  // 拉取并写入 me 缓存; 成功时 hydrate, 失败保留旧数据(由 callApi 统一 toast)
  const refreshMeData = useCallback(
    async (handle: string, opts: { silent?: boolean } = {}) => {
      if (!handle) return;
      setRefreshing(true);
      const entry = await callApi(window.api.cf.refreshMeData(handle), toast, {
        errorMsg: '刷新复盘数据失败',
        successMsg: opts.silent ? undefined : '复盘数据已刷新',
      });
      if (entry) {
        hydrateFromCache(entry);
        setPhase('ready');
      }
      setRefreshing(false);
    },
    [toast, hydrateFromCache],
  );

  // 首次加载: 同步读 meCache → 有则立即 hydrate; 过期或无则后台/阻塞刷新
  useEffect(() => {
    (async () => {
      const settings = await window.api.store.getSettings();
      setMyHandle(settings.myHandle);
      if (!settings.myHandle) {
        setPhase('ready'); // 无 handle: 不显示骨架, 直接展示空提示
        return;
      }
      const handle = settings.myHandle;
      // reviewState 始终加载(本地, 极快)
      const rs = await callApi(window.api.review.getState(), toast);
      if (rs) setReviewState(rs);

      const cache = await window.api.cf.getMeCache(handle);
      if (cache) {
        // 命中: 立即 hydrate + 渲染, 零延迟
        hydrateFromCache(cache);
        setPhase('ready');
        // 新鲜则不请求; 过期则后台静默刷新(已有数据继续显示, 不闪骨架)
        if (Date.now() - cache.cachedAt < ME_CACHE_TTL_MS) return;
        refreshMeData(handle, { silent: true });
      } else {
        // 未命中: 首次访问, 阻塞拉取(显示骨架), 完成后 hydrate
        await refreshMeData(handle, { silent: false });
      }
    })();
    // toast / hydrateFromCache / refreshMeData 已用 useCallback 稳定, 依赖稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前 rating(取最近一场的 newRating)
  const myRating = useMemo(() => {
    if (ratingHistory.length === 0) return 0;
    const latest = [...ratingHistory].sort((a, b) => b.ratingUpdateTimeSeconds - a.ratingUpdateTimeSeconds)[0];
    return latest.newRating;
  }, [ratingHistory]);

  const addToReview = useCallback(
    async (p: {
      contestId: number;
      index: string;
      name?: string;
      rating?: number;
      tags?: string[];
      source: ReviewProblem['source'];
    }) => {
      const item: ReviewProblem = {
        contestId: p.contestId,
        index: p.index,
        name: p.name,
        rating: p.rating,
        tags: p.tags,
        source: p.source,
        addedAt: Date.now(),
      };
      const n = await callApi(window.api.review.add([item]), toast);
      if (n !== null) {
        if (n > 0) {
          toast.success(`已加入复习库：${p.contestId}${p.index}`);
          refreshReview();
        } else {
          toast.info('该题已在复习库中');
        }
      }
    },
    [toast, refreshReview],
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'review', label: '赛事复盘' },
    { key: 'library', label: '复习题库' },
    { key: 'daily', label: '每日练习' },
    { key: 'timeline', label: '练习时间轴' },
  ];

  const noHandle = !myHandle && phase === 'ready';
  const showSkeleton = phase === 'init';

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>复盘与练习</h2>
      <p className={styles.subtitle}>
        个人赛事复盘、复习题库、每日练习与练习时间轴 —— 围绕「我」的训练数据沉淀。
      </p>

      {/* 缓存状态条 + 手动刷新: 仅在有 handle 且已有数据时显示 */}
      {myHandle && cachedAt > 0 && (
        <div className={styles.toolbar}>
          <span className={styles.sectionHint}>更新于 {fmtAgo(cachedAt)}</span>
          <span className={styles.spacer} />
          <button
            className={`${styles.btn} ${styles.btnSm}`}
            onClick={() => refreshMeData(myHandle)}
            disabled={refreshing}
          >
            {refreshing ? '刷新中…' : '刷新数据'}
          </button>
        </div>
      )}

      {noHandle && (
        <div className={styles.empty}>
          尚未设置你的 CF handle。请到「设置」填写，并在好友列表刷新后，这里才会同步你的参赛与提交记录。
        </div>
      )}

      {showSkeleton && (
        <div>
          <SkeletonCard lines={3} />
          <div style={{ height: 10 }} />
          <SkeletonCard lines={3} />
        </div>
      )}

      {phase === 'ready' && myHandle && (
        <>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'review' && (
            <ContestReview
              ratingHistory={ratingHistory}
              contestMap={contestMap}
              submissions={submissions}
              performanceCache={reviewState.performance}
              onAddToReview={addToReview}
            />
          )}
          {tab === 'library' && <ReviewLibrary reviewState={reviewState} onChanged={refreshReview} />}
          {tab === 'daily' && (
            <DailyPractice
              submissions={submissions}
              myRating={myRating}
              reviewState={reviewState}
              onChanged={refreshReview}
              onAddToReview={addToReview}
            />
          )}
          {tab === 'timeline' && (
            <PracticeTimeline submissions={submissions} onAddToReview={addToReview} />
          )}
        </>
      )}
    </div>
  );
}
