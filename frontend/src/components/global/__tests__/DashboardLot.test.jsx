import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { apiGet } from '../../../utils/api';
import DashboardLot from '../DashboardLot';

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn() }));
vi.mock('../../LotDetailModal', () => ({ default: function ExistingLot({ lot, enabledOptionalStatuses, onClose, onRefresh }) {
  return <section aria-label="Fiche existante"><p>{lot.client_name} · {lot.reservation_id}</p><p>{enabledOptionalStatuses.join(', ')}</p><button onClick={onRefresh}>Actualiser la fiche</button><button onClick={onClose}>Fermer la fiche</button></section>;
} }));
beforeEach(() => { apiGet.mockReset(); });

it('opens the current reservation with its actual project workflow rather than an older active reservation', async () => {
  const close = vi.fn();
  apiGet.mockImplementation(async (url) => {
    if (url === '/api/lots/31') return { id: 31, numero: 'A31', project_id: 7, current_reservation_id: 20 };
    if (url === '/api/projects/7') return { enabled_optional_statuses: ['edl'] };
    return [
      { id: 31, reservation_id: 10, client_name: 'Ancien client' },
      { id: 31, reservation_id: 20, client_name: 'Client actuel' },
    ];
  });
  renderWithProviders(<DashboardLot lotId="31" onClose={close} onRefresh={() => {}} />);
  expect(await screen.findByText('Client actuel · 20')).toBeVisible();
  expect(screen.getByText('edl')).toBeVisible();
  expect(screen.queryByText(/Ancien client/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fermer la fiche' }));
  expect(close).toHaveBeenCalledOnce();
});

it('keeps failed lot loading in a retryable dialog instead of opening a partial workflow', async () => {
  apiGet.mockRejectedValue(new Error('offline'));
  renderWithProviders(<DashboardLot lotId="31" onClose={() => {}} onRefresh={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Fiche du lot indisponible');
  expect(screen.queryByRole('region', { name: 'Fiche existante' })).not.toBeInTheDocument();
  apiGet.mockImplementation(async (url) => url === '/api/lots/31' ? { id: 31, numero: 'A31', project_id: 7, current_reservation_id: 20 } : url === '/api/projects/7' ? { enabled_optional_statuses: [] } : [{ id: 31, reservation_id: 20, client_name: 'Client actuel' }]);
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('Client actuel · 20')).toBeVisible();
});
