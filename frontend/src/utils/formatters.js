/** Display formatting only; API values and financial calculations are unchanged. */
const missing = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value));
const numberText = (value, options) => new Intl.NumberFormat('fr-MA', options)
  .formatToParts(value).map(({ type, value: part }) => type === 'group' ? ' ' : type === 'decimal' ? ',' : part)
  .join('').replace(/[\u00a0\u202f]/g, ' ');

/** One amount formatter. Compact display is reserved for tiles/axes. */
export const formatAmount = (amount, { compact = false, maximumFractionDigits = 2 } = {}) => {
  if (missing(amount)) return '—';
  const value = Number(amount);
  if (compact) return `${numberText(value, { notation: 'compact', maximumFractionDigits: 1 })} MAD`;
  const rounded = Math.round(value * 100) / 100;
  const decimals = maximumFractionDigits > 0 && !Number.isInteger(rounded) ? 2 : 0;
  return `${numberText(Object.is(rounded, -0) ? 0 : rounded, { minimumFractionDigits: decimals, maximumFractionDigits })} MAD`;
};
export const formatPrice = (amount) => formatAmount(amount, { maximumFractionDigits: 0 });
export const formatMad = (amount) => formatAmount(amount);
export const formatCompactPrice = (amount) => formatAmount(amount, { compact: true });

/** A date-only value keeps its calendar day in every timezone. */
export const formatDate = (value, options = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const config = typeof options === 'boolean'
    ? { day: '2-digit', month: 'short', year: 'numeric', ...(options ? { hour: '2-digit', minute: '2-digit' } : {}) }
    : options;
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat('fr-FR', { ...config, ...(dateOnly ? { timeZone: 'UTC' } : {}) })
    .format(date).replace(', ', ' ');
};
export const formatNumber = (value, suffix = '') => {
  if (suffix === 'MAD') return formatCompactPrice(value);
  if (missing(value)) return '—';
  return `${numberText(Number(value), { notation: 'compact', maximumFractionDigits: 1 })}${suffix ? ` ${suffix}` : ''}`;
};

export const formatSurface = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
};
