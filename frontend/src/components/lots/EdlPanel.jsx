import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../../utils/api';
import { useToast } from '../../contexts/toastHooks';
import { formatDate } from '../../utils/formatters';

/** Actions can only be added, ticked or removed once the visit is done. */
const ACTIONS_EDITABLE_STATUS = 'edl_realise';

/**
 * État des lieux of a lot in an EDL status: schedule, visit, actions.
 * In `edl_realise` the actions can be ticked, added and removed; the number
 * of open actions is reported through `onOpenCountChange`.
 */
export default function EdlPanel({ lot, onOpenCountChange }) {
  const toast = useToast();
  const [edl, setEdl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newAction, setNewAction] = useState({ description: '', responsable: '' });
  const editable = lot.status === ACTIONS_EDITABLE_STATUS;
  // The toast context value changes with every toast; its functions do not.
  const toastError = toast.error;

  const load = useCallback(async () => {
    try {
      setEdl(await apiGet(`/api/lots/${lot.id}/edl`));
    } catch (err) {
      if (err.status !== 404) toastError(err.message || "Erreur lors du chargement de l'état des lieux");
      setEdl(null);
    } finally {
      setLoaded(true);
    }
  }, [lot.id, toastError]);

  useEffect(() => { load(); }, [load]);

  const actions = edl?.actions ?? [];
  const openCount = actions.filter((a) => a.status === 'ouverte').length;

  useEffect(() => {
    if (loaded && edl) onOpenCountChange?.(openCount);
  }, [loaded, edl, openCount, onOpenCountChange]);

  const run = async (request, successMessage) => {
    setBusy(true);
    try {
      await request();
      if (successMessage) toast.success(successMessage);
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || 'Erreur');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const base = `/api/lots/${lot.id}/edl/actions`;

  const toggleAction = (action) =>
    run(() => apiPut(`${base}/${action.id}`, { status: action.status === 'ouverte' ? 'faite' : 'ouverte' }));

  const deleteAction = (action) => run(() => apiDelete(`${base}/${action.id}`), 'Action supprimée');

  const addAction = async (e) => {
    e.preventDefault();
    const description = newAction.description.trim();
    if (!description) { toast.warning("La description de l'action est requise"); return; }
    const added = await run(
      () => apiPost(base, { description, responsable: newAction.responsable.trim() || null }),
      'Action ajoutée'
    );
    if (added) setNewAction({ description: '', responsable: '' });
  };

  if (!loaded) return null;

  return (
    <div className="ldm-documents-section ldm-edl-section">
      <div className="ldm-documents-header">
        <div className="ldm-section-label" style={{ margin: 0 }}>
          État des lieux
          {actions.length > 0 && (
            <span className={`badge ${openCount > 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.65rem', marginLeft: 6 }}>
              {actions.length - openCount} / {actions.length} faite{actions.length - openCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {!edl ? (
        <div className="ldm-documents-empty">Aucun état des lieux enregistré</div>
      ) : (
        <>
          <div className="ldm-ri-rows" style={{ padding: 0, marginBottom: 8 }}>
            <div className="ldm-ri-row"><span className="ldm-ri-key">Programmé le</span><span className="ldm-ri-val">{formatDate(edl.scheduled_at, true)}</span></div>
            <div className="ldm-ri-row"><span className="ldm-ri-key">Intervenant</span><span className="ldm-ri-val">{edl.intervenant}</span></div>
            {edl.schedule_note && <div className="ldm-ri-row"><span className="ldm-ri-key">Note</span><span className="ldm-ri-val">{edl.schedule_note}</span></div>}
            {edl.done_at && <div className="ldm-ri-row"><span className="ldm-ri-key">Réalisé le</span><span className="ldm-ri-val">{formatDate(edl.done_at, true)}</span></div>}
            {edl.done_note && <div className="ldm-ri-row"><span className="ldm-ri-key">Compte rendu</span><span className="ldm-ri-val">{edl.done_note}</span></div>}
            {edl.finalized_at && <div className="ldm-ri-row"><span className="ldm-ri-key">Finalisé le</span><span className="ldm-ri-val">{formatDate(edl.finalized_at, true)}</span></div>}
          </div>

          {(actions.length > 0 || editable) && (
            <div className="ldm-section-label" style={{ margin: '4px 0 6px' }}>Actions</div>
          )}
          {actions.length === 0 && editable && (
            <div className="ldm-documents-empty">Aucune action</div>
          )}
          {actions.length > 0 && (
            <div className="ldm-documents-list">
              {actions.map((action) => (
                <div key={action.id} className="ldm-doc-row">
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={action.status === 'faite'}
                      onChange={() => toggleAction(action)}
                      disabled={busy}
                      aria-label={`Marquer « ${action.description} » comme ${action.status === 'faite' ? 'ouverte' : 'faite'}`}
                    />
                  ) : (
                    <span className={`badge ${action.status === 'faite' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.65rem' }}>
                      {action.status === 'faite' ? 'Faite' : 'Ouverte'}
                    </span>
                  )}
                  <div className="ldm-doc-name" title={action.description}
                    style={action.status === 'faite' ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>
                    {action.description}
                  </div>
                  {action.responsable && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{action.responsable}</span>
                  )}
                  {editable && (
                    <div className="ldm-doc-actions">
                      <button type="button" className="ldm-doc-btn ldm-doc-btn--danger" disabled={busy}
                        onClick={() => deleteAction(action)} title="Supprimer l'action"
                        aria-label={`Supprimer « ${action.description} »`}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {editable && (
            <form onSubmit={addAction} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <input type="text" className="msr-input" style={{ flex: 2, minWidth: 140 }}
                placeholder="Nouvelle action…" aria-label="Description de l'action" maxLength={500}
                value={newAction.description}
                onChange={(e) => setNewAction((a) => ({ ...a, description: e.target.value }))} />
              <input type="text" className="msr-input" style={{ flex: 1, minWidth: 100 }}
                placeholder="Responsable (opt.)" aria-label="Responsable de l'action" maxLength={200}
                value={newAction.responsable}
                onChange={(e) => setNewAction((a) => ({ ...a, responsable: e.target.value }))} />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Ajouter</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
