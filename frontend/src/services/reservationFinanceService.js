import { apiGet, apiPostForm, apiPut } from '../utils/api';
import { formatMad } from '../utils/formatters';

/**
 * Montants, échéancier et encaissements d'une réservation engagée (E4-T5).
 * Un encaissement n'est jamais modifié ni supprimé ; le statut d'une échéance
 * est calculé par le backend à partir des encaissements qui lui sont affectés.
 */

/** Résumé financier : prix, total encaissé, reste à payer, échéancier avec statuts, seuil de l'acte. */
export const getFinancialSummary = (reservationId) =>
  apiGet(`/api/reservations/${reservationId}/financial-summary`);

/** Encaissements de la réservation (premier acompte inclus, `installment_id` null). */
export const listPayments = (reservationId) =>
  apiGet(`/api/reservations/${reservationId}/payments`);

/**
 * Enregistre un encaissement sur une échéance (multipart) ; le justificatif est facultatif.
 * Rejette avec le message de l'API (`message` ou `detail`) et ses `details` (422).
 */
export const recordPayment = (reservationId, { installmentId, amount, paidOn, method, reference, file }) => {
  const formData = new FormData();
  formData.append('installment_id', String(installmentId));
  formData.append('amount', String(amount));
  formData.append('paid_on', paidOn);
  formData.append('method', method);
  if (reference && reference.trim()) formData.append('reference', reference.trim());
  if (file) formData.append('file', file);
  return apiPostForm(`/api/reservations/${reservationId}/payments`, formData);
};

/** Réservation (notes, auteur…) : `GET /api/reservations/{id}`. */
export const getReservation = (reservationId) =>
  apiGet(`/api/reservations/${reservationId}`);

/**
 * Modifie une réservation engagée (remplacement complet) : `body` = { agreed_total_price,
 * sale_price, gap_due_timing, gap_due_date, notes, installments: [{ id, amount, due_date }],
 * reason, expected_updated_at }. Résout avec le résumé financier et `acte_status` ;
 * rejette avec `status` (409 si la réservation a changé entre-temps) et le message de l'API.
 */
export const updateEngagement = (reservationId, body) =>
  apiPut(`/api/reservations/${reservationId}/engagement`, body);

/** Historique des modifications (le plus récent d'abord), seulement les champs changés. */
export const listReservationChanges = (reservationId) =>
  apiGet(`/api/reservations/${reservationId}/changes`);

/** Statut calculé d'une échéance → libellé. */
export const INSTALLMENT_STATUS_LABELS = {
  pending: 'À recevoir',
  partial: 'Partiellement reçu',
  paid: 'Reçu',
};

/** « Acompte n », « Solde n » ou « Écart à régulariser ». */
export function installmentLabel(installment) {
  if (installment.payment_type === 'gap') return 'Écart à régulariser';
  const kind = installment.payment_type === 'deposit' ? 'Acompte' : 'Solde';
  return `${kind} ${installment.installment_number}`;
}

/**
 * Réservation engagée avant E4-T5 (`summary.legacy`, sans prix total convenu) : ses montants
 * ne sont pas connus dans le nouveau modèle, on l'explique au lieu d'afficher des montants faux.
 */
export const LEGACY_FINANCE_MESSAGE =
  'Réservation engagée avant la nouvelle gestion des montants : les montants ne peuvent pas être affichés ici.';

/** Message de l'acte d'une réservation engagée avant E4-T5 (aucun seuil applicable). */
export const LEGACY_ACTE_MESSAGE = 'Réservation engagée avant la nouvelle gestion des montants.';

/**
 * Message affiché tant que le seuil d'émission de l'acte n'est pas atteint (même texte que le
 * backend) ; sans les montants quand ils sont inconnus (réservation antérieure à E4-T5).
 */
export function acteThresholdMessage(summary) {
  // Legacy: no payment can ever be recorded, so the threshold can never be reached
  if (summary.legacy === true) return LEGACY_ACTE_MESSAGE;
  const pct = String(summary.acte_min_paid_pct).replace('.', ',');
  const text = `L'acte sera disponible quand ${pct} % du prix total convenu aura été encaissé`;
  if (summary.total_received == null || summary.acte_threshold_amount == null) return `${text}.`;
  return `${text} (${formatMad(summary.total_received)} sur ${formatMad(summary.acte_threshold_amount)}).`;
}
