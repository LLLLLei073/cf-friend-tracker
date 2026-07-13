import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestQueue } from '../src/main/cf-api';

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
