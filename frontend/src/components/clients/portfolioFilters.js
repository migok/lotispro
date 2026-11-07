import { matchesClientSearch } from '../../utils/clientProfile';

export const PIPELINE_FILTERS = [
  { key: 'buyer', label: 'Acheteurs' },
  { key: 'active_reservation', label: 'Réservations actives' },
  { key: 'prospect', label: 'Prospects' },
  { key: 'past_reservation', label: 'Lots libérés' },
];

/** Search + type filtering (the base for pipeline counts). */
export function filterBySearchAndType(clients, { q = '', type = '' } = {}) {
  return clients.filter((client) => (!type || client.client_type === type) && matchesClientSearch(client, q));
}

export function countByPipeline(clients) {
  const counts = Object.fromEntries(PIPELINE_FILTERS.map(({ key }) => [key, 0]));
  clients.forEach((client) => { if (client.pipeline_status in counts) counts[client.pipeline_status] += 1; });
  return counts;
}

export function filterByPipeline(clients, pipeline = '') {
  return pipeline ? clients.filter((client) => client.pipeline_status === pipeline) : clients;
}

export function portfolioTotals(clients) {
  const sum = (field) => clients.reduce((total, client) => total + (Number(client[field]) || 0), 0);
  return { reservations: sum('active_reservations'), deposits: sum('total_deposit'), purchases: sum('total_purchases') };
}
