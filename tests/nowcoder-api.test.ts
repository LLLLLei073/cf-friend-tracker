import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchNowcoderUser, NowcoderNoCookieError } from '../src/main/nowcoder-api';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

function okHtml(html: string) {
  return { status: 200, data: html, headers: {} };
}
function redirectResp() {
  // 牛客 cookie 失效时, 接口 302 到登录页
  return { status: 302, data: '', headers: {} };
}

// 构造一个包含 window.__INITIAL_STATE__ 的页面 HTML; state 为任意 JS 对象
function pageWithState(state: unknown): string {
  return `<!doctype html><html><head><title>nowcoder</title></head><body>` +
    `<script>window.__INITIAL_STATE__=${JSON.stringify(state)};</script>` +
    `</body></html>`;
}

describe('nowcoder-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchNowcoderUser', () => {
    it('throws NowcoderNoCookieError when cookie is empty', async () => {
      await expect(fetchNowcoderUser(123, '')).rejects.toBeInstanceOf(NowcoderNoCookieError);
      // 不应发起任何请求
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('throws NowcoderNoCookieError on 302 (cookie invalid)', async () => {
      mockedAxios.get.mockResolvedValueOnce(redirectResp());
      await expect(fetchNowcoderUser(123, 'somecookie=1')).rejects.toBeInstanceOf(
        NowcoderNoCookieError,
      );
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('maps embedded __INITIAL_STATE__ user object to NowcoderUser', async () => {
      const html = pageWithState({
        user: {
          userId: 123456,
          nickname: 'TestUser',
          rating: 1800,
          accepted: 250,
          solved: 250,
          avatar: 'https://x/y.png',
        },
      });
      mockedAxios.get.mockResolvedValueOnce(okHtml(html));
      const u = await fetchNowcoderUser(123456, 'somecookie=1');
      expect(u.id).toBe(123456);
      expect(u.name).toBe('TestUser');
      expect(u.rating).toBe(1800);
      expect(u.accepted).toBe(250);
      expect(u.solved).toBe(250);
      expect(u.avatar).toBe('https://x/y.png');
    });

    it('recursively finds a deeply nested user object', async () => {
      // 用户对象藏在多层嵌套里, 验证 DFS 递归查找而非硬编码路径
      const html = pageWithState({
        app: {
          nav: { title: 'nowcoder' },
          contest: {
            profile: {
              detail: {
                participant: {
                  uid: 987654,
                  userName: 'DeepUser',
                  score: 1200,
                  solvedCount: 88,
                },
              },
            },
          },
        },
      });
      mockedAxios.get.mockResolvedValueOnce(okHtml(html));
      const u = await fetchNowcoderUser(987654, 'somecookie=1');
      expect(u.id).toBe(987654);
      expect(u.name).toBe('DeepUser');
      expect(u.rating).toBe(1200); // rating <- score
      expect(u.solved).toBe(88); // solved <- solvedCount
    });

    it('handles string-typed numeric fields (uid/rating as strings)', async () => {
      const html = pageWithState({
        data: { uid: '555', name: 'StrUser', rating: '2100', acceptCount: '30' },
      });
      mockedAxios.get.mockResolvedValueOnce(okHtml(html));
      const u = await fetchNowcoderUser(555, 'somecookie=1');
      expect(u.id).toBe(555);
      expect(u.name).toBe('StrUser');
      expect(u.rating).toBe(2100);
      expect(u.accepted).toBe(30);
    });

    it('throws when no user object found in __INITIAL_STATE__', async () => {
      const html = pageWithState({ a: 1, b: { c: 2 } });
      mockedAxios.get.mockResolvedValueOnce(okHtml(html));
      await expect(fetchNowcoderUser(1, 'somecookie=1')).rejects.toThrow(/未在页面状态中找到用户对象/);
    });

    it('throws when parsed user name is empty', async () => {
      const html = pageWithState({ userId: 1, nickname: '' });
      mockedAxios.get.mockResolvedValueOnce(okHtml(html));
      await expect(fetchNowcoderUser(1, 'somecookie=1')).rejects.toThrow(/用户名为空/);
    });

    it('throws when page has no __INITIAL_STATE__', async () => {
      mockedAxios.get.mockResolvedValueOnce(okHtml('<html><body>no data</body></html>'));
      await expect(fetchNowcoderUser(1, 'somecookie=1')).rejects.toThrow(/页面未内嵌/);
    });
  });
});
