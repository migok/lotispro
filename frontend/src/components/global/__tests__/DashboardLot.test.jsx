import { act, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { apiGet, apiFetch } from '../../../utils/api';
import DashboardLot from '../DashboardLot';

vi.mock('../../../utils/api', () => ({ apiGet: vi.fn(), apiFetch: vi.fn() }));
vi.mock('../../LotDetailModal', () => ({ default: function ExistingLot({ lot, enabledOptionalStatuses, onClose, onRefresh }) {
  const [draft, setDraft] = useState('Étape en cours');
  return <section aria-label="Fiche existante"><p>{lot.client_name} · {lot.reservation_id}</p><p>{lot.status}</p><p>{enabledOptionalStatuses.join(', ')}</p><p>{draft}</p><button onClick={() => { setDraft('Notifier le client'); onRefresh(); }}>Terminer une étape</button><button onClick={onRefresh}>Actualiser la fiche</button><button onClick={onClose}>Fermer la fiche</button></section>;
} }));
const geojson = (status = 'option', reservationId = 20) => ({ features: [{ type: 'Feature', properties: { db_id: 31, lot_id: 'A31', status, reservation_id: reservationId, client_name: 'Client actuel' } }] });
beforeEach(() => {
  apiGet.mockReset();
  apiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => geojson() });
});

it.each(['reservation_soldee', 'edl_programme', 'edl_realise', 'edl_finalise', 'chez_notaire', 'chez_proprietaire', 'available'])('opens %s from the same GeoJSON source as the project Lots tab', async (status) => {
  const reservationId = status === 'available' ? null : 20;
  apiGet.mockImplementation(async (url) => url === '/api/lots/31'
    ? { id: 31, numero: 'A31', project_id: 7, status, current_reservation_id: reservationId }
    : url === '/api/projects/7' ? { enabled_optional_statuses: ['edl'] }
    : [{ id: 31, status }]); // Converted reservations are absent from the legacy dashboard join.
  apiFetch.mockResolvedValue({ ok: true, json: async () => geojson(status, reservationId) });
  renderWithProviders(<DashboardLot lotId="31" onClose={() => {}} onRefresh={() => {}} />);
  expect(await screen.findByRole('region', { name: 'Fiche existante' })).toHaveTextContent(status);
  expect(screen.queryByText('Fiche du lot indisponible')).not.toBeInTheDocument();
});

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

it('preserves the mounted form and notification state while refreshing its props', async () => {
  apiGet.mockImplementation(async (url) => url === '/api/lots/31' ? { id: 31, project_id: 7 } : { enabled_optional_statuses: [] });
  renderWithProviders(<DashboardLot lotId="31" onClose={() => {}} onRefresh={() => {}} />);
  const form = await screen.findByRole('region', { name: 'Fiche existante' });
  let finish;
  apiFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await userEvent.click(screen.getByRole('button', { name: 'Terminer une étape' }));
  expect(form).toBeInTheDocument();
  expect(screen.getByText('Notifier le client')).toBeVisible();
  await act(async () => finish({ ok: true, json: async () => geojson('reservation_soldee') }));
  expect(await screen.findByText('reservation_soldee')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Fiche existante' })).toBe(form);
  expect(screen.getByText('Notifier le client')).toBeVisible();
});
