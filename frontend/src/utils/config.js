/**
 * Application configuration
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const APP_CONFIG = {
  name: 'LotisPro',
  version: '2.0',
  defaultReservationDays: 7,
  alertThresholdDays: 3,
};
