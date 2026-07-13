import axios from 'axios';
import crypto from 'crypto';
import type {
  CFUser,
  CFRatingChange,
  CFSubmission,
  CFApiResponse,
} from '../shared/types';

const API_BASE = 'https://codeforces.com/api';
const MIN_INTERVAL_MS = 2000; // CF 限制:1次/2秒

/**
 * 请求队列:保证任意两次请求间隔 >= MIN_INTERVAL_MS
 */
export class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(private intervalMs: number = MIN_INTERVAL_MS) {}

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.intervalMs) {
        await new Promise((r) => setTimeout(r, this.intervalMs - elapsed));
      }
      this.lastRequestTime = Date.now();
      const task = this.queue.shift()!;
      await task();
    }

    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

async function cfRequest<T>(
  method: string,
  params: Record<string, string>,
  auth?: { apiKey: string; apiSecret: string }
): Promise<T> {
  return requestQueue.enqueue(async () => {
    const allParams: Record<string, string> = { ...params };

    if (auth) {
      const time = Math.floor(Date.now() / 1000).toString();
      allParams.apiKey = auth.apiKey;
      allParams.time = time;

      // 生成 apiSig
      const rand = crypto.randomBytes(3).toString('hex'); // 6 chars
      const sortedParams = Object.keys(allParams)
        .sort()
        .map((k) => `${k}=${allParams[k]}`)
        .join('&');
      const sigBase = `${rand}/${method}?${sortedParams}#${auth.apiSecret}`;
      const hash = crypto.createHash('sha512').update(sigBase).digest('hex');
      allParams.apiSig = rand + hash;
    }

    const query = new URLSearchParams(allParams).toString();
    const url = `${API_BASE}/${method}?${query}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await axios.get<CFApiResponse<T>>(url, { timeout: 10000 });
        if (resp.data.status === 'OK' && resp.data.result !== undefined) {
          return resp.data.result;
        }
        // Call limit exceeded -> retry once
        if (resp.data.comment === 'Call limit exceeded' && attempt === 0) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(resp.data.comment || 'API request failed');
      } catch (e) {
        lastError = e as Error;
        if (axios.isAxiosError(e) && attempt === 0) {
          // 网络错误不重试
          throw new Error(`网络错误: ${(e as Error).message}`);
        }
      }
    }
    throw lastError ?? new Error('API request failed');
  });
}

export async function fetchUserInfo(handles: string[]): Promise<CFUser[]> {
  return cfRequest<CFUser[]>('user.info', { handles: handles.join(';') });
}

export async function fetchUserRating(handle: string): Promise<CFRatingChange[]> {
  return cfRequest<CFRatingChange[]>('user.rating', { handle });
}

export async function fetchUserStatus(handle: string, count = 50): Promise<CFSubmission[]> {
  return cfRequest<CFSubmission[]>('user.status', { handle, count: count.toString() });
}

export async function fetchFriends(
  handle: string,
  apiKey: string,
  apiSecret: string
): Promise<string[]> {
  return cfRequest<string[]>('user.friends', { handle }, { apiKey, apiSecret });
}
