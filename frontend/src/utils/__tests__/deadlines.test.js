// @vitest-environment node
import { deadline } from '../deadlines';

// June 2026 is UTC+1 in both old and current IANA releases. November changed in
// tzdata 2026c, so a hard-coded +01 in November describes different local days.
it.each(['2026-06-15T00:30:00+01:00', '2026-06-15T23:30:00+01:00'])('keeps a date-only deadline active throughout the Moroccan business day at %s', (now) => {
  expect(deadline('2026-06-15', Date.parse(now))).toMatchObject({ level: 'critical', label: 'Sous 1 jour' });
});

it('expires the date-only deadline on the following business day', () => {
  expect(deadline('2026-06-15', Date.parse('2026-06-16T00:30:00+01:00'))).toMatchObject({ level: 'overdue', label: 'Dépassé de 1 j' });
});

it('preserves the exact instant of a timestamp that includes a timezone', () => {
  expect(deadline('2026-06-15T00:00:00Z', Date.parse('2026-06-15T23:30:00+01:00'))).toMatchObject({ level: 'overdue' });
});

it.each(['2026-03-05T00:30:00Z', '2026-03-05T23:30:00Z'])('also includes the whole business day when Morocco is UTC+0 at %s', (now) => {
  expect(deadline('2026-03-05', Date.parse(now))).toMatchObject({ level: 'critical' });
});

it('expires on the next business day while Morocco is UTC+0', () => {
  expect(deadline('2026-03-05', Date.parse('2026-03-06T00:30:00Z'))).toMatchObject({ level: 'overdue', label: 'Dépassé de 1 j' });
});
