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
  edl_programme: 'EDL programmé',
  edl_realise: 'EDL réalisé',
  edl_finalise: 'EDL finalisé',
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
  edl_programme:          'var(--color-edl-programme)',
  edl_realise:            'var(--color-edl-realise)',
  edl_finalise:           'var(--color-edl-finalise)',
  chez_notaire:           'var(--color-notaire)',
  chez_proprietaire:      'var(--color-proprietaire)',
  blocked:                'var(--color-blocked)',
};

// Hex values for map polygons (Leaflet doesn't read CSS vars)
export const STATUS_HEX_COLORS = {
  creation:               '#bac4d5',
  available:              '#66d6a5',
  option:                 '#d6bbff',
  reservation_a_finaliser:'#c7a5ff',
  reservation_engagee:    '#b6ceff',
  reservation_soldee:     '#96baff',
  edl_programme:          '#a5e4e0',
  edl_realise:            '#79d6d0',
  edl_finalise:           '#69c9c2',
  chez_notaire:           '#f4b4d0',
  chez_proprietaire:      '#66d6a5',
  blocked:                '#ff9299',
};

// Statuses that are part of an active sales workflow
export const ACTIVE_LOT_STATUSES = [
  'option',
  'reservation_a_finaliser',
  'reservation_engagee',
  'reservation_soldee',
  'edl_programme',
  'edl_realise',
  'edl_finalise',
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

// Presentation groups only: workflow transitions and permissions are unchanged.
export const STATUS_PHASES = {
  commercial: ['option', 'reservation_a_finaliser'],
  financier: ['reservation_engagee', 'reservation_soldee'],
  edl: ['edl_programme', 'edl_realise', 'edl_finalise'],
  notaire: ['chez_notaire'],
  livre: ['chez_proprietaire'],
};
