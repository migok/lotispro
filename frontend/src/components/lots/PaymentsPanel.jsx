import { useEffect, useState } from 'react';
import { PAYMENT_TYPES } from '../../utils/constants';
import { formatDate, formatMad } from '../../utils/formatters';
import {
  acteThresholdMessage,
  getFinancialSummary,
  installmentLabel,
  INSTALLMENT_STATUS_LABELS,
  LEGACY_FINANCE_MESSAGE,
  listPayments,
} from '../../services/reservationFinanceService';
import RecordPaymentForm from './RecordPaymentForm';

const STATUS_BADGE = { pending: 'badge-gray', partial: 'badge-gold', paid: 'badge-green' };

const methodLabel = (method) => PAYMENT_TYPES.find((p) => p.value === method)?.label ?? method;

const isSummary = (data) => data != null && Array.isArray(data.installments);

/**
 * Montants et échéancier d'une réservation engagée (E4-T5), lus dans `financial-summary`
 * et `payments` : Prix total convenu, Total encaissé, Reste à payer ; échéances avec leur
 * statut calculé (À recevoir / Partiellement reçu / Reçu), l'écart sur sa propre ligne ;
 * encaissements enregistrés ; indicateur « Acte disponible » ou message de seuil.
 *
 * Réservation engagée avant E4-T5 (`summary.legacy`) : un avertissement remplace les montants,
 * l'échéancier est affiché sans montants (statuts tels qu'enregistrés) et sans action.
 *
 * `canRecord` : bouton « Enregistrer un encaissement » par échéance (désactivé une fois reçue).
 * `showActeStatus` (défaut true) : false quand l'hôte affiche déjà l'état de l'acte.
 * `onSummaryChange(summary)` : chaque résumé chargé ; `onSummaryError()` si le résumé ne peut
 * pas être chargé ; `onPaymentRecorded()` après un encaissement.
 */
export default function PaymentsPanel({
  reservationId,
  canRecord = false,
  showActeStatus = true,
  onSummaryChange,
  onSummaryError,
  onPaymentRecorded,
}) {
  const [data, setData] = useState(null); // null = chargement
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [formFor, setFormFor] = useState(null); // id de l'échéance en cours d'encaissement

  useEffect(() => {
    let cancelled = false;
    // null payments = the list could not be loaded (said so, never shown as empty)
    Promise.all([getFinancialSummary(reservationId), listPayments(reservationId).catch(() => null)])
      .then(([summary, payments]) => {
        if (cancelled) return;
        if (!isSummary(summary)) throw new Error('summary');
        setData({ summary, payments: Array.isArray(payments) ? payments : null });
        setFailed(false);
      })
      .catch(() => { if (!cancelled) { setData(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [reservationId, version]);

  const summary = data?.summary ?? null;
  useEffect(() => {
    if (summary) onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);
  useEffect(() => {
    if (failed) onSummaryError?.();
  }, [failed, onSummaryError]);

  if (failed) return <div className="ldm-documents-empty">Échéancier indisponible.</div>;
  if (!data) return <div className="ldm-documents-empty">Chargement de l'échéancier…</div>;

  const { payments } = data;
  const legacy = summary.legacy === true;
  const recordable = canRecord && !legacy;
  const installmentById = new Map(summary.installments.map((i) => [i.id, i]));
  const formInstallment = formFor != null ? installmentById.get(formFor) : null;
  const now = new Date();

  const handleSaved = () => {
    setFormFor(null);
    setVersion((v) => v + 1);
    onPaymentRecorded?.();
  };

  return (
    <div className="payments-panel">
      {legacy ? (
        <div className="alert alert-warning finance-legacy-notice" role="note">{LEGACY_FINANCE_MESSAGE}</div>
      ) : (
      <div role="group" aria-label="Montants" className="ldm-ri-rows" style={{ marginBottom: 10 }}>
        <div className="ldm-ri-row">
          <span className="ldm-ri-key">Prix total convenu</span>
          <span className="ldm-ri-val ldm-ri-val--bold">{formatMad(summary.agreed_total_price)}</span>
        </div>
        <div className="ldm-ri-row">
          <span className="ldm-ri-key">Total encaissé</span>
          <span className="ldm-ri-val">{formatMad(summary.total_received)}</span>
        </div>
        <div className="ldm-ri-row">
          <span className="ldm-ri-key" style={{ fontWeight: 600 }}>Reste à payer</span>
          <span className="ldm-ri-val ldm-ri-val--bold" style={{ color: 'var(--color-primary)' }}>{formatMad(summary.remaining)}</span>
        </div>
      </div>
      )}

      {showActeStatus && (
        summary.acte_available
          ? <div style={{ marginBottom: 10 }}><span className="badge badge-green">Acte disponible</span></div>
          : <div className="ldm-ri-key" style={{ color: 'var(--color-warning)', marginBottom: 10 }}>{acteThresholdMessage(summary)}</div>
      )}

      {summary.installments.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="pay-table" aria-label="Échéancier" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Échéance</th><th>Date</th>
                {!legacy && <><th>Montant</th><th>Reçu</th></>}
                <th>Statut</th>
                {recordable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {summary.installments.map((inst) => {
                const received = inst.status === 'paid';
                const overdue = !legacy && !received && new Date(inst.due_date) < now;
                return (
                  <tr key={inst.id} className={[
                    inst.payment_type === 'gap' ? 'pay-row--gap' : '',
                    received ? 'pay-row--paid' : '',
                    overdue ? 'pay-row--overdue' : '',
                  ].filter(Boolean).join(' ')}>
                    <td style={inst.payment_type === 'gap' ? { fontWeight: 600 } : undefined}>{installmentLabel(inst)}</td>
                    <td>{formatDate(inst.due_date)}</td>
                    {!legacy && <><td>{formatMad(inst.amount)}</td><td>{formatMad(inst.received)}</td></>}
                    <td>
                      <span className={`badge ${STATUS_BADGE[inst.status] ?? 'badge-gray'}`}>
                        {INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status}
                      </span>
                      {overdue && <span className="badge badge-red" style={{ marginLeft: 4 }}>En retard</span>}
                    </td>
                    {recordable && (
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm"
                          disabled={received || formFor != null}
                          title={received ? 'Échéance entièrement reçue' : undefined}
                          onClick={() => setFormFor(inst.id)}>
                          Enregistrer un encaissement
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {recordable && formInstallment && (
        <RecordPaymentForm
          key={formInstallment.id}
          reservationId={reservationId}
          installment={formInstallment}
          onSaved={handleSaved}
          onCancel={() => setFormFor(null)}
        />
      )}

      {payments === null && (
        <div className="ldm-documents-empty" style={{ marginTop: 12 }}>Impossible de charger les encaissements.</div>
      )}
      {payments?.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="pay-table" aria-label="Encaissements" style={{ width: '100%' }}>
            <thead>
              <tr><th>Date</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Échéance</th><th>Enregistré par</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const inst = p.installment_id != null ? installmentById.get(p.installment_id) : null;
                return (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_on)}</td>
                    <td>{formatMad(p.amount)}</td>
                    <td>{methodLabel(p.method)}</td>
                    <td>{p.reference || '—'}</td>
                    <td>{p.installment_id == null ? 'Premier acompte' : inst ? installmentLabel(inst) : '—'}</td>
                    <td>{p.recorded_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
