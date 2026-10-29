import { useState } from 'react';
import { formatMad } from '../../utils/formatters';
import usePaymentsData from './usePaymentsData';
import RecordPaymentForm from './RecordPaymentForm';
import {
  ActeStatus,
  FinanceAmounts,
  InstallmentsTable,
  LegacyFinanceNotice,
  PaymentsTable,
} from './FinanceParts';

const sumCents = (installments) => installments.reduce((total, i) => total + Math.round(i.amount * 100), 0);

/**
 * « Échéancier et encaissements » d'une réservation engagée (spec E4-T5), dans la grande
 * fenêtre à trois colonnes des parcours de réservation : rendu comme deux colonnes sœurs, à
 * placer dans `.modal.modal--3col` après le résumé du lot (`.modal-split-left`).
 *
 * - centre (`.modal-split-right`) : montants (catalogue, prix total convenu, prix sur l'acte,
 *   écart et son échéance, premier acompte, total encaissé, reste à payer), état de l'acte,
 *   formulaire « Enregistrer un encaissement » de l'échéance choisie, liste des encaissements ;
 *   pied « Fermer » (`onClose`) et « Modifier la réservation » (`canEdit`, `onEdit`) ;
 * - droite (`.modal-pay-panel`) : échéancier et son total, « Enregistrer un encaissement » sur
 *   chaque échéance non reçue (`canRecord`), qui ouvre le formulaire au centre.
 *
 * Réservation engagée avant E4-T5 (`summary.legacy`) : un avertissement remplace les montants,
 * l'échéancier est affiché sans montants, sans encaissement ni modification.
 * `onSummaryChange` / `onSummaryError` : comme `PaymentsPanel` ; `onPaymentRecorded()` après un
 * encaissement (les montants sont relus ici) ; `onDownloadProof(payment)` télécharge un
 * justificatif ; `closeButton` (facultatif) : bouton de fermeture de la fenêtre, dans l'en-tête.
 */
export default function ReservationFinanceView({
  reservationId, lotNumero, canRecord = false, canEdit = false, onEdit, onClose, closeButton,
  onSummaryChange, onSummaryError, onPaymentRecorded, onDownloadProof,
}) {
  const { summary, payments, failed, reload } = usePaymentsData(reservationId, { onSummaryChange, onSummaryError });
  const [formFor, setFormFor] = useState(null); // id de l'échéance en cours d'encaissement

  const legacy = summary?.legacy === true;
  const recordable = canRecord && summary != null && !legacy;
  const installments = summary?.installments ?? [];
  const formInstallment = recordable && formFor != null ? installments.find((i) => i.id === formFor) : null;
  const count = installments.length;

  const handleSaved = () => {
    setFormFor(null);
    reload();
    onPaymentRecorded?.();
  };

  let body;
  if (failed) {
    body = <div className="ldm-documents-empty">Échéancier indisponible.</div>;
  } else if (!summary) {
    body = <div className="ldm-documents-empty">Chargement de l'échéancier…</div>;
  } else {
    body = (
      <>
        {legacy ? <LegacyFinanceNotice /> : <FinanceAmounts summary={summary} />}
        <ActeStatus summary={summary} />
        {formInstallment && (
          <RecordPaymentForm
            key={formInstallment.id}
            reservationId={reservationId}
            installment={formInstallment}
            onSaved={handleSaved}
            onCancel={() => setFormFor(null)}
          />
        )}
        <section className="finance-payments" aria-label="Encaissements enregistrés">
          <div className="msr-section-head"><span className="msr-section-label">Encaissements</span></div>
          {payments === null ? (
            <div className="ldm-documents-empty">Impossible de charger les encaissements.</div>
          ) : payments.length === 0 ? (
            <div className="ldm-documents-empty">Aucun encaissement enregistré.</div>
          ) : (
            <PaymentsTable payments={payments} installments={installments} showProof onDownloadProof={onDownloadProof} />
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <div className="modal-split-right">
        <div className="msr-header">
          <div className="msr-header-left">
            <h3 className="msr-title">Échéancier et encaissements</h3>
            {lotNumero != null && <div className="msr-subtitle">Lot {lotNumero}</div>}
          </div>
          {closeButton}
        </div>
        <div className="msr-form">{body}</div>
        <div className="msr-actions-footer">
          <button type="button" className="msr-btn-cancel" onClick={onClose}>Fermer</button>
          {canEdit && summary != null && !legacy && (
            <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve" onClick={onEdit}>Modifier la réservation</button>
          )}
        </div>
      </div>

      <div className="modal-pay-panel">
        <div className="mpp-header">
          <div className="mpp-header-left">
            <span className="mpp-title">Échéancier</span>
            {summary && <span className="mpp-subtitle">{count} échéance{count > 1 ? 's' : ''}</span>}
          </div>
          {summary && !legacy && <span className="mpp-total">{formatMad(sumCents(installments) / 100)}</span>}
        </div>
        <div className="mpp-body mpp-finance-body">
          {summary && count > 0 && (
            <InstallmentsTable
              installments={installments}
              legacy={legacy}
              canRecord={recordable}
              recordingId={formInstallment ? formFor : null}
              onRecord={setFormFor}
              className="mpp-finance-table"
            />
          )}
          {summary && count === 0 && <div className="ldm-documents-empty">Aucune échéance.</div>}
        </div>
      </div>
    </>
  );
}
