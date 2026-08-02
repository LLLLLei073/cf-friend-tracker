import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { RequestQueue, fetchUserInfoSafe } from '../src/main/cf-api';

// mock axios: 测试 fetchUserInfoSafe 的降级逻辑时拦截网络请求
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(),
      isAxiosError: (e: unknown) => (e as { __isAxios?: boolean })?.__isAxios === true,
    },
  };
});

describe('RequestQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('executes requests sequentially', async () => {
    const results: number[] = [];
    const queue = new RequestQueue(100); // 100ms 间隔加速测试
    const p1 = queue.enqueue(async () => { results.push(1); return 1; });
    const p2 = queue.enqueue(async () => { results.push(2); return 2; });

    // 还没到第二次执行
    await vi.advanceTimersByTimeAsync(50);
    expect(results).toEqual([1]);

    await vi.advanceTimersByTimeAsync(100);
    expect(results).toEqual([1, 2]);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('preserves order', async () => {
    const results: number[] = [];
    const queue = new RequestQueue(50);
    const promises: Promise<number>[] = [];
    for (let i = 0; i < 5; i++) {
      const idx = i;
      promises.push(queue.enqueue(async () => { results.push(idx); return idx; }));
    }
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(promises);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('propagates errors', async () => {
    const queue = new RequestQueue(50);
    const p = queue.enqueue(async () => { throw new Error('boom'); });
    await expect(p).rejects.toThrow('boom');
  });
});

describe('fetchUserInfoSafe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  const okUser = (handle: string) => ({
    handle,
    lastOnlineTimeSeconds: 0,
    registrationTimeSeconds: 0,
  });

  it('整批成功时一次请求返回全部, 不降级', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { status: 'OK', result: [okUser('a'), okUser('b')] },
    });
    const p = fetchUserInfoSafe(['a', 'b']);
    await vi.advanceTimersByTimeAsync(5000);
    const { infos, failed } = await p;
    expect(infos.map((u) => u.handle)).toEqual(['a', 'b']);
    expect(failed).toEqual([]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('整批失败(一个无效 handle)时降级逐 handle, 有效好友不丢失', async () => {
    const get = axios.get as ReturnType<typeof vi.fn>;
    // 整批请求 FAILED (CF 行为: 一个 handle 无效则整体 FAILED)
    get.mockResolvedValueOnce({
      data: { status: 'FAILED', comment: 'handles: User with handle bad not found' },
    });
    // 降级: a 成功, bad 失败, b 成功 (每个 handle 走全局队列, 间隔 2s)
    get.mockResolvedValueOnce({ data: { status: 'OK', result: [okUser('a')] } });
    get.mockResolvedValueOnce({
      data: { status: 'FAILED', comment: 'handles: User with handle bad not found' },
    });
    get.mockResolvedValueOnce({ data: { status: 'OK', result: [okUser('b')] } });

    const p = fetchUserInfoSafe(['a', 'bad', 'b']);
    // 1 次整批 + 3 次降级, 每次间隔 2s -> 推进 20s 足够(含队列残留间隔)
    await vi.advanceTimersByTimeAsync(20000);
    const { infos, failed } = await p;
    expect(infos.map((u) => u.handle)).toEqual(['a', 'b']);
    expect(failed).toEqual(['bad']);
    // 1 次整批 + 3 次降级
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('空数组直接返回', async () => {
    const { infos, failed } = await fetchUserInfoSafe([]);
    expect(infos).toEqual([]);
    expect(failed).toEqual([]);
  });
});
