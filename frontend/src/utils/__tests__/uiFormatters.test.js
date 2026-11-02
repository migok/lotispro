import { formatAmount, formatCompactPrice, formatDate, formatNumber } from '../formatters';

describe('shared display formatters', () => {
  it.each([
    [1250000, '1 250 000 MAD'], [1234.5, '1 234,50 MAD'], [0, '0 MAD'],
    [-1234.5, '-1 234,50 MAD'], [null, '—'], [undefined, '—'], ['', '—'], [NaN, '—'], [Infinity, '—'],
  ])('formats the exact amount %s as %s', (value, expected) => {
    expect(formatAmount(value)).toBe(expected);
  });

  it('promotes rounded compact amounts at a unit boundary', () => {
    expect(formatCompactPrice(999999)).toBe('1 M MAD');
    expect(formatCompactPrice(12500000)).toBe('12,5 M MAD');
    expect(formatCompactPrice(-999999)).toBe('-1 M MAD');
    expect(formatNumber(999999, 'MAD')).toBe('1 M MAD');
  });

  it('formats dates consistently, including invalid and date-only values', () => {
    expect(formatDate('2026-11-02', { dateStyle: 'short' })).toBe('02/11/2026');
    expect(formatDate('2026-11-02', { dateStyle: 'short', timeZone: 'America/Los_Angeles' })).toBe('02/11/2026');
    expect(formatDate('invalid')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2026-11-02T12:30:00Z', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' })).toBe('02/11/2026 12:30');
  });
});
