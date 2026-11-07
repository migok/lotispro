import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiGet, apiDelete } from '../../utils/api';
import ClientsPage from '../ClientsPage';
import GlobalDashboard from '../GlobalDashboard';
import AssignCommercialsModal from '../AssignCommercialsModal';

vi.mock('../../utils/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn(), apiFetch: vi.fn() }));
const CLIENT = { id: 12, name: 'Zahra Alaoui', phone: '+212612345678', email: null, cin: null, client_type: 'proprietaire', pipeline_status: 'buyer', active_reservations: 1, total_sales: 2, total_deposit: 50000, total_purchases: 500000 };
const COMMERCIAL = { id: 4, name: 'Amine Alaoui', email: 'amine@example.ma', role: 'commercial' };
beforeEach(() => {
  apiGet.mockReset();
  apiDelete.mockReset();
  vi.stubGlobal('confirm', vi.fn(() => false));
});
afterEach(() => vi.unstubAllGlobals());

it('provides a client profile link without clickable generic rows', async () => {
  apiGet.mockResolvedValue([CLIENT]);
  const { container } = renderWithProviders(<ClientsPage />, { user: { id: 1, role: 'manager' } });
  const links = await screen.findAllByRole('link', { name: CLIENT.name });
  expect(links[0]).toHaveAttribute('href', '/app/clients/12');
  links[0].focus();
  expect(links[0]).toHaveFocus();
  expect(container.querySelector('a button, a a')).toBeNull();
  expect(links[0].closest('tr')).not.toHaveAttribute('onclick');
});

it('exposes one native profile link per client row', async () => {
  apiGet.mockResolvedValue([CLIENT]);
  function Location() { return <output aria-label="URL">{useLocation().pathname}</output>; }
  renderWithProviders(<><ClientsPage /><Location /></>, { user: { id: 1, role: 'manager' }, route: '/app/clients' });
  const links = await screen.findAllByRole('link', { name: CLIENT.name });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute('href', '/app/clients/12');
  links[0].focus();
  expect(links[0]).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByLabelText('URL')).toHaveTextContent('/app/clients/12');
});

it('announces loading clients with a skeleton', () => {
  apiGet.mockReturnValue(new Promise(() => {}));
  renderWithProviders(<ClientsPage />, { user: { id: 1, role: 'manager' } });
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
});

it('provides a real project link on the global dashboard', async () => {
  apiGet.mockImplementation(async (url) => {
    if (url === '/api/projects') return [{ id: 7, name: 'Jardin blanc', total_lots: 10, sold_lots: 2, reserved_lots: 1, created_at: '2026-10-01' }];
    if (url.startsWith('/api/dashboard/stats')) return { counts: { total: 10, creation: 0, available: 7, option: 3, reservation_a_finaliser: 0, reservation_engagee: 0, reservation_soldee: 0, edl_programme: 0, edl_realise: 0, edl_finalise: 0, chez_notaire: 0, chez_proprietaire: 0, blocked: 0 }, ca_realise: 200000, ca_potentiel: 100000 };
    return [];
  });
  const { container } = renderWithProviders(<GlobalDashboard />, { user: { id: 1, role: 'manager' } });
  expect(await screen.findByRole('link', { name: 'Jardin blanc' })).toHaveAttribute('href', '/app/projects/7');
  expect(container.querySelector('a button, a a')).toBeNull();
});

it('requires an accessible confirmation before unassigning a commercial', async () => {
  let assigned = [COMMERCIAL];
  apiGet.mockImplementation(async (url) => url.startsWith('/api/users') ? [COMMERCIAL] : assigned);
  apiDelete.mockImplementation(async () => { assigned = []; });
  renderWithProviders(<AssignCommercialsModal project={{ id: 7, name: 'Jardin blanc' }} onAssigned={() => {}} onClose={() => {}} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Retirer/ }));
  expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Retirer ce commercial du projet ?');
  expect(apiDelete).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(apiDelete).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Retirer/ }));
  await user.click(await screen.findByRole('button', { name: 'Retirer le commercial' }));
  await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/api/projects/7/users/4'));
  expect(globalThis.confirm).not.toHaveBeenCalled();
});
