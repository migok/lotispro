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
