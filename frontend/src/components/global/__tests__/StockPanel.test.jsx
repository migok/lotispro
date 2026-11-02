import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { apiGet } from '../../../utils/api';
import StockPanel from '../StockPanel';

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }));
const ALL = [
  { id: 1, numero: 'A1', status: 'available' }, { id: 2, numero: 'A2', status: 'available' },
  { id: 3, numero: 'A3', status: 'available' }, { id: 4, numero: 'B4', status: 'blocked' },
  { id: 5, numero: 'C5', status: 'creation' }, { id: 6, numero: 'O6', status: 'option' },
  { id: 7, numero: 'O7', status: 'option' },
].map((r) => ({ ...r, project_id: 1 }));
const STATS = { loading: false, error: null, retry: vi.fn(), data: { counts: { total: 7, available: 3, blocked: 1, creation: 1, option: 2 }, lots_liberes: 0 } };
beforeEach(() => { apiGet.mockReset().mockImplementation(async (url) => url.includes('user_id=4') ? [ALL[5]] : ALL); });

it.each([['Disponible', 3], ['Bloqué', 1], ['En création', 1], ['Option', 1]])('opens the same %s rows as the displayed commercial count', async (label, count) => {
  renderWithProviders(<StockPanel stats={STATS} userId={4} projects={[{ id: 1, name: 'Atlas' }]} />);
  const button = await screen.findByRole('button', { name: `${label} : ${count}, afficher les lots` });
  await userEvent.click(button);
  const sheet = await screen.findByRole('dialog', { name: `Lots : ${label}` });
  const links = await within(sheet).findAllByRole('link', { name: /Lot / });
  expect(links).toHaveLength(count);
  expect(within(sheet).queryByText('Lot O7')).not.toBeInTheDocument();
});

it('counts unique lots when the legacy dashboard join returns duplicate rows', async () => {
  apiGet.mockResolvedValue([...ALL, ALL[0]]);
  renderWithProviders(<StockPanel stats={STATS} projects={[]} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Disponible : 3, afficher les lots' }));
  const sheet = await screen.findByRole('dialog');
  expect(await within(sheet).findAllByRole('link', { name: /Lot A/ })).toHaveLength(3);
});
