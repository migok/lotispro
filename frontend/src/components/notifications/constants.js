/** Canaux réellement disponibles (SMS / WhatsApp : en attente de l'epic E7). */
export const AVAILABLE_CHANNELS = ['email'];

export const NOTIFICATION_KIND_LABELS = {
  option_confirmee: 'Option confirmée',
  reservation_a_finaliser: 'Réservation à finaliser',
  reservation_engagee: 'Réservation engagée',
  rappel_expiration: "Rappel d'échéance",
};

export const NOTIFICATION_STATUS_LABELS = {
  sent: 'Envoyé',
  failed: 'Échec',
  not_configured: 'Non configuré',
};

export const NOTIFICATION_RECIPIENT_LABELS = {
  client: 'Client',
  commercial: 'Commercial',
};
