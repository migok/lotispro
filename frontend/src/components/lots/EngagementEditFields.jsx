import { useId } from 'react';
import EngagementAmountsFields from './EngagementAmountsFields';

/**
 * Colonne centrale de « Modifier la réservation » (spec E4-T5) : erreur / conflit 409
 * (« Recharger »), montants (premier acompte reçu en lecture seule), échéance de l'écart,
 * notes et motif obligatoire. `edit` : valeur de `useEngagementEdit`.
 */
export default function EngagementEditFields({ edit }) {
  const id = useId();
  const { summary, amounts, notes, reason, firstPayment, error, reloading, setField, handleReload } = edit;

  return (
    <>
      {error && (
        <div className="alert alert-error msr-edit-alert" role="alert">
          <span className="msr-edit-alert-text">{error.message}</span>
          {error.conflict && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReload} disabled={reloading}>
              {reloading ? 'Rechargement...' : 'Recharger'}
            </button>
          )}
        </div>
      )}

      <div className="msr-section-head">
        <span className="msr-section-label">Montants</span>
      </div>
      <EngagementAmountsFields
        cataloguePrice={summary.catalogue_price}
        value={amounts}
        onChange={(next) => setField('amounts', next)}
        firstPayment={firstPayment}
        firstPaymentHint="Non modifiable"
      />

      <div className="msr-section-head">
        <span className="msr-section-label">Notes et motif</span>
      </div>
      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} className="msr-textarea" rows={3}
          value={notes} onChange={(e) => setField('notes', e.target.value)} />
      </div>

      <div className="msr-field-group">
        <label className="msr-label" htmlFor={`${id}-reason`}>
          Motif de la modification
        </label>
        <input id={`${id}-reason`} type="text" className="msr-input" required maxLength={500}
          placeholder="Pourquoi cette modification ?"
          value={reason} onChange={(e) => setField('reason', e.target.value)} />
      </div>
    </>
  );
}
