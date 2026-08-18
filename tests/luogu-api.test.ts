import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { searchLuoguUser, fetchLuoguUserDetail } from '../src/main/luogu-api';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

function okResp(data: unknown) {
  return { status: 200, data, headers: {} };
}
function redirectResp(cookie: string) {
  return { status: 302, data: '', headers: { 'set-cookie': [cookie] } };
}

describe('luogu-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchLuoguUserDetail', () => {
    it('maps user/info fields to LuoguUser', async () => {
      mockedAxios.get.mockResolvedValueOnce(
        okResp({
          user: {
            uid: 140001,
            name: 'tourist',
            passedProblemCount: 6,
            submittedProblemCount: 9,
            color: 'Gray',
            ccfLevel: 0,
          },
        }),
      );
      const u = await fetchLuoguUserDetail(140001);
      expect(u.uid).toBe(140001);
      expect(u.name).toBe('tourist');
      expect(u.passed).toBe(6);
      expect(u.submitted).toBe(9);
      expect(u.color).toBe('Gray');
    });

    it('handles C3VK 302 cookie handshake (retry once)', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(redirectResp('C3VK=abc'))
        .mockResolvedValueOnce(
          okResp({ user: { uid: 1, name: 'x', passedProblemCount: 1, submittedProblemCount: 1 } }),
        );
      const u = await fetchLuoguUserDetail(1);
      expect(u.uid).toBe(1);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('throws when user object missing', async () => {
      mockedAxios.get.mockResolvedValueOnce(okResp({}));
      await expect(fetchLuoguUserDetail(999)).rejects.toThrow();
    });
  });

  describe('searchLuoguUser', () => {
    it('maps user/search candidates to PlatformAccount[]', async () => {
      mockedAxios.get.mockResolvedValueOnce(
        okResp({ users: [{ uid: 140001, name: 'tourist' }, { uid: 2, name: 'b' }] }),
      );
      const res = await searchLuoguUser('tourist');
      expect(res).toEqual([
        { uid: 140001, name: 'tourist' },
        { uid: 2, name: 'b' },
      ]);
    });

    it('returns [] when no candidates', async () => {
      mockedAxios.get.mockResolvedValueOnce(okResp({}));
      const res = await searchLuoguUser('zzz');
      expect(res).toEqual([]);
    });

    it('handles C3VK 302 cookie handshake', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(redirectResp('C3VK=1'))
        .mockResolvedValueOnce(okResp({ users: [{ uid: 5, name: 'c' }] }));
      const res = await searchLuoguUser('c');
      expect(res[0]).toEqual({ uid: 5, name: 'c' });
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});
