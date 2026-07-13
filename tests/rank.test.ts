import { describe, it, expect } from 'vitest';
import { getRankColor, getRankLabel } from '../src/renderer/src/utils/rank';

describe('getRankColor', () => {
  it('returns grey for newbie', () => {
    expect(getRankColor('newbie')).toBe('#9CA3AF');
  });

  it('returns green for pupil', () => {
    expect(getRankColor('pupil')).toBe('#00FF00');
  });

  it('returns blue for expert', () => {
    expect(getRankColor('expert')).toBe('#0000FF');
  });

  it('returns red for grandmaster', () => {
    expect(getRankColor('grandmaster')).toBe('#FF0000');
  });

  it('returns grey for unknown rank', () => {
    expect(getRankColor('unknown')).toBe('#9CA3AF');
  });

  it('returns grey for undefined', () => {
    expect(getRankColor(undefined)).toBe('#9CA3AF');
  });
});

describe('getRankLabel', () => {
  it('returns capitalized label', () => {
    expect(getRankLabel('legendary grandmaster')).toBe('Legendary Grandmaster');
  });

  it('returns Unrated for undefined', () => {
    expect(getRankLabel(undefined)).toBe('Unrated');
  });
});
