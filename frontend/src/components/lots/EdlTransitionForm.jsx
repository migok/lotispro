import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../utils/api';
import { useToast } from '../../contexts/toastHooks';

/** ISO date → value of a datetime-local input (local time). */
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const EMPTY_ACTION = { description: '', responsable: '' };

/**
 * Form body + footer of the EDL transitions of the lot modal:
 * `edl_schedule` (POST edl-schedule), `edl_reschedule` (PUT edl-schedule)
 * and `edl_done` (POST edl-done with the actions raised by the visit).
 */
export default function EdlTransitionForm({ mode, lot, onCancel, onDone }) {
  const toast = useToast();
  const toastError = toast.error;
  const isSchedule = mode === 'edl_schedule' || mode === 'edl_reschedule';
  const [scheduledAt, setScheduledAt] = useState('');
  const [intervenant, setIntervenant] = useState(lot.edl_intervenant || '');
  const [note, setNote] = useState('');
  const [doneAt, setDoneAt] = useState(() => toLocalInput());
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Rescheduling starts from the current schedule.
  useEffect(() => {
    if (mode !== 'edl_reschedule') return;
    let cancelled = false;
    apiGet(`/api/lots/${lot.id}/edl`)
      .then((edl) => {
        if (cancelled) return;
        setScheduledAt(toLocalInput(edl.scheduled_at));
        setIntervenant(edl.intervenant || '');
        setNote(edl.schedule_note || '');
      })
      .catch((err) => { if (!cancelled) toastError(err.message || "Erreur lors du chargement de l'état des lieux"); });
    return () => { cancelled = true; };
  }, [mode, lot.id, toastError]);

  const updateAction = (index, field, value) =>
    setActions((list) => list.map((a, i) => (i === index ? { ...a, [field]: value } : a)));

  const submit = async () => {
    const path = `/api/lots/${lot.id}/transitions`;
    let request;
    let successMessage;
    if (isSchedule) {
      if (!scheduledAt) { toast.warning("La date de l'état des lieux est requise"); return; }
      if (!intervenant.trim()) { toast.warning("L'intervenant est requis"); return; }
      const body = {
        scheduled_at: new Date(scheduledAt).toISOString(),
        intervenant: intervenant.trim(),
        note: note.trim() || null,
      };
      request = mode === 'edl_schedule'
        ? () => apiPost(`${path}/edl-schedule`, body)
        : () => apiPut(`${path}/edl-schedule`, body);
      successMessage = mode === 'edl_schedule' ? 'État des lieux programmé' : 'État des lieux reprogrammé';
    } else {
      if (!doneAt) { toast.warning('La date de la visite est requise'); return; }
      request = () => apiPost(`${path}/edl-done`, {
        done_at: new Date(doneAt).toISOString(),
        note: note.trim() || null,
        actions: actions
          .filter((a) => a.description.trim())
          .map((a) => ({ description: a.description.trim(), responsable: a.responsable.trim() || null })),
      });
      successMessage = 'État des lieux réalisé';
    }
    setLoading(true);
    try {
      await request();
      toast.success(successMessage);
      onDone();
    } catch (err) {
      toast.error(err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="msr-form">
        {isSchedule ? (
          <>
            <div className="msr-field-group">
              <label className="msr-label" htmlFor="edl-scheduled-at">Date et heure <span className="msr-required">*</span></label>
              <input id="edl-scheduled-at" type="datetime-local" className="msr-input"
                value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div className="msr-field-group">
              <label className="msr-label" htmlFor="edl-intervenant">Intervenant <span className="msr-required">*</span></label>
              <input id="edl-intervenant" type="text" className="msr-input" maxLength={200}
                placeholder="Nom de la personne qui réalise l'état des lieux"
                value={intervenant} onChange={(e) => setIntervenant(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="msr-field-group">
              <label className="msr-label" htmlFor="edl-done-at">Date de la visite <span className="msr-required">*</span></label>
              <input id="edl-done-at" type="datetime-local" className="msr-input"
                value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
            </div>
            <div className="msr-field-group">
              <label className="msr-label">Actions à mener <span className="msr-optional">(optionnel)</span></label>
              {actions.map((action, index) => (
                <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input type="text" className="msr-input" style={{ flex: 2 }} maxLength={500}
                    placeholder="Description" aria-label={`Description de l'action ${index + 1}`}
                    value={action.description} onChange={(e) => updateAction(index, 'description', e.target.value)} />
                  <input type="text" className="msr-input" style={{ flex: 1 }} maxLength={200}
                    placeholder="Responsable (opt.)" aria-label={`Responsable de l'action ${index + 1}`}
                    value={action.responsable} onChange={(e) => updateAction(index, 'responsable', e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-sm" title="Retirer"
                    aria-label={`Retirer l'action ${index + 1}`}
                    onClick={() => setActions((list) => list.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
              <button type="button" className="msr-btn-add-client" style={{ alignSelf: 'flex-start' }}
                onClick={() => setActions((list) => [...list, { ...EMPTY_ACTION }])}>
                + Ajouter une action
              </button>
            </div>
          </>
        )}
        <div className="msr-field-group">
          <label className="msr-label" htmlFor="edl-note">{isSchedule ? 'Note' : 'Compte rendu'} <span className="msr-optional">(optionnel)</span></label>
          <textarea id="edl-note" className="msr-textarea" rows={3} maxLength={5000}
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="msr-actions-footer">
        <button type="button" className="msr-btn-cancel" onClick={onCancel}>Annuler</button>
        <button type="button" className="msr-btn-confirm msr-btn-confirm--reserve" onClick={submit} disabled={loading}>
          {loading ? 'En cours...' : mode === 'edl_done' ? 'Enregistrer la visite' : 'Confirmer'}
        </button>
      </div>
    </>
  );
}
