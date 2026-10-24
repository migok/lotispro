/**
 * Règles de la fiche client (miroir de backend/app/domain/client_profile.py).
 */

export const ACQUISITION_CHANNEL_LABELS = {
  smap: 'SMAP',
  bureau_vente: 'Bureau de vente',
  reseaux_sociaux: 'Réseaux sociaux',
  recommandation: 'Recommandé par',
  samsar: 'Samsar',
};

export const NOTIFICATION_CHANNEL_LABELS = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export const CIN_ERROR = 'Format CIN invalide (ex. AB123456)';
export const PHONE_ERROR = 'Numéro invalide (format international, ex. +212612345678)';
const REQUIRED = 'Champ obligatoire';

const CIN_PATTERN = /^[A-Z]{1,2}[0-9]{1,6}$/;
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

const filled = (value) => typeof value === 'string' && value.trim() !== '';

/** Majuscules, sans espaces. Vide -> { value: null, error: null }. */
export function normalizeCin(v) {
  const cin = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  if (!cin) return { value: null, error: null };
  if (!CIN_PATTERN.test(cin)) return { value: null, error: CIN_ERROR };
  return { value: cin, error: null };
}

/** E.164 : 0XXXXXXXXX -> +212XXXXXXXXX, 00 -> +, séparateurs retirés. */
export function normalizePhone(v) {
  let phone = String(v ?? '').replace(/[\s.-]/g, '');
  if (!phone) return { value: null, error: null };
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (/^0[0-9]{9}$/.test(phone)) phone = `+212${phone.slice(1)}`;
  if (!PHONE_PATTERN.test(phone)) return { value: null, error: PHONE_ERROR };
  return { value: phone, error: null };
}

/**
 * Adresse d'acte effective : le choix de l'utilisateur quand les deux adresses
 * sont renseignées, sinon la seule adresse renseignée (ou null).
 */
export function effectiveActeAddress(values) {
  const hasMorocco = filled(values.address_morocco);
  const hasAbroad = filled(values.address_abroad);
  if (hasMorocco && hasAbroad) return values.acte_address || null;
  if (hasMorocco) return 'morocco';
  if (hasAbroad) return 'abroad';
  return null;
}

/** Valide le formulaire ; renvoie { champ: message } (vide si tout est bon). */
export function validateClientForm(values) {
  const errors = {};
  for (const field of ['last_name', 'first_name', 'phone', 'acquisition_channel']) {
    if (!filled(values[field])) errors[field] = REQUIRED;
  }

  const channel = values.acquisition_channel;
  if ((channel === 'recommandation' || channel === 'samsar') && !filled(values.acquisition_referrer)) {
    errors.acquisition_referrer = 'Indiquez qui';
  }
  if (channel === 'samsar' && !values.acquisition_date) {
    errors.acquisition_date = 'Indiquez quand';
  }

  if (filled(values.address_morocco) && filled(values.address_abroad) && !values.acte_address) {
    errors.acte_address = "Choisissez l'adresse utilisée pour les actes";
  }

  const cin = normalizeCin(values.cin);
  if (cin.error) errors.cin = cin.error;
  if (filled(values.phone)) {
    const phone = normalizePhone(values.phone);
    if (phone.error) errors.phone = phone.error;
  }
  if (filled(values.whatsapp)) {
    const whatsapp = normalizePhone(values.whatsapp);
    if (whatsapp.error) errors.whatsapp = whatsapp.error;
  }
  return errors;
}

/** Erreurs 422 de l'API -> { champ: message } (dernier segment de `field`). */
export function fieldErrorsFromApi(error) {
  const errors = {};
  for (const detail of error?.details ?? []) {
    if (!detail?.field || !detail.message) continue;
    const field = String(detail.field).split('.').pop();
    if (!errors[field]) errors[field] = detail.message;
  }
  return errors;
}
