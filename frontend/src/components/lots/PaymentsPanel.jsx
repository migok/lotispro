import { useState } from 'react';
import usePaymentsData from './usePaymentsData';
import RecordPaymentForm from './RecordPaymentForm';
import {
  ActeStatus,
  FinanceTotals,
  InstallmentsTable,
  LegacyFinanceNotice,
  PaymentsTable,
} from './FinanceParts';

/**
 * Montants et échéancier d'une réservation engagée (E4-T5), lus dans `financial-summary`
 * et `payments` : Prix total convenu, Total encaissé, Reste à payer ; échéances avec leur
 * statut calculé (À recevoir / Partiellement reçu / Reçu), l'écart sur sa propre ligne ;
 * encaissements enregistrés ; indicateur « Acte disponible » ou message de seuil.
 *
 * Réservation engagée avant E4-T5 (`summary.legacy`) : un avertissement remplace les montants,
 * l'échéancier est affiché sans montants (statuts tels qu'enregistrés) et sans action.
 *
 * `compact` : seulement les trois montants (ou l'avertissement) — la fiche lot ouvre
 * l'échéancier dans la grande fenêtre (`ReservationFinanceView`).
 * `canRecord` : bouton « Enregistrer un encaissement » par échéance (désactivé une fois reçue).
 * `showActeStatus` (défaut true) : false quand l'hôte affiche déjà l'état de l'acte.
 * `onSummaryChange(summary)` : chaque résumé chargé ; `onSummaryError()` si le résumé ne peut
 * pas être chargé ; `onPaymentRecorded()` après un encaissement.
 */
export default function PaymentsPanel({
  reservationId,
  canRecord = false,
  compact = false,
  showActeStatus = true,
  onSummaryChange,
  onSummaryError,
  onPaymentRecorded,
}) {
  const { summary, payments, failed, reload } = usePaymentsData(reservationId, {
    withPayments: !compact, onSummaryChange, onSummaryError,
  });
  const [formFor, setFormFor] = useState(null); // id de l'échéance en cours d'encaissement

  if (failed) return <div className="ldm-documents-empty">Échéancier indisponible.</div>;
  if (!summary) return <div className="ldm-documents-empty">Chargement de l'échéancier…</div>;

  const legacy = summary.legacy === true;
  const recordable = canRecord && !legacy && !compact;
  const formInstallment = recordable && formFor != null
    ? summary.installments.find((i) => i.id === formFor) : null;

  const handleSaved = () => {
    setFormFor(null);
    reload();
    onPaymentRecorded?.();
  };

  return (
    <div className="payments-panel">
      {legacy ? <LegacyFinanceNotice /> : <FinanceTotals summary={summary} />}
      {showActeStatus && <ActeStatus summary={summary} />}

      {!compact && summary.installments.length > 0 && (
        <InstallmentsTable
          installments={summary.installments}
          legacy={legacy}
          canRecord={recordable}
          recordingId={formInstallment ? formFor : null}
          onRecord={setFormFor}
        />
      )}

      {formInstallment && (
        <RecordPaymentForm
          key={formInstallment.id}
          reservationId={reservationId}
          installment={formInstallment}
          onSaved={handleSaved}
          onCancel={() => setFormFor(null)}
        />
      )}

      {!compact && payments === null && (
        <div className="ldm-documents-empty finance-payments-error">Impossible de charger les encaissements.</div>
      )}
      {!compact && payments?.length > 0 && (
        <div className="finance-payments-list">
          <PaymentsTable payments={payments} installments={summary.installments} />
        </div>
      )}
    </div>
  );
}
