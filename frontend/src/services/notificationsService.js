import { apiGet, apiPost } from '../utils/api';

/** Envoie une notification au client pour une réservation : une ligne par canal. */
export const notifyReservation = (reservationId, { channels, kind }) =>
  apiPost(`/api/reservations/${reservationId}/notify`, { channels, kind });

/** Historique des notifications, filtré par client et/ou lot (au moins un). */
export const listNotifications = ({ clientId, lotId } = {}) => {
  const params = new URLSearchParams();
  if (clientId != null) params.set('client_id', clientId);
  if (lotId != null) params.set('lot_id', lotId);
  return apiGet(`/api/notifications?${params.toString()}`);
};
