/**
 * Application-wide constants
 */

export const STATUS_LABELS = {
  available: 'Disponible',
  reserved: 'Réservé',
  validated: 'Validé',
  sold: 'Vendu',
  blocked: 'Bloqué',
};

export const STATUS_COLORS = {
  available: 'var(--color-available)',
  reserved: 'var(--color-warning)',
  sold: 'var(--color-danger)',
  blocked: 'var(--color-blocked)',
};

export const PIPELINE_LABELS = {
  buyer: 'Acheteur',
  active_reservation: 'Reservation active',
  past_reservation: 'Ancienne reservation',
  prospect: 'Prospect',
};

export const ACTION_LABELS = {
  create: 'Création',
  update: 'Modification',
  status_change: 'Changement de statut',
  reserve: 'Réservation',
  sell: 'Vente',
  release: 'Libération',
};

export const ACTION_ICONS = {
  create: '➕',
  update: '✏️',
  status_change: '🔄',
  reserve: '📋',
  sell: '✅',
  release: '🔓',
};

export const ENTITY_LABELS = {
  lot: 'Lot',
  client: 'Client',
  reservation: 'Réservation',
  sale: 'Vente',
};

export const CLIENT_TYPES = [
  { value: 'proprietaire', label: 'Propriétaire' },
  { value: 'revendeur', label: 'Revendeur' },
  { value: 'investisseur', label: 'Investisseur' },
  { value: 'autre', label: 'Autre' },
];
