import { useState } from 'react';
import { useToast } from '../../contexts/toastHooks';
import { formatDate } from '../../utils/formatters';
import { engagementAmountsErrors, gapAmount, parseAmount } from '../../utils/engagePayload';
import { getFinancialSummary, getReservation, updateEngagement } from '../../services/reservationFinanceService';

const GAP_TIMING_TEXT = { debut: 'Au début', fin: 'À la fin' };

const toCents = (value) => Math.round((parseAmount(value) ?? 0) * 100);
const isoDay = (value) => (value ? String(value).slice(0, 10) : '');

/** An installment whose amount and date can still change: not the gap, not fully received. */
export const isEditableInstallment = (inst) => inst.payment_type !== 'gap' && inst.status !== 'paid';

/** Message of an API error, followed by its field messages (422). */
function apiErrorText(err) {
  const fieldMessages = (err.details ?? []).map((d) => d.message).filter(Boolean);
  return [err.message, ...fieldMessages].filter(Boolean).join(' — ');
}

/** Form values from the financial summary and the reservation notes. */
function initialForm(summary, notes) {
  return {
    amounts: {
      agreedTotalPrice: String(summary.agreed_total_price ?? ''),
      salePrice: String(summary.acte_price ?? ''),
      gapDueTiming: summary.gap_due_timing ?? 'fin',
      gapDueDate: isoDay(summary.gap_due_date),
      firstPayment: '',
    },
    notes: notes ?? '',
    rows: Object.fromEntries(summary.installments.filter(isEditableInstallment).map((inst) => [
      inst.id, { amount: String(inst.amount), dueDate: isoDay(inst.due_date) },
    ])),
    reason: '',
  };
}

/**
 * État et logique de « Modifier la réservation » d'une réservation engagée (spec E4-T5),
 * partagés entre la colonne des montants et le panneau de l'échéancier.
 *
 * Modifiables : prix total convenu, prix figurant sur l'acte, moment/date de l'écart, notes,
 * montant et date des échéances non encore reçues. En lecture seule : premier acompte reçu,
 * échéances reçues, échéance de l'écart (recalculée = convenu − acte, plafonnée au restant).
 * « Total des échéances » comparé en direct à l'attendu (convenu − premier acompte) ;
 * `canSave` exige l'égalité au centime, un montant et une date sur chaque échéance modifiable
 * et un motif — le backend reste l'autorité.
 *
 * `summary` : `financial-summary` (son `updated_at` est renvoyé comme `expected_updated_at`) ;
 * `notes` : notes actuelles de la réservation. `onSaved(result)` après l'enregistrement
 * (résumé + `acte_status`) ; `onReloaded(summary)` après « Recharger » (conflit 409), qui relit
 * le résumé et les notes et réinitialise le formulaire.
 */
export default function useEngagementEdit({ reservationId, summary: initialSummary, notes: initialNotes, onSaved, onReloaded }) {
  const toast = useToast();
  const [summary, setSummary] = useState(initialSummary);
  const [form, setForm] = useState(() => initialForm(initialSummary, initialNotes));
  const [error, setError] = useState(null); // { message, conflict }
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  const { amounts, notes, rows, reason } = form;
  const firstPayment = summary.first_payment ?? 0;
  const amountErrors = engagementAmountsErrors(amounts, { firstPayment });

  // Gap installment as the backend recomputes it: the whole gap, capped to what is left to pay
  const expectedCents = Math.max(0, toCents(amounts.agreedTotalPrice) - toCents(firstPayment));
  const gapCents = Math.min(Math.round(gapAmount(amounts.agreedTotalPrice, amounts.salePrice) * 100), expectedCents);
  const totalCents = gapCents + summary.installments
    .filter((inst) => inst.payment_type !== 'gap')
    .reduce((sum, inst) => sum + (isEditableInstallment(inst) ? toCents(rows[inst.id]?.amount) : toCents(inst.amount)), 0);
  const balanced = totalCents === expectedCents;
  // Every editable installment needs an amount and a date (an empty amount would count as 0)
  const rowsComplete = summary.installments.filter(isEditableInstallment)
    .every((inst) => String(rows[inst.id]?.amount ?? '').trim() !== '' && Boolean(rows[inst.id]?.dueDate));
  const canSave = balanced && rowsComplete && reason.trim() !== '' && Object.keys(amountErrors).length === 0 && !saving && !reloading;

  const scheduleRows = summary.installments.some((inst) => inst.payment_type === 'gap') || gapCents === 0
    ? summary.installments
    : [...summary.installments, { id: 'new-gap', payment_type: 'gap', installment_number: 1, status: 'pending', received: 0 }];
  const gapDateText = amounts.gapDueTiming === 'date'
    ? (amounts.gapDueDate ? formatDate(amounts.gapDueDate) : '—')
    : GAP_TIMING_TEXT[amounts.gapDueTiming] ?? '—';

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setRow = (instId, field, value) =>
    setForm((f) => ({ ...f, rows: { ...f.rows, [instId]: { ...f.rows[instId], [field]: value } } }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const result = await updateEngagement(reservationId, {
        agreed_total_price: parseAmount(amounts.agreedTotalPrice),
        sale_price: parseAmount(amounts.salePrice),
        gap_due_timing: amounts.gapDueTiming,
        gap_due_date: amounts.gapDueTiming === 'date' ? amounts.gapDueDate || null : null,
        notes: notes.trim() || null,
        installments: summary.installments.filter(isEditableInstallment).map((inst) => ({
          id: inst.id, amount: parseAmount(rows[inst.id].amount), due_date: rows[inst.id].dueDate,
        })),
        reason: reason.trim(),
        expected_updated_at: summary.updated_at,
      });
      if (result?.acte_status === 'failed') {
        toast.warning("La réservation est enregistrée, mais l'acte n'a pas pu être régénéré.");
      } else {
        toast.success('Réservation modifiée');
        if (result?.acte_status === 'stored') toast.success("Nouvelle version de l'acte générée.");
      }
      onSaved(result);
    } catch (err) {
      setError({ message: apiErrorText(err) || 'Erreur lors de la modification de la réservation', conflict: err.status === 409 });
      setSaving(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      const [freshSummary, reservation] = await Promise.all([getFinancialSummary(reservationId), getReservation(reservationId)]);
      setSummary(freshSummary);
      setForm(initialForm(freshSummary, reservation?.notes));
      setError(null);
      onReloaded?.(freshSummary);
    } catch {
      setError({ message: 'Impossible de recharger la réservation.', conflict: true });
    } finally {
      setReloading(false);
    }
  };

  return {
    summary, amounts, notes, rows, reason, firstPayment,
    expectedCents, gapCents, totalCents, balanced, canSave, scheduleRows, gapDateText,
    error, saving, reloading,
    setField, setRow, handleSubmit, handleReload,
  };
}
