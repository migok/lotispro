import { act, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../contexts/authHooks';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiGet } from '../../utils/api';
import GlobalDashboard from '../GlobalDashboard';

vi.mock('../../utils/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiFetch: vi.fn() }));
const USER = { id: 1, role: 'manager', name: 'Nadia' };
const COUNTS = { total: 10, creation: 1, available: 2, option: 1, reservation_a_finaliser: 1, reservation_engagee: 1, reservation_soldee: 0, edl_programme: 0, edl_realise: 0, edl_finalise: 0, chez_notaire: 1, chez_proprietaire: 2, blocked: 1 };
const STATS = { counts: COUNTS, percentages: { available: 20 }, ca_realise: 200000, ca_potentiel: 100000, taux_vente: 20 };
const PROJECT = { id: 7, name: 'Jardin blanc', total_lots: 10, sold_lots: 2, reserved_lots: 1 };
const OPTION = { lot_id: 31, lot_numero: 'A31', project_id: 7, project_name: 'Jardin blanc', client_name: 'Zahra', lot_status: 'option', reservation_id: 44, expiration_date: '2026-01-01T00:00:00Z' };
function respond(url) {
  if (url === '/api/projects') return [PROJECT];
  if (url.startsWith('/api/projects/7/kpis')) return { available_lots: 2, taux_vente: 20, ca_realise: 200000 };
  if (url.startsWith('/api/dashboard/stats')) return STATS;
  if (url.startsWith('/api/dashboard/alerts')) return { reservations: [] };
  if (url.startsWith('/api/dashboard/performance')) return { series: [], period: { date_from: '2026-11-01', date_to: '2026-11-30' } };
  return [];
}
beforeEach(() => { apiGet.mockReset().mockImplementation(async (url) => respond(url)); });

it('keeps projects visible when statistics fail and retries that block without false zeroes', async () => {
  let failed = true;
  apiGet.mockImplementation(async (url) => {
    if (failed && url.startsWith('/api/dashboard/stats')) throw new Error('offline');
    return respond(url);
  });
  renderWithProviders(<GlobalDashboard />, { user: USER });
  expect(await screen.findByRole('link', { name: PROJECT.name })).toBeVisible();
  const kpis = screen.getByRole('region', { name: 'Indicateurs actuels' });
  expect(await within(kpis).findByRole('alert')).toHaveTextContent('Indicateurs indisponibles');
  expect(within(kpis).getByRole('button', { name: 'CA réalisé : —' })).toBeVisible();
  failed = false;
  await userEvent.click(within(kpis).getByRole('button', { name: 'Réessayer' }));
  expect(await within(kpis).findByRole('button', { name: 'CA réalisé : 200 000 MAD' })).toBeVisible();
});

it('deduplicates expirations while keeping separate overdue installments and their exact total', async () => {
  apiGet.mockImplementation(async (url) => {
    if (url.includes('/options-tracking')) return [OPTION];
    if (url.includes('/alerts')) return { reservations: [OPTION] };
    if (url.includes('/late-payments')) return [1, 2].map((id) => ({ ...OPTION, installment_id: id, amount: id === 1 ? 1250 : 2750, due_date: '2026-01-02' }));
    return respond(url);
  });
  renderWithProviders(<GlobalDashboard />, { user: USER });
  const panel = await screen.findByRole('region', { name: 'À traiter' });
  expect(await within(panel).findByText('3 dossiers')).toBeVisible();
  expect(within(panel).getAllByRole('link', { name: /Ouvrir le lot A31/ })).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Retards de paiement : 2' })).toBeVisible();
  expect(screen.getByText('4 000 MAD en retard')).toBeVisible();
});

it('reports incomplete alerts instead of an all-clear state and exposes later rows', async () => {
  apiGet.mockImplementation(async (url) => {
    if (url.includes('/alerts')) throw new Error('offline');
    if (url.includes('/options-tracking')) return Array.from({ length: 8 }, (_, i) => ({ ...OPTION, lot_id: i + 1, lot_numero: `B${i}` }));
    return respond(url);
  });
  renderWithProviders(<GlobalDashboard />, { user: USER });
  const panel = await screen.findByRole('region', { name: 'À traiter' });
  expect(await within(panel).findByText('Liste incomplète')).toBeVisible();
  expect(within(panel).queryByText('Aucun dossier à traiter')).not.toBeInTheDocument();
  await userEvent.click(within(panel).getByRole('button', { name: 'Voir tout (8)' }));
  expect(within(panel).getAllByRole('link', { name: /Ouvrir le lot/ })).toHaveLength(8);
});

it('opens the creation form from the primary header action', async () => {
  renderWithProviders(<GlobalDashboard />, { user: USER });
  await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet' }));
  expect(await screen.findByRole('dialog', { name: 'Créer un nouveau projet' })).toBeVisible();
});

it('uses server project availability rather than subtracting legacy counts', async () => {
  renderWithProviders(<GlobalDashboard />, { user: USER });
  const projects = screen.getByRole('region', { name: 'Projets' });
  expect(await within(projects).findByText('2 disponibles')).toBeVisible();
  expect(within(projects).queryByText('7 disponibles')).not.toBeInTheDocument();
});

it('ignores a statistics response from an earlier user scope', async () => {
  let resolveOld;
  apiGet.mockImplementation((url) => url === '/api/dashboard/stats' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(respond(url)));
  const { rerender } = renderWithProviders(<GlobalDashboard />, { user: USER });
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  // Unmounting also invalidates outstanding requests (StrictMode and route navigation).
  rerender(<div>Autre page</div>);
  await act(async () => resolveOld(STATS));
  expect(screen.queryByText('200 000 MAD')).not.toBeInTheDocument();
});

it('shows real zero values only after valid responses, with a genuine empty state', async () => {
  apiGet.mockImplementation(async (url) => url === '/api/dashboard/stats' ? { ...STATS, ca_realise: 0 } : respond(url));
  renderWithProviders(<GlobalDashboard />, { user: USER });
  expect(await screen.findByRole('button', { name: 'CA réalisé : 0 MAD' })).toBeVisible();
  expect(await screen.findByText('Aucun dossier à traiter')).toBeVisible();
});

it('does not announce an all-clear while a source is still loading', async () => {
  apiGet.mockImplementation((url) => url.endsWith('/notaire-alerts') ? new Promise(() => {}) : Promise.resolve(respond(url)));
  renderWithProviders(<GlobalDashboard />, { user: USER });
  expect(await screen.findByRole('link', { name: PROJECT.name })).toBeVisible();
  expect(screen.queryByText('Aucun dossier à traiter')).not.toBeInTheDocument();
  expect(screen.getByText('Chargement des dossiers à traiter').closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
});

it('opens a stock segment as an accessible filtered list using actual lot IDs', async () => {
  apiGet.mockImplementation(async (url) => url.startsWith('/api/dashboard/lots') ? [
    { id: 90, numero: 'X90', project_id: 7, status: 'blocked' },
    { id: 91, numero: 'X91', project_id: 7, status: 'available' },
  ] : respond(url));
  renderWithProviders(<GlobalDashboard />, { user: USER });
  await userEvent.click(await screen.findByRole('button', { name: 'Bloqué : 1, afficher les lots' }));
  const sheet = await screen.findByRole('dialog', { name: 'Lots : Bloqué' });
  expect(await within(sheet).findByRole('link', { name: 'Lot X90' })).toHaveAttribute('href', '/app/dashboard?lot=90');
  expect(within(sheet).queryByText('Lot X91')).not.toBeInTheDocument();
});

it('clears account-scoped resources even when their endpoint URL is unchanged', async () => {
  let first = true;
  apiGet.mockImplementation(async (url) => url === '/api/projects' ? [{ ...PROJECT, name: first ? 'Compte précédent' : 'Compte actuel' }] : respond(url));
  const view = (id) => <MemoryRouter><AuthContext.Provider value={{ user: { id, role: 'commercial' } }}><GlobalDashboard /></AuthContext.Provider></MemoryRouter>;
  const { rerender } = render(view(1));
  expect(await screen.findByRole('link', { name: 'Compte précédent' })).toBeVisible();
  first = false;
  rerender(view(2));
  expect(screen.queryByRole('link', { name: 'Compte précédent' })).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Compte actuel' })).toBeVisible();
});
