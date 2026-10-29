import { formatMad } from '../../utils/formatters';
import useEngagementEdit from './useEngagementEdit';
import EngagementEditFields from './EngagementEditFields';
import EngagementScheduleEditor from './EngagementScheduleEditor';

/**
 * « Modifier la réservation » d'une réservation engagée (spec E4-T5), dans la grande fenêtre
 * à trois colonnes des parcours de réservation : rendu comme deux colonnes sœurs, à placer dans
 * `.modal.modal--3col` après le résumé du lot (`.modal-split-left`).
 *
 * - centre (`.modal-split-right`) : titre, montants, échéance de l'écart, notes, motif, erreurs
 *   et pied « Annuler » / « Enregistrer les modifications », dans un `<form noValidate>` (les
 *   montants au centime ne doivent jamais bloquer l'envoi) ;
 * - droite (`.modal-pay-panel`) : échéancier modifiable et « Total des échéances » en direct.
 *
 * L'état et les règles d'enregistrement sont dans `useEngagementEdit` (voir ses props).
 * `onCancel` ferme sans aucun appel ; `closeButton` (facultatif) : bouton de fermeture de la
 * fenêtre, affiché dans l'en-tête ; `lotNumero` : numéro du lot, en sous-titre.
 */
export default function EditEngagementForm({
  reservationId, summary, notes, lotNumero, onSaved, onCancel, onReloaded, closeButton,
}) {
  const edit = useEngagementEdit({ reservationId, summary, notes, onSaved, onReloaded });
  const rowCount = edit.scheduleRows.length;

  return (
    <>
      <div className="modal-split-right">
        <div className="msr-header">
          <div className="msr-header-left">
            <h3 className="msr-title">Modifier la réservation</h3>
            {lotNumero != null && <div className="msr-subtitle">Lot {lotNumero}</div>}
          </div>
          {closeButton}
        </div>

        <form className="msr-edit-form" onSubmit={edit.handleSubmit} noValidate aria-label="Modifier la réservation">
          <div className="msr-form">
            <EngagementEditFields edit={edit} />
          </div>
          <div className="msr-actions-footer">
            <button type="button" className="msr-btn-cancel" onClick={onCancel} disabled={edit.saving}>
              Annuler
            </button>
            <button type="submit" className="msr-btn-confirm msr-btn-confirm--reserve" disabled={!edit.canSave}>
              {edit.saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>

      <div className="modal-pay-panel">
        <div className="mpp-header">
          <div className="mpp-header-left">
            <span className="mpp-title">Échéancier</span>
            <span className="mpp-subtitle">{rowCount} échéance{rowCount > 1 ? 's' : ''}</span>
          </div>
          <span className="mpp-total">{formatMad(edit.expectedCents / 100)}</span>
        </div>
        <div className="mpp-body">
          <EngagementScheduleEditor edit={edit} />
        </div>
      </div>
    </>
  );
}
