import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { apiGet } from '../../../utils/api';
import CommercialTrend from '../CommercialTrend';

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }));
const COUNTS = Object.fromEntries(['total', 'creation', 'available', 'option', 'reservation_a_finaliser', 'reservation_engagee', 'reservation_soldee', 'edl_programme', 'edl_realise', 'edl_finalise', 'chez_notaire', 'chez_proprietaire', 'blocked'].map((s) => [s, 0]));
const STATS = { counts: COUNTS, percentages: { available: 0 }, ca_realise: 0, ca_potentiel: 0, taux_vente: 0, flow_kpis_available: true, flow: { lots_vendus: 5, reservations_creees: 7 }, variations: { lots_vendus: 25, reservations_creees: null } };
const SERIES = [
  { key: '2026-11-01', lots_vendus: 2, reservations_creees: 3 },
  { key: '2026-11-02', lots_vendus: 3, reservations_creees: 4 },
];
beforeEach(() => {
  apiGet.mockReset().mockImplementation(async (url) => url.startsWith('/api/dashboard/stats') ? STATS : { series: SERIES });
});

it('renders the server period totals and each table bucket against an independent known fixture', async () => {
  renderWithProviders(<CommercialTrend />);
  expect(await screen.findByRole('button', { name: 'Lots vendus sur la période : 5' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Réservations créées : 7' })).toBeVisible();
  expect(screen.getByText('▲ 25 % · période précédente')).toBeVisible();
  await userEvent.click(screen.getByText('Voir les données du graphique'));
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row');
  expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['01/11', '2', '3']);
  expect(within(rows[2]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['02/11', '3', '4']);
});

it('hides unavailable historical sales while retaining reservation history', async () => {
  apiGet.mockImplementation(async (url) => url.startsWith('/api/dashboard/stats') ? { ...STATS, flow_kpis_available: false, history_start: '2026-10-30' } : { series: SERIES });
  renderWithProviders(<CommercialTrend />);
  expect(await screen.findByRole('button', { name: 'Lots vendus sur la période : —' })).toBeVisible();
  expect(screen.getByText(/disponibles à partir du 30\/10\/2026/)).toBeVisible();
  await userEvent.click(screen.getByText('Voir les données du graphique'));
  expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: 'Lots vendus' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Réservations créées : 7' })).toBeVisible();
});

it('does not display an old period when it finishes after a newer selection', async () => {
  let resolveOld;
  let first = true;
  apiGet.mockImplementation((url) => {
    if (!url.startsWith('/api/dashboard/stats')) return Promise.resolve({ series: [] });
    if (first) { first = false; return new Promise((resolve) => { resolveOld = resolve; }); }
    return Promise.resolve({ ...STATS, flow: { lots_vendus: 9, reservations_creees: 11 } });
  });
  renderWithProviders(<CommercialTrend />);
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  await userEvent.click(screen.getByRole('button', { name: 'Cette année' }));
  expect(await screen.findByRole('button', { name: 'Lots vendus sur la période : 9' })).toBeVisible();
  await act(async () => resolveOld(STATS));
  expect(screen.queryByRole('button', { name: 'Lots vendus sur la période : 5' })).not.toBeInTheDocument();
});
