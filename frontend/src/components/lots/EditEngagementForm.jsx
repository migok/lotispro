import { useId, useState } from 'react';
import { useToast } from '../../contexts/toastHooks';
import { formatDate, formatMad } from '../../utils/formatters';
import { engagementAmountsErrors, gapAmount, parseAmount } from '../../utils/engagePayload';
import {
  getFinancialSummary,
  getReservation,
  installmentLabel,
  INSTALLMENT_STATUS_LABELS,
  updateEngagement,
} from '../../services/reservationFinanceService';
import EngagementAmountsFields from './EngagementAmountsFields';

const STATUS_BADGE = { pending: 'badge-gray', partial: 'badge-gold', paid: 'badge-green' };
const GAP_TIMING_TEXT = { debut: 'Au début', fin: 'À la fin' };

const toCents = (value) => Math.round((parseAmount(value) ?? 0) * 100);
const isoDay = (value) => (value ? String(value).slice(0, 10) : '');

/** An installment whose amount and date can still change: not the gap, not fully received. */
const isEditable = (inst) => inst.payment_type !== 'gap' && inst.status !== 'paid';

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
    rows: Object.fromEntries(summary.installments.filter(isEditable).map((inst) => [
      inst.id, { amount: String(inst.amount), dueDate: isoDay(inst.due_date) },
    ])),
    reason: '',
  };
}

/**
 * « Modifier la réservation » d'une réservation engagée (spec E4-T5).
 *
 * Modifiables : prix total convenu, prix figurant sur l'acte, moment/date de l'écart, notes,
 * montant et date des échéances non encore reçues. En lecture seule : premier acompte reçu,
 * échéances reçues, échéance de l'écart (recalculée = convenu − acte, plafonnée au restant).
 * « Total des échéances » comparé en direct à l'attendu (convenu − premier acompte) ;
 * « Enregistrer » exige l'égalité au centime et un motif — le backend reste l'autorité.
 *
 * `summary` : `financial-summary` (son `updated_at` est renvoyé comme `expected_updated_at`) ;
 * `notes` : notes actuelles de la réservation. `onSaved(result)` après l'enregistrement
 * (résumé + `acte_status`) ; `onCancel` ferme sans aucun appel ; `onReloaded(summary)` après
 * « Recharger » (conflit 409), qui relit le résumé et les notes et réinitialise le formulaire.
 */
export default function EditEngagementForm({ reservationId, summary: initialSummary, notes: initialNotes, onSaved, onCancel, onReloaded }) {
  const id = useId();
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
    .reduce((sum, inst) => sum + (isEditable(inst) ? toCents(rows[inst.id]?.amount) : toCents(inst.amount)), 0);
  const balanced = totalCents === expectedCents;
  const canSave = balanced && reason.trim() !== '' && Object.keys(amountErrors).length === 0 && !saving && !reloading;

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
    e.preventDefault();
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
        installments: summary.installments.filter(isEditable).map((inst) => ({
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

  return (
    <form className="edit-engagement-form" onSubmit={handleSubmit} aria-label="Modifier la réservation">
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{error.message}</span>
          {error.conflict && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReload} disabled={reloading}>
              {reloading ? 'Rechargement...' : 'Recharger'}
            </button>
          )}
        </div>
      )}

      <EngagementAmountsFields
        cataloguePrice={summary.catalogue_price}
        value={amounts}
        onChange={(next) => setField('amounts', next)}
        firstPayment={firstPayment}
        firstPaymentHint="Non modifiable"
      />

      <div className="msr-field-group">
        <span className="msr-label">Échéancier</span>
        <div style={{ overflowX: 'auto' }}>
          <table className="pay-table" aria-label="Échéances" style={{ width: '100%' }}>
            <thead>
              <tr><th>Échéance</th><th>Date</th><th>Montant</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {scheduleRows.map((inst) => {
                const label = installmentLabel(inst);
                const isGap = inst.payment_type === 'gap';
                const editable = isEditable(inst);
                return (
                  <tr key={inst.id} className={isGap ? 'pay-row--gap' : undefined}>
                    <td style={isGap ? { fontWeight: 600 } : undefined}>{label}</td>
                    <td>
                      {editable ? (
                        <input type="date" className="msr-input" aria-label={`Date d'échéance (${label})`}
                          value={rows[inst.id].dueDate} onChange={(e) => setRow(inst.id, 'dueDate', e.target.value)} />
                      ) : isGap ? gapDateText : formatDate(inst.due_date)}
                    </td>
                    <td>
                      {editable ? (
                        <>
                          <input type="number" className="msr-price-input" min="0" step="0.01" aria-label={`Montant (${label})`}
                            value={rows[inst.id].amount} onChange={(e) => setRow(inst.id, 'amount', e.target.value)} />
                          {inst.received > 0 && (
                            <div className="msr-price-diff msr-price-diff--eq">{`déjà reçu ${formatMad(inst.received)}`}</div>
                          )}
                        </>
                      ) : formatMad(isGap ? gapCents / 100 : inst.amount)}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[inst.status] ?? 'badge-gray'}`}>
                        {INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div aria-live="polite" style={{ marginTop: 6, fontWeight: 600, color: balanced ? 'var(--text-secondary)' : 'var(--color-error)' }}>
          {`Total des échéances : ${formatMad(totalCents / 100)} / attendu ${formatMad(expectedCents / 100)}`}
        </div>
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} className="msr-input" rows={2}
          value={notes} onChange={(e) => setField('notes', e.target.value)} />
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-reason`}>Motif de la modification</label>
        <input id={`${id}-reason`} type="text" className="msr-input" required maxLength={500}
          placeholder="Pourquoi cette modification ?"
          value={reason} onChange={(e) => setField('reason', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!canSave}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
