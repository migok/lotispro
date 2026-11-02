import { act, renderHook, waitFor } from '@testing-library/react';
import { apiGet } from '../../../utils/api';
import useDashboardResource, { listResponse, statsResponse } from '../useDashboardResource';
import { deadline, treatmentRows } from '../../../utils/deadlines';

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }));
beforeEach(() => { apiGet.mockReset(); });

it('ignores an older scope arriving after the current one', async () => {
  let resolveOld;
  apiGet.mockImplementation((url) => url === '/old' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(['current']));
  const { result, rerender } = renderHook(({ url }) => useDashboardResource(url, listResponse), { initialProps: { url: '/old' } });
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  rerender({ url: '/current' });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.data).toEqual(['current']));
  await act(async () => resolveOld(['obsolete']));
  expect(result.current.data).toEqual(['current']);
});

it('invalidates a pending attempt when retrying the same URL', async () => {
  let resolveOld;
  apiGet.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(['retried']);
  const { result } = renderHook(() => useDashboardResource('/same', listResponse));
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.data).toEqual(['retried']));
  await act(async () => resolveOld(['obsolete']));
  expect(result.current.data).toEqual(['retried']);
});

it.each([null, [], { ca_realise: 0 }, { counts: {}, ca_realise: '0' }, { counts: {}, ca_realise: 0 }])('rejects malformed statistics instead of fabricating zeros: %j', async (payload) => {
  apiGet.mockResolvedValue(payload);
  const { result } = renderHook(() => useDashboardResource('/stats', statsResponse));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.data).toBeNull();
});

const NOW = Date.parse('2026-11-02T12:00:00Z');
it.each([
  ['2026-11-02T11:59:59Z', 'overdue', 'Dépassé de 1 j'],
  ['2026-11-02T12:00:00Z', 'critical', 'Sous 1 jour'],
  ['2026-11-03T12:00:00Z', 'critical', 'Sous 1 jour'],
  ['2026-11-03T12:00:01Z', 'soon', 'Sous 3 jours'],
  ['2026-11-05T12:00:00Z', 'soon', 'Sous 3 jours'],
  ['2026-11-05T12:00:01Z', 'later', 'Dans 4 j'],
  [null, 'undated', 'Sans échéance'], ['bad-date', 'undated', 'Sans échéance'],
])('uses the same urgency at %s', (date, level, label) => {
  expect(deadline(date, NOW)).toMatchObject({ level, label });
});

it('keeps the oldest overdue first, enriches duplicate expirations and retains undated notary dossiers', () => {
  const rows = treatmentRows({
    alerts: [{ lot_id: 8, expiration_date: '2026-11-01T12:00:00Z' }],
    options: [{ lot_id: 8, expiration_date: '2026-11-01T12:00:00Z', project_name: 'Atlas' }],
    payments: [{ lot_id: 8, installment_id: 9, due_date: '2026-10-01T12:00:00Z' }],
    notaires: [{ lot_id: 10 }],
  }, NOW);
  expect(rows).toHaveLength(3);
  expect(rows[0].id).toBe('payment:9');
  expect(rows[1].project_name).toBe('Atlas');
  expect(rows[2].urgency.label).toBe('Sans échéance');
});
