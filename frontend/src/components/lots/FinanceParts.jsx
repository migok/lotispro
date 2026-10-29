import { PAYMENT_TYPES } from '../../utils/constants';
import { formatDate, formatMad } from '../../utils/formatters';
import {
  acteThresholdMessage,
  installmentLabel,
  INSTALLMENT_STATUS_LABELS,
  LEGACY_FINANCE_MESSAGE,
} from '../../services/reservationFinanceService';

/*
 * Pièces d'affichage des montants d'une réservation engagée (E4-T5), partagées par
 * `PaymentsPanel` (fiche lot, fiche client) et `ReservationFinanceView` (grande fenêtre).
 */

const STATUS_BADGE = { pending: 'badge-gray', partial: 'badge-gold', paid: 'badge-green' };
const GAP_TIMING_TEXT = { debut: 'au début', fin: 'à la fin' };

const methodLabel = (method) => PAYMENT_TYPES.find((p) => p.value === method)?.label ?? method;

/** Avertissement d'une réservation engagée avant E4-T5 : ses montants ne sont pas affichés. */
export function LegacyFinanceNotice() {
  return <div className="alert alert-warning finance-legacy-notice" role="note">{LEGACY_FINANCE_MESSAGE}</div>;
}

function AmountRow({ label, children, strong = false, highlight = false }) {
  return (
    <div className="ldm-ri-row">
      <span className={`ldm-ri-key${highlight ? ' finance-key--strong' : ''}`}>{label}</span>
      <span className={`ldm-ri-val${strong || highlight ? ' ldm-ri-val--bold' : ''}${highlight ? ' finance-val--due' : ''}`}>{children}</span>
    </div>
  );
}

/** Prix total convenu, Total encaissé, Reste à payer (groupe « Montants »). */
export function FinanceTotals({ summary }) {
  return (
    <div role="group" aria-label="Montants" className="ldm-ri-rows finance-totals">
      <AmountRow label="Prix total convenu" strong>{formatMad(summary.agreed_total_price)}</AmountRow>
      <AmountRow label="Total encaissé">{formatMad(summary.total_received)}</AmountRow>
      <AmountRow label="Reste à payer" highlight>{formatMad(summary.remaining)}</AmountRow>
    </div>
  );
}

/** Échéance de l'écart : « à la fin », « au début » ou « le jj/mm/aaaa ». */
function gapDueText(summary) {
  if (summary.gap_due_timing === 'date') return summary.gap_due_date ? `le ${formatDate(summary.gap_due_date)}` : '';
  return GAP_TIMING_TEXT[summary.gap_due_timing] ?? '';
}

/** Tous les montants de la réservation (grande fenêtre), groupe « Montants ». */
export function FinanceAmounts({ summary }) {
  const gapDue = gapDueText(summary);
  return (
    <div role="group" aria-label="Montants" className="ldm-ri-rows finance-totals">
      <AmountRow label="Prix catalogue">{formatMad(summary.catalogue_price)}</AmountRow>
      <AmountRow label="Prix total convenu" strong>{formatMad(summary.agreed_total_price)}</AmountRow>
      <AmountRow label="Prix figurant sur l'acte">{formatMad(summary.acte_price)}</AmountRow>
      {(summary.gap_amount ?? 0) > 0 && (
        <AmountRow label="Écart à régulariser">{formatMad(summary.gap_amount)}{gapDue ? ` — ${gapDue}` : ''}</AmountRow>
      )}
      <AmountRow label="Premier acompte reçu">{formatMad(summary.first_payment)}</AmountRow>
      <AmountRow label="Total encaissé">{formatMad(summary.total_received)}</AmountRow>
      <AmountRow label="Reste à payer" highlight>{formatMad(summary.remaining)}</AmountRow>
    </div>
  );
}

/** « Acte disponible » ou le message du seuil d'émission de l'acte. */
export function ActeStatus({ summary }) {
  return summary.acte_available
    ? <div className="finance-acte-status"><span className="badge badge-green">Acte disponible</span></div>
    : <div className="finance-acte-status finance-acte-status--pending">{acteThresholdMessage(summary)}</div>;
}

/**
 * Échéancier (table « Échéancier ») : échéance, date, montant, reçu, statut calculé, l'écart sur
 * sa propre ligne. `legacy` : sans montants ni retard (statuts tels qu'enregistrés), sans action.
 * `canRecord` : « Enregistrer un encaissement » par échéance (`onRecord(id)`), désactivé une
 * fois l'échéance reçue ou pendant qu'un encaissement est en cours (`recordingId`).
 */
export function InstallmentsTable({ installments, legacy = false, canRecord = false, recordingId = null, onRecord, className = '' }) {
  const recordable = canRecord && !legacy;
  const now = new Date();
  return (
    <div className="finance-table-wrap">
      <table className={`pay-table finance-table ${className}`.trim()} aria-label="Échéancier">
        <thead>
          <tr>
            <th>Échéance</th><th>Date</th>
            {!legacy && <><th>Montant</th><th>Reçu</th></>}
            <th>Statut</th>
            {recordable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {installments.map((inst) => {
            const received = inst.status === 'paid';
            const overdue = !legacy && !received && new Date(inst.due_date) < now;
            return (
              <tr key={inst.id} className={[
                inst.payment_type === 'gap' ? 'pay-row--gap' : '',
                received ? 'pay-row--paid' : '',
                overdue ? 'pay-row--overdue' : '',
              ].filter(Boolean).join(' ')}>
                <td className="finance-installment-label">{installmentLabel(inst)}</td>
                <td>{formatDate(inst.due_date)}</td>
                {!legacy && <><td>{formatMad(inst.amount)}</td><td>{formatMad(inst.received)}</td></>}
                <td>
                  <span className={`badge ${STATUS_BADGE[inst.status] ?? 'badge-gray'}`}>
                    {INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status}
                  </span>
                  {overdue && <span className="badge badge-red finance-overdue">En retard</span>}
                </td>
                {recordable && (
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm finance-record-btn"
                      disabled={received || recordingId != null}
                      title={received ? 'Échéance entièrement reçue' : undefined}
                      onClick={() => onRecord(inst.id)}>
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
  );
}

/**
 * Encaissements (table « Encaissements »), le premier acompte inclus. `showProof` : colonne
 * « Justificatif » (bouton « Télécharger » si `onDownloadProof(payment)` est fourni).
 */
export function PaymentsTable({ payments, installments, showProof = false, onDownloadProof }) {
  const installmentById = new Map(installments.map((i) => [i.id, i]));
  return (
    <div className="finance-table-wrap">
      <table className="pay-table finance-table" aria-label="Encaissements">
        <thead>
          <tr>
            <th>Date</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Échéance</th>
            {showProof && <th>Justificatif</th>}
            <th>Enregistré par</th>
          </tr>
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
                {showProof && (
                  <td>
                    {p.document_id == null ? '—' : onDownloadProof ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDownloadProof(p)}
                        aria-label={`Télécharger le justificatif du ${formatDate(p.paid_on)}`}>
                        Télécharger
                      </button>
                    ) : 'Oui'}
                  </td>
                )}
                <td>{p.recorded_by_name || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
