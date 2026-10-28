import { useId, useState } from 'react';
import { useToast } from '../../contexts/toastHooks';
import { PAYMENT_TYPES } from '../../utils/constants';
import { formatDate, formatPrice } from '../../utils/formatters';
import { installmentLabel, recordPayment } from '../../services/reservationFinanceService';

const toCents = (value) => Math.round(Number(value) * 100);

/** Today as YYYY-MM-DD in local time (the backend refuses a future date). */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Message of an API error, followed by its field messages (422). */
function apiErrorText(err) {
  const fieldMessages = (err.details ?? []).map((d) => d.message).filter(Boolean);
  return [err.message, ...fieldMessages].filter(Boolean).join(' — ');
}

/**
 * « Enregistrer un encaissement » sur une échéance : montant prérempli avec le restant dû,
 * date, mode, référence et justificatif facultatifs. Un encaissement enregistré n'est
 * jamais modifié ni supprimé. `installment` vient de `financial-summary.installments`.
 * `onSaved(payment)` après l'enregistrement ; `onCancel` ferme sans rien envoyer.
 */
export default function RecordPaymentForm({ reservationId, installment, onSaved, onCancel }) {
  const id = useId();
  const toast = useToast();
  const [amount, setAmount] = useState(String(installment.remaining));
  const [paidOn, setPaidOn] = useState(todayIso);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const localError = () => {
    if (!(Number(amount) > 0)) return 'Le montant doit être supérieur à 0.';
    if (toCents(amount) > toCents(installment.remaining)) {
      return `Le montant dépasse le restant dû de cette échéance (${formatPrice(installment.remaining)}).`;
    }
    if (!paidOn) return "Indiquez la date d'encaissement.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const invalid = localError();
    if (invalid) { setError(invalid); return; }
    setError('');
    setSaving(true);
    try {
      const payment = await recordPayment(reservationId, {
        installmentId: installment.id, amount, paidOn, method, reference, file,
      });
      toast.success('Encaissement enregistré');
      onSaved(payment);
    } catch (err) {
      setError(apiErrorText(err) || "Erreur lors de l'enregistrement de l'encaissement");
      setSaving(false);
    }
  };

  return (
    <form className="record-payment-form" onSubmit={handleSubmit}
      style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Encaissement — {installmentLabel(installment)}
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: 6 }}>
          échéance du {formatDate(installment.due_date)}, restant dû {formatPrice(installment.remaining)}
        </span>
      </div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 8 }}>{error}</div>
      )}
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-amount`}>Montant</label>
        <div className="msr-price-input-wrap">
          <input id={`${id}-amount`} type="number" className="msr-price-input" min="0" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="msr-price-input-currency">MAD</span>
        </div>
      </div>
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-date`}>Date d'encaissement</label>
        <input id={`${id}-date`} type="date" className="msr-input" max={todayIso()}
          value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-method`}>Mode de paiement</label>
        <select id={`${id}-method`} className="msr-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-reference`}>Référence <span className="msr-optional">(facultatif)</span></label>
        <input id={`${id}-reference`} type="text" className="msr-input" maxLength={255}
          placeholder="N° de chèque, de virement…"
          value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-file`}>Justificatif <span className="msr-optional">(facultatif)</span></label>
        <input id={`${id}-file`} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Enregistrement...' : "Enregistrer l'encaissement"}
        </button>
      </div>
    </form>
  );
}
