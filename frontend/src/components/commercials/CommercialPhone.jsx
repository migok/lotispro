import { useState } from 'react';
import { apiPatch } from '../../utils/api';
import { normalizePhone, phoneError } from '../../utils/clientProfile';
import LazyPhoneInput from '../clients/LazyPhoneInput';

/**
 * Téléphone d'un commercial (utilisé dans les emails de notification).
 * Modifiable par les managers uniquement ; lecture seule sinon.
 */
export default function CommercialPhone({ commercial, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setValue(commercial.phone || '');
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    const invalid = value.trim() ? phoneError(value) : null;
    if (invalid) { setError(invalid); return; }
    const { value: phone } = normalizePhone(value);
    setSaving(true);
    setError('');
    try {
      const saved = await apiPatch(`/api/users/${commercial.id}`, { phone });
      onSaved(saved);
      setEditing(false);
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="identity-meta">
        Téléphone : <span>{commercial.phone || 'Non renseigné'}</span>
        {canEdit && (
          <button
            type="button"
            className="cp-action-btn"
            title="Modifier le téléphone"
            aria-label="Modifier le téléphone"
            onClick={startEditing}
          >
            ✎
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="identity-meta" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={`commercial-phone-${commercial.id}`}>Téléphone</label>
      <LazyPhoneInput
        id={`commercial-phone-${commercial.id}`}
        label="téléphone"
        value={value}
        onChange={setValue}
        disabled={saving}
        error={error}
        describedBy={error ? `commercial-phone-${commercial.id}-error` : undefined}
      />
      {error && (
        <span id={`commercial-phone-${commercial.id}-error`} role="alert" style={{ color: 'var(--color-blocked)' }}>
          {error}
        </span>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>
          Annuler
        </button>
      </div>
    </div>
  );
}
