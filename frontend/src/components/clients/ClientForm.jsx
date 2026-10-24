import { useState } from 'react';
import { apiGet } from '../../utils/api';
import { CLIENT_TYPES } from '../../utils/constants';
import {
  ACQUISITION_CHANNEL_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  effectiveActeAddress,
  fieldErrorsFromApi,
  normalizeCin,
  validateClientForm,
} from '../../utils/clientProfile';

const EMPTY_VALUES = {
  last_name: '',
  maiden_name: '',
  first_name: '',
  cin: '',
  phone: '',
  whatsapp: '',
  email: '',
  address_morocco: '',
  address_abroad: '',
  acte_address: '',
  acquisition_channel: '',
  acquisition_referrer: '',
  acquisition_date: '',
  client_type: 'autre',
  notes: '',
};

const TEXT_FIELDS = Object.keys(EMPTY_VALUES);

function toFormValues(initial = {}) {
  const values = { ...EMPTY_VALUES };
  for (const key of TEXT_FIELDS) values[key] = initial[key] ?? EMPTY_VALUES[key];
  // Client hérité : seul `name` existe, il sert de nom de famille.
  if (!values.last_name && initial.name && !initial.first_name) values.last_name = initial.name;
  values.notification_channels = Array.isArray(initial.notification_channels)
    ? [...initial.notification_channels]
    : [];
  return values;
}

const blankToNull = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' || trimmed === undefined ? null : trimmed;
};

export default function ClientForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Enregistrer',
  compact = false,
  excludeId,
}) {
  const [values, setValues] = useState(() => toFormValues(initialValues));
  const [whatsappSame, setWhatsappSame] = useState(
    () => !initialValues?.whatsapp || initialValues.whatsapp === initialValues.phone
  );
  const [errors, setErrors] = useState({});
  const [duplicates, setDuplicates] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const { value } = e.target;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const hasBothAddresses = values.address_morocco.trim() && values.address_abroad.trim();
  const channel = values.acquisition_channel;
  const needsReferrer = channel === 'recommandation' || channel === 'samsar';

  const toggleNotification = (key) => {
    setValues((v) => ({
      ...v,
      notification_channels: v.notification_channels.includes(key)
        ? v.notification_channels.filter((c) => c !== key)
        : [...v.notification_channels, key],
    }));
  };

  const checkDuplicates = async () => {
    const cin = normalizeCin(values.cin).value;
    const email = values.email.trim().includes('@') ? values.email.trim() : '';
    if (!cin && !email) {
      setDuplicates([]);
      return;
    }
    const params = new URLSearchParams();
    if (cin) params.set('cin', cin);
    if (email) params.set('email', email);
    if (excludeId) params.set('exclude_id', String(excludeId));
    try {
      const found = await apiGet(`/api/clients/duplicates?${params.toString()}`);
      setDuplicates(Array.isArray(found) ? found : []);
    } catch {
      setDuplicates([]); // avertissement non bloquant : on ignore l'échec
    }
  };

  const buildPayload = () => {
    const payload = {};
    for (const key of TEXT_FIELDS) payload[key] = blankToNull(values[key]);
    if (whatsappSame) payload.whatsapp = blankToNull(values.phone);
    payload.acte_address = effectiveActeAddress(values);
    payload.notification_channels = values.notification_channels;
    if (!needsReferrer) payload.acquisition_referrer = null;
    if (channel !== 'samsar') payload.acquisition_date = null;
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateClientForm({
      ...values,
      whatsapp: whatsappSame ? '' : values.whatsapp,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSubmit(buildPayload());
    } catch (err) {
      const serverErrors = fieldErrorsFromApi(err);
      if (Object.keys(serverErrors).length > 0) setErrors(serverErrors);
    } finally {
      setSaving(false);
    }
  };

  const field = (id, label, input, extra) => (
    <div className="field-group">
      <label className="field-label" htmlFor={`client-${id}`}>{label}</label>
      {input}
      {extra}
      {errors[id] && <span className="client-form-error" role="alert">{errors[id]}</span>}
    </div>
  );

  const text = (id, props = {}) => (
    <input
      id={`client-${id}`}
      className={`field-input${errors[id] ? ' has-error' : ''}`}
      type="text"
      value={values[id]}
      onChange={set(id)}
      {...props}
    />
  );

  return (
    <form className={`client-form${compact ? ' client-form--compact' : ''}`} onSubmit={handleSubmit} noValidate>
      <section className="client-form-section">
        <h4 className="client-form-section-title">Identité</h4>
        <div className="form-2col">
          {field('last_name', 'Nom *', text('last_name', { autoFocus: true }))}
          {field('maiden_name', 'Nom de jeune fille', text('maiden_name'))}
          {field('first_name', 'Prénom *', text('first_name'))}
          {field('cin', 'CIN', text('cin', { placeholder: 'AB123456', onBlur: checkDuplicates }))}
        </div>
      </section>

      <section className="client-form-section">
        <h4 className="client-form-section-title">Coordonnées</h4>
        <div className="form-2col">
          {field('phone', 'Téléphone *', text('phone', { type: 'tel', placeholder: '0612345678' }))}
          {field(
            'whatsapp',
            'WhatsApp',
            text('whatsapp', {
              type: 'tel',
              disabled: whatsappSame,
              value: whatsappSame ? values.phone : values.whatsapp,
            }),
            <label className="client-form-hint">
              <input
                type="checkbox"
                checked={whatsappSame}
                onChange={(e) => setWhatsappSame(e.target.checked)}
              />{' '}
              Même numéro que le téléphone
            </label>
          )}
          {field('email', 'Email', text('email', { type: 'email', placeholder: 'jean@exemple.com', onBlur: checkDuplicates }))}
        </div>
        {duplicates.length > 0 && (
          <div className="client-form-warning" role="status">
            Un client similaire existe déjà :{' '}
            {duplicates.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <a href={`/app/clients/${d.id}`} target="_blank" rel="noreferrer">{d.name}</a>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="client-form-section">
        <h4 className="client-form-section-title">Adresses</h4>
        <div className="form-2col">
          {field('address_morocco', 'Adresse Maroc', text('address_morocco'))}
          {field('address_abroad', 'Adresse étranger', text('address_abroad'))}
        </div>
        {hasBothAddresses && (
          <div className="field-group">
            <span className="field-label" id="client-acte-label">Adresse utilisée pour les actes *</span>
            <div className="client-form-inline" role="radiogroup" aria-labelledby="client-acte-label">
              {[['morocco', 'Maroc'], ['abroad', 'Étranger']].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="radio"
                    name="acte_address"
                    checked={values.acte_address === key}
                    onChange={() => {
                      setValues((v) => ({ ...v, acte_address: key }));
                      setErrors((prev) => ({ ...prev, acte_address: undefined }));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.acte_address && <span className="client-form-error" role="alert">{errors.acte_address}</span>}
          </div>
        )}
      </section>

      <section className="client-form-section">
        <h4 className="client-form-section-title">Canal d&apos;acquisition</h4>
        <div className="form-2col">
          {field(
            'acquisition_channel',
            "Canal d'acquisition *",
            <select
              id="client-acquisition_channel"
              className={`field-input${errors.acquisition_channel ? ' has-error' : ''}`}
              value={values.acquisition_channel}
              onChange={set('acquisition_channel')}
            >
              <option value="">Choisir…</option>
              {Object.entries(ACQUISITION_CHANNEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {needsReferrer &&
            field(
              'acquisition_referrer',
              channel === 'samsar' ? 'Nom du samsar *' : 'Recommandé par *',
              text('acquisition_referrer')
            )}
          {channel === 'samsar' &&
            field(
              'acquisition_date',
              "Date d'acquisition *",
              text('acquisition_date', { type: 'date' })
            )}
        </div>
      </section>

      <section className="client-form-section">
        <h4 className="client-form-section-title">Préférences de notification</h4>
        <div className="client-form-inline">
          {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={values.notification_channels.includes(key)}
                onChange={() => toggleNotification(key)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="form-2col">
          {field(
            'client_type',
            'Type de client',
            <select
              id="client-client_type"
              className="field-input"
              value={values.client_type}
              onChange={set('client_type')}
            >
              {CLIENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
        </div>
        {field(
          'notes',
          'Notes',
          <textarea
            id="client-notes"
            className="field-input"
            rows={compact ? 2 : 3}
            value={values.notes}
            onChange={set('notes')}
            style={{ resize: 'vertical' }}
          />
        )}
      </section>

      <div className="client-form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
