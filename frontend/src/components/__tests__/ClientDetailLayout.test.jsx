import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiGet, apiPut } from '../../utils/api';
import ClientDetailPage from '../ClientDetailPage';

vi.mock('../../utils/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiFetch: vi.fn(), buildApiError: vi.fn() }));
const CLIENT = {
  id: 7, name: 'Nora Benali', first_name: 'Nora', last_name: 'Benali', client_type: 'proprietaire',
  phone: '+212612345678', email: 'nora@example.ma', created_at: '2026-10-01', notification_channels: [], reservations_history: [],
  sales_history: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, lot_numero: i + 10, project_id: i < 4 ? 1 : 2, project_name: i < 4 ? 'Jardin blanc' : 'Les Orangers', price: 100000, sale_date: `2026-10-0${i + 1}` })),
};
function renderPage(route = '/app/clients/7') {
  return renderWithProviders(<Routes><Route path="/app/clients/:clientId" element={<ClientDetailPage />} /></Routes>, { user: { id: 1, role: 'manager' }, route });
}
beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiGet.mockImplementation(async (url) => url.endsWith('/details') ? CLIENT : []);
});

it('shows the profile information before its commercial history, without an invented active status', async () => {
  renderPage();
  await screen.findByRole('heading', { name: CLIENT.name });
  const identity = screen.getByRole('heading', { name: 'Identité' });
  const history = screen.getByRole('heading', { name: 'Historique commercial' });
  expect(identity.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('Client actif')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+212612345678');
});

it('preserves portfolio filters in its native back link', async () => {
  renderPage({ pathname: '/app/clients/7', state: { portfolioSearch: '?q=Nora&type=proprietaire&pipeline=buyer' } });
  const link = await screen.findByRole('link', { name: 'Retour aux clients' });
  expect(link).toHaveAttribute('href', '/app/clients?q=Nora&type=proprietaire&pipeline=buyer');
});

it('opens editing from the purchases section and returns focus on Escape', async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Achats (7)' }));
  const edit = screen.getByRole('button', { name: 'Modifier' });
  await userEvent.click(edit);
  const dialog = await screen.findByRole('dialog', { name: 'Modifier le client' });
  expect(within(dialog).getByLabelText(/Prénom/)).toHaveValue('Nora');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(edit).toHaveFocus();
  expect(apiPut).not.toHaveBeenCalled();
});

it('opens all seven history items instead of the five-item summary', async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Voir tout l’historique' }));
  const history = await screen.findByRole('dialog', { name: 'Historique commercial de Nora Benali' });
  expect(within(history).getAllByRole('listitem')).toHaveLength(7);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps the same financial totals and project filtering', async () => {
  renderPage();
  expect(await screen.findByRole('button', { name: 'Total des achats : 700 000 MAD' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Projet' }), '1');
  expect(screen.getByRole('button', { name: 'Total des achats : 400 000 MAD' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Achats (4)' })).toBeInTheDocument();
});
