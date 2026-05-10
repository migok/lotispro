/**
 * Application-wide constants
 */

export const STATUS_LABELS = {
  creation: 'En création',
  available: 'Disponible',
  option: 'Option',
  reservation_a_finaliser: 'Résa. à finaliser',
  reservation_engagee: 'Résa. engagée',
  reservation_soldee: 'Résa. soldée',
  chez_notaire: 'Chez le notaire',
  chez_proprietaire: 'Chez le propriétaire',
  blocked: 'Bloqué',
};

export const STATUS_COLORS = {
  creation:               'var(--color-creation)',
  available:              'var(--color-available)',
  option:                 'var(--color-option)',
  reservation_a_finaliser:'var(--color-raf)',
  reservation_engagee:    'var(--color-engaged)',
  reservation_soldee:     'var(--color-soldee)',
  chez_notaire:           'var(--color-notaire)',
  chez_proprietaire:      'var(--color-proprietaire)',
  blocked:                'var(--color-blocked)',
};

// Hex values for map polygons (Leaflet doesn't read CSS vars)
export const STATUS_HEX_COLORS = {
  creation:               '#6b7280',
  available:              '#10b981',
  option:                 '#f59e0b',
  reservation_a_finaliser:'#ef6c00',
  reservation_engagee:    '#7c3aed',
  reservation_soldee:     '#2563eb',
  chez_notaire:           '#0891b2',
  chez_proprietaire:      '#16a34a',
  blocked:                '#e05555',
};

// Statuses that are part of an active sales workflow
export const ACTIVE_LOT_STATUSES = [
  'option',
  'reservation_a_finaliser',
  'reservation_engagee',
  'reservation_soldee',
  'chez_notaire',
  'chez_proprietaire',
];

// Payment types for reservation_a_finaliser
export const PAYMENT_TYPES = [
  { value: 'cash',     label: 'Espèces' },
  { value: 'card',     label: 'Carte bancaire' },
  { value: 'check',    label: 'Chèque' },
  { value: 'transfer', label: 'Virement' },
];

export const PIPELINE_LABELS = {
  buyer: 'Acheteur',
  active_reservation: 'Réservation active',
  past_reservation: 'Lot libéré',
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
