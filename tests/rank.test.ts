import { describe, it, expect } from 'vitest';
import { getRankColor, getRankLabel, getRatingColor, getRatingLabel } from '../src/renderer/src/utils/rank';

describe('getRankColor', () => {
  it('returns grey for newbie', () => {
    expect(getRankColor('newbie')).toBe('#9CA3AF');
  });

  it('returns green for pupil', () => {
    expect(getRankColor('pupil')).toBe('#4A7C3A');
  });

  it('returns blue for expert', () => {
    expect(getRankColor('expert')).toBe('#3B6FE0');
  });

  it('returns red for grandmaster', () => {
    expect(getRankColor('grandmaster')).toBe('#C41E3A');
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

describe('getRatingColor', () => {
  it('returns grey for rating < 1200', () => {
    expect(getRatingColor(1000)).toBe('#9CA3AF');
  });

  it('returns green for pupil range', () => {
    expect(getRatingColor(1300)).toBe('#4A7C3A');
  });

  it('returns blue for expert range', () => {
    expect(getRatingColor(1800)).toBe('#3B6FE0');
  });

  it('returns grey for undefined', () => {
    expect(getRatingColor(undefined)).toBe('#9CA3AF');
  });
});

describe('getRatingLabel', () => {
  it('returns Pupil for rating 1300', () => {
    expect(getRatingLabel(1300)).toBe('Pupil');
  });

  it('returns Unrated for undefined', () => {
    expect(getRatingLabel(undefined)).toBe('Unrated');
  });
});
