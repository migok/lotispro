// @vitest-environment node
import { deadline } from '../deadlines';

it.each(['2026-11-05T00:30:00+01:00', '2026-11-05T23:30:00+01:00'])('keeps a date-only deadline active throughout the Moroccan business day at %s', (now) => {
  expect(deadline('2026-11-05', Date.parse(now))).toMatchObject({ level: 'critical', label: 'Sous 1 jour' });
});

it('expires the date-only deadline on the following business day', () => {
  expect(deadline('2026-11-05', Date.parse('2026-11-06T00:30:00+01:00'))).toMatchObject({ level: 'overdue', label: 'Dépassé de 1 j' });
});

it('preserves the exact instant of a timestamp that includes a timezone', () => {
  expect(deadline('2026-11-05T00:00:00Z', Date.parse('2026-11-05T23:30:00+01:00'))).toMatchObject({ level: 'overdue' });
});
