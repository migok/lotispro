/**
 * Utility functions for formatting data
 */

/**
 * Format price with MAD currency
 * @param {number} price - Price to format
 * @returns {string} Formatted price
 */
export const formatPrice = (price) => {
  if (!price) return '0 MAD';
  return new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(price) + ' MAD';
};

/**
 * Amount in MAD with the same format as the backend `format_mad` (E4-T5 screens):
 * regular-space thousands separator, comma + 2 decimals only when the cents are
 * not zero — « 400 000 MAD », « 116 666,67 MAD », « 0,40 MAD ». Rounded to the cent.
 * @param {number|string|null} amount
 * @returns {string} Formatted amount, or « — » when missing
 */
export const formatMad = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) return '—';
  const abs = Math.abs(cents);
  const units = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const rest = abs % 100;
  const text = rest ? `${units},${String(rest).padStart(2, '0')}` : units;
  return `${cents < 0 ? '-' : ''}${text} MAD`;
};

/**
 * Format price with K/M suffix for compact display
 * @param {number} price - Price to format
 * @returns {string} Formatted price with suffix
 */
export const formatCompactPrice = (price) => {
  if (!price) return '0 MAD';

  if (price >= 1000000) {
    const millions = price / 1000000;
    return millions.toFixed(1).replace(/\.0$/, '') + 'M MAD';
  }

  if (price >= 1000) {
    const thousands = price / 1000;
    return thousands.toFixed(1).replace(/\.0$/, '') + 'K MAD';
  }

  return Math.round(price) + ' MAD';
};

/**
 * Format date in French locale
 * @param {string} dateString - ISO date string
 * @param {boolean} includeTime - Include time in output
 * @returns {string} Formatted date
 */
export const formatDate = (dateString, includeTime = false) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return date.toLocaleDateString('fr-FR', options);
};

/**
 * Format number with K/M suffix
 * @param {number} num - Number to format
 * @param {string} suffix - Optional suffix (e.g., 'MAD')
 * @returns {string} Formatted number
 */
export const formatNumber = (num, suffix = '') => {
  if (!num || num === 0) return `0${suffix ? ' ' + suffix : ''}`;

  const absNum = Math.abs(num);

  if (absNum >= 1000000) {
    const formatted = (num / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M${suffix ? ' ' + suffix : ''}`;
  }

  if (absNum >= 1000) {
    const formatted = (num / 1000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}K${suffix ? ' ' + suffix : ''}`;
  }

  return `${Math.round(num)}${suffix ? ' ' + suffix : ''}`;
};
