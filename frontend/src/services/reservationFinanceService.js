import { apiGet, apiPostForm } from '../utils/api';
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

/** Message affiché tant que le seuil d'émission de l'acte n'est pas atteint (même texte que le backend). */
export function acteThresholdMessage(summary) {
  const pct = String(summary.acte_min_paid_pct).replace('.', ',');
  return `L'acte sera disponible quand ${pct} % du prix total convenu aura été encaissé `
    + `(${formatMad(summary.total_received)} sur ${formatMad(summary.acte_threshold_amount)}).`;
}
