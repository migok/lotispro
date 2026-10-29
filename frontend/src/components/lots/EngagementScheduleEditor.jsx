import { formatDate, formatMad } from '../../utils/formatters';
import { installmentLabel, INSTALLMENT_STATUS_LABELS } from '../../services/reservationFinanceService';
import { isEditableInstallment } from './useEngagementEdit';

const STATUS_BADGE = { pending: 'badge-gray', partial: 'badge-gold', paid: 'badge-green' };

/**
 * Échéancier de « Modifier la réservation » (spec E4-T5), dans le panneau de droite :
 * montant et date modifiables pour les échéances non reçues ; échéances reçues et ligne de
 * l'écart (recalculée en direct) en lecture seule avec leur statut ; « Total des échéances »
 * comparé à l'attendu, en rouge tant qu'ils diffèrent. `edit` : valeur de `useEngagementEdit`.
 */
export default function EngagementScheduleEditor({ edit }) {
  const { rows, scheduleRows, gapCents, gapDateText, totalCents, expectedCents, balanced, setRow } = edit;

  return (
    <div className="mpp-edit-schedule">
      <div className="mpp-edit-table-wrap">
        <table className="pay-table mpp-edit-table" aria-label="Échéances">
          <thead>
            <tr><th>Échéance</th><th>Date</th><th>Montant</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {scheduleRows.map((inst) => {
              const label = installmentLabel(inst);
              const isGap = inst.payment_type === 'gap';
              const editable = isEditableInstallment(inst);
              return (
                <tr key={inst.id} className={isGap ? 'pay-row--gap' : undefined}>
                  <td className="mpp-edit-label">{label}</td>
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
      <div aria-live="polite" className={`mpp-edit-total${balanced ? '' : ' mpp-edit-total--off'}`}>
        {`Total des échéances : ${formatMad(totalCents / 100)} / attendu ${formatMad(expectedCents / 100)}`}
      </div>
    </div>
  );
}
