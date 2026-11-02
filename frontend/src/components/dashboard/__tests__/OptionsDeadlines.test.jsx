import { screen } from '@testing-library/react';
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
