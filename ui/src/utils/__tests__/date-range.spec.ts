import { describe, expect, it } from 'vitest';
import {
  dateRangeBounds,
  formatDateRange,
  parseDateRange,
  stringifyDateRange,
} from '../date-range';

describe('parseDateRange', () => {
  it('round-trips the URL form', () => {
    const range = parseDateRange('2026-11-01~2026-11-18');
    expect(range).toEqual({ start: '2026-11-01', end: '2026-11-18' });
    expect(stringifyDateRange(range)).toBe('2026-11-01~2026-11-18');
    expect(stringifyDateRange(undefined)).toBe('');
  });

  it('ignores malformed, impossible or reversed ranges', () => {
    for (const value of [
      '',
      '2026-11-01',
      '2026-11-01~',
      '2026-11-1~2026-11-18',
      '2026-02-30~2026-03-01',
      '2026-11-18~2026-11-01',
      '2026-11-01~2026-11-02~2026-11-03',
    ]) {
      expect(parseDateRange(value), value).toBeUndefined();
    }
  });
});

describe('dateRangeBounds', () => {
  it('covers whole local days, with an exclusive end on the following midnight', () => {
    expect(dateRangeBounds({ start: '2026-11-01', end: '2026-11-30' })).toEqual({
      createdAfter: new Date(2026, 10, 1).toISOString(),
      createdBefore: new Date(2026, 11, 1).toISOString(),
    });
  });
});

describe('formatDateRange', () => {
  it('shows a single day once', () => {
    expect(formatDateRange({ start: '2026-11-18', end: '2026-11-18' })).toBe('2026-11-18');
    expect(formatDateRange({ start: '2026-11-01', end: '2026-11-18' })).toBe(
      '2026-11-01 ~ 2026-11-18'
    );
  });
});
