import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import OptionsTrackingTab from '../OptionsTrackingTab';

afterEach(() => vi.restoreAllMocks());
it('uses the shared deadline wording and exposes the lot action to the keyboard', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T12:00:00Z'));
  const selected = vi.fn();
  renderWithProviders(<OptionsTrackingTab optionsTracking={[{ lot_id: 4, lot_numero: 'B4', lot_status: 'option', expiration_date: '2026-11-03T12:00:00Z', days_remaining: 1 }]} isManager={() => false} onSelectLot={selected} />);
  expect(screen.getByText('Sous 1 jour')).toBeVisible();
  const button = screen.getByRole('button', { name: 'Ouvrir le lot B4' });
  button.focus();
  await userEvent.keyboard('{Enter}');
  expect(selected).toHaveBeenCalledWith({ id: 4 });
});

it('uses the server expiration state consistently even when the browser date disagrees', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T12:00:00Z'));
  renderWithProviders(<OptionsTrackingTab optionsTracking={[
    { lot_id: 4, lot_numero: 'B4', lot_status: 'option', expiration_date: '2026-11-10T12:00:00Z', days_remaining: -2, is_expired: true },
    { lot_id: 5, lot_numero: 'B5', lot_status: 'option', expiration_date: '2026-11-04T12:00:00Z', days_remaining: 2, is_expired: false },
  ]} isManager={() => false} onSelectLot={() => {}} />);
  const expiredCounter = screen.getByText('Expirées').parentElement;
  expect(expiredCounter).toHaveTextContent('1Expirées');
  const expiredRow = screen.getByRole('button', { name: 'Ouvrir le lot B4' }).closest('tr');
  expect(expiredRow).toHaveClass('opt-row--expired');
  expect(within(expiredRow).getByText('Dépassé de 2 j')).toHaveAttribute('data-urgency', 'overdue');
  const activeRow = screen.getByRole('button', { name: 'Ouvrir le lot B5' }).closest('tr');
  expect(activeRow).not.toHaveClass('opt-row--expired');
  expect(within(activeRow).getByText('Sous 3 jours')).toHaveAttribute('data-urgency', 'soon');
});
