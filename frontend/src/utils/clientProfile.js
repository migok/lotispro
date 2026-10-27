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

/** E.164 : indicatif explicite requis, 00 -> +, séparateurs retirés. */
export function normalizePhone(v) {
  let phone = String(v ?? '').replace(/[\s.-]/g, '');
  if (!phone) return { value: null, error: null };
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
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

  const hasMorocco = filled(values.address_morocco);
  const hasAbroad = filled(values.address_abroad);
  if (!hasMorocco && !hasAbroad) {
    errors.address_morocco = 'Renseignez au moins une adresse (Maroc ou étranger)';
  }
  if (hasMorocco && !filled(values.city_morocco)) errors.city_morocco = 'Indiquez la ville';
  if (hasAbroad && !filled(values.city_abroad)) errors.city_abroad = 'Indiquez la ville';
  if (hasAbroad && !filled(values.country_abroad)) errors.country_abroad = 'Indiquez le pays';

  if (hasMorocco && hasAbroad && !values.acte_address) {
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

/** Champs que ClientForm sait afficher en erreur (clés des erreurs serveur). */
const FORM_FIELDS = new Set([
  'last_name', 'maiden_name', 'first_name', 'cin', 'phone', 'whatsapp', 'email',
  'address_morocco', 'city_morocco', 'address_abroad', 'city_abroad', 'country_abroad', 'acte_address', 'acquisition_channel',
  'acquisition_referrer', 'acquisition_date', 'client_type', 'notes',
]);

/**
 * Faut-il un toast pour cette erreur d'enregistrement ? Oui, sauf si au moins
 * un détail 422 est affiché sous un champ du formulaire (sinon l'erreur
 * resterait invisible).
 */
export function shouldToastClientError(error) {
  return !Object.keys(fieldErrorsFromApi(error)).some((field) => FORM_FIELDS.has(field));
}

/** Miroir de backend acte_address_of : « adresse, ville[, pays] » imprimée sur les actes. */
export function acteAddressOf(client) {
  const morocco = filled(client?.address_morocco);
  const abroad = filled(client?.address_abroad);
  let side = null;
  if (client?.acte_address === 'abroad' && abroad) side = 'abroad';
  else if (client?.acte_address === 'morocco' && morocco) side = 'morocco';
  else if (morocco && !abroad) side = 'morocco';
  else if (abroad && !morocco) side = 'abroad';
  if (!side) return null;
  const parts = [client[`address_${side}`], client[`city_${side}`]];
  if (side === 'abroad') parts.push(client.country_abroad);
  return parts.filter(filled).join(', ');
}

/** 'AAAA-MM-JJ' -> 'JJ/MM/AAAA' (sans passer par Date : pas de décalage de fuseau). */
export function formatIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** « Samsar — Karim (01/10/2026) » ; '' si aucun canal. */
export function describeAcquisition(client) {
  const label = ACQUISITION_CHANNEL_LABELS[client?.acquisition_channel];
  if (!label) return '';
  let text = label;
  if (filled(client.acquisition_referrer)) text += ` — ${client.acquisition_referrer.trim()}`;
  const date = formatIsoDate(client.acquisition_date);
  if (date) text += ` (${date})`;
  return text;
}

const SEARCH_FIELDS = [
  'name', 'first_name', 'last_name', 'maiden_name', 'phone', 'whatsapp', 'cin', 'email',
  'city_morocco', 'city_abroad', 'country_abroad',
];

/** Recherche locale (insensible à la casse) sur les mêmes champs que l'API. */
export function matchesClientSearch(client, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return SEARCH_FIELDS.some((f) => String(client?.[f] ?? '').toLowerCase().includes(q));
}
