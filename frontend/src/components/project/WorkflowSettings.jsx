import { useState } from 'react';
import { apiPut } from '../../utils/api';
import { useToast } from '../../contexts/toastHooks';
import { DEFAULT_ENABLED_OPTIONAL, OPTIONAL_KEYS } from '../../utils/lotWorkflow';

const STEPS = [
  {
    key: 'option',
    label: 'Option',
    hint: 'Blocage temporaire d’un lot pour un client, avant toute réservation.',
  },
  {
    key: 'reservation_a_finaliser',
    label: 'Réservation à finaliser',
    hint: 'Garantie versée en attendant l’engagement. Désactivée, une option s’engage directement.',
  },
  {
    key: 'edl',
    label: 'États des lieux',
    hint: 'Programmation, visite et suivi des actions après le solde, avant le notaire.',
  },
];

/**
 * « Étapes du workflow » — optional lot statuses of the project (manager only).
 * A refusal (lots still in a status being disabled) is shown as returned by the API.
 */
export default function WorkflowSettings({ project, onUpdate }) {
  const [enabled, setEnabled] = useState(
    () => new Set(project.enabled_optional_statuses ?? DEFAULT_ENABLED_OPTIONAL)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const toggle = (key) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiPut(`/api/projects/${project.id}/workflow`, {
        enabled_optional_statuses: OPTIONAL_KEYS.filter((key) => enabled.has(key)),
      });
      toast.success('Étapes du workflow mises à jour');
      onUpdate();
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour des étapes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-card" style={{ marginTop: 'var(--spacing-lg)' }}>
      <h3>Étapes du workflow</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
        Choisissez les étapes facultatives utilisées par ce projet. Une étape ne peut pas être
        désactivée tant que des lots s’y trouvent.
      </p>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--spacing-md)' }}>
            {error}
          </div>
        )}
        {STEPS.map(({ key, label, hint }) => (
          <div className="form-group" key={key}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled.has(key)}
                onChange={() => toggle(key)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{hint}</span>
              </span>
            </label>
          </div>
        ))}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer les étapes'}
        </button>
      </form>
    </div>
  );
}
