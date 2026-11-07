import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiGet } from '../../utils/api';
import ClientsPage from '../ClientsPage';

vi.mock('../../utils/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
const CLIENTS = [
  { id: 1, name: 'Amina Alaoui', cin: 'AB123456', phone: '+212612345678', email: 'amina@example.ma', client_type: 'proprietaire', pipeline_status: 'buyer', active_reservations: 1, total_sales: 2, total_deposit: 50000, total_purchases: 500000 },
  { id: 2, name: 'Brahim Benali', phone: '+33612345678', client_type: 'investisseur', pipeline_status: 'active_reservation', active_reservations: 2, total_sales: 0, total_deposit: 20000, total_purchases: 0 },
  { id: 3, name: 'Chadia Idrissi', phone: null, client_type: 'proprietaire', pipeline_status: 'prospect', active_reservations: 0, total_sales: 0, total_deposit: 0, total_purchases: 0 },
  { id: 4, name: 'Driss Amrani', client_type: 'autre', pipeline_status: 'past_reservation', active_reservations: 0, total_sales: 0, total_deposit: 0, total_purchases: 0 },
];
function Location() {
  const { pathname, search, state } = useLocation();
  return <output aria-label="URL">{pathname}{search}|{state?.portfolioSearch}</output>;
}
function renderPage({ data = CLIENTS, route = '/app/clients', role = 'manager' } = {}) {
  apiGet.mockResolvedValue(data);
  return renderWithProviders(<><ClientsPage /><Location /></>, { user: { id: 1, role }, route });
}
const table = () => screen.findByRole('table', { name: 'Portefeuille clients' });
const profileNames = (element) => within(element).getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/app/clients/')).map((link) => link.textContent);
beforeEach(() => { apiGet.mockReset(); });

it('renders one sortable portfolio table with native profile and phone links', async () => {
  const { container } = renderPage();
  const list = await table();
  expect(profileNames(list)).toEqual(CLIENTS.map((c) => c.name));
  expect(within(list).getByRole('link', { name: 'Amina Alaoui' })).toHaveAttribute('href', '/app/clients/1');
  expect(within(list).getByRole('link', { name: '+212612345678' })).toHaveAttribute('href', 'tel:+212612345678');
  expect(within(list).getByRole('button', { name: 'Réservations' })).toBeInTheDocument();
  expect(screen.queryByText('Meilleurs clients')).not.toBeInTheDocument();
  expect(container.querySelector('a button, a a')).toBeNull();
});

it('preserves the portfolio financial totals while filters change', async () => {
  renderPage();
  await table();
  expect(screen.getByRole('button', { name: 'Réservations actives : 3' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Acomptes versés : 70 000 MAD' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Total des achats : 500 000 MAD' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type de client' }), 'investisseur');
  expect(profileNames(await table())).toEqual(['Brahim Benali']);
  expect(screen.getByRole('button', { name: 'Total des achats : 500 000 MAD' })).toBeInTheDocument();
});

it.each([['Acheteurs', 'Amina Alaoui'], ['Réservations actives', 'Brahim Benali'], ['Prospects', 'Chadia Idrissi'], ['Lots libérés', 'Driss Amrani']])(
  'filters %s to the exact client count announced by the pipeline', async (label, name) => {
    renderPage();
    await table();
    const filter = screen.getByRole('button', { name: `${label} : 1 client` });
    await userEvent.click(filter);
    expect(profileNames(await table())).toEqual([name]);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(filter);
    expect(profileNames(await table())).toHaveLength(4);
  },
);

it('combines type, pipeline and the existing CIN search, with coherent pipeline counts', async () => {
  renderPage();
  await table();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type de client' }), 'proprietaire');
  expect(profileNames(await table())).toEqual(['Amina Alaoui', 'Chadia Idrissi']);
  expect(screen.getByRole('button', { name: 'Acheteurs : 1 client' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Prospects : 1 client' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Réservations actives : 0 client' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Acheteurs : 1 client' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un client' }), 'ab123456');
  expect(profileNames(await table())).toEqual(['Amina Alaoui']);
  expect(screen.getByLabelText('URL')).toHaveTextContent('type=proprietaire');
  expect(screen.getByLabelText('URL')).toHaveTextContent('pipeline=buyer');
  await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
  expect(profileNames(await table())).toHaveLength(4);
  expect(screen.getByRole('searchbox')).toHaveValue('');
});

it('applies URL filters and preserves their context when following a profile link', async () => {
  renderPage({ route: '/app/clients?type=proprietaire&pipeline=buyer' });
  const list = await table();
  expect(profileNames(list)).toEqual(['Amina Alaoui']);
  const link = within(list).getByRole('link', { name: 'Amina Alaoui' });
  link.focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByLabelText('URL')).toHaveTextContent('/app/clients/1|?type=proprietaire&pipeline=buyer');
});

it('sorts and paginates 16 clients, and resets pagination after filtering', async () => {
  const many = Array.from({ length: 16 }, (_, index) => ({ ...CLIENTS[0], id: index + 1, name: `Client ${String(index + 1).padStart(2, '0')}`, total_sales: index + 1 }));
  renderPage({ data: many });
  let list = await table();
  expect(profileNames(list)).toHaveLength(15);
  await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
  expect(profileNames(await table())).toEqual(['Client 16']);
  await userEvent.type(screen.getByRole('searchbox'), 'Client 01');
  expect(profileNames(await table())).toEqual(['Client 01']);
  expect(screen.getByText(/Page 1 sur 1/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
  list = await table();
  await userEvent.click(within(list).getByRole('button', { name: 'Achats' }));
  await userEvent.click(within(list).getByRole('button', { name: /^Achats/ }));
  expect(profileNames(await table())[0]).toBe('Client 16');
});

it('opens a client preview, shows exact amounts and returns focus after Escape', async () => {
  renderPage();
  await table();
  const trigger = screen.getByRole('button', { name: 'Aperçu de Amina Alaoui' });
  await userEvent.click(trigger);
  const preview = await screen.findByRole('dialog', { name: 'Amina Alaoui' });
  expect(within(preview).getByText('AB123456')).toBeInTheDocument();
  expect(within(preview).getByRole('link', { name: 'amina@example.ma' })).toHaveAttribute('href', 'mailto:amina@example.ma');
  expect(within(preview).getByRole('button', { name: '500 000 MAD' })).toBeInTheDocument();
  expect(within(preview).getByRole('link', { name: 'Ouvrir la fiche client' })).toHaveAttribute('href', '/app/clients/1');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('shows a retryable error instead of an empty portfolio or zero KPIs', async () => {
  apiGet.mockRejectedValueOnce(new Error('Network down')).mockResolvedValue(CLIENTS);
  renderWithProviders(<ClientsPage />, { user: { id: 1, role: 'manager' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les clients');
  expect(screen.queryByText('Aucun client enregistré')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Total des achats :/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(profileNames(await table())).toHaveLength(4);
});

it('rejects an invalid portfolio response instead of displaying a valid empty state', async () => {
  renderPage({ data: {} });
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les clients');
  expect(screen.queryByText('Aucun client enregistré')).not.toBeInTheDocument();
});

it('distinguishes an empty portfolio from filters returning no clients', async () => {
  renderPage({ data: [] });
  expect(await screen.findByRole('heading', { name: 'Aucun client enregistré' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter le premier client' }));
  expect(await screen.findByRole('dialog', { name: 'Créer un client' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('provides a reset action when a search has no results', async () => {
  renderPage();
  await table();
  await userEvent.type(screen.getByRole('searchbox'), 'inexistant');
  expect(screen.getByRole('heading', { name: 'Aucun client pour ces critères' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
  expect(profileNames(await table())).toHaveLength(4);
});

it('keeps the same API scope for an authenticated commercial', async () => {
  renderPage({ role: 'commercial' });
  expect(profileNames(await table())).toHaveLength(4);
  expect(apiGet).toHaveBeenCalledWith('/api/dashboard/clients-pipeline');
});
