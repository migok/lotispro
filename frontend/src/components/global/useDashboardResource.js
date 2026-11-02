import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../utils/api';
import { STATUS_LABELS } from '../../utils/constants';
const PENDING = { data: null, loading: true, error: null };
/** Each block owns its errors and retries; obsolete requests cannot cross URL/retry boundaries. */
export default function useDashboardResource(url, validate, revision = 0) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${url}:${revision}:${attempt}`;
  useEffect(() => {
    let active = true;
    if (!url) return;
    Promise.resolve().then(() => apiGet(url)).then((raw) => {
      const data = validate(raw);
      if (active) setResult({ key, data, loading: false, error: null });
    }).catch(() => {
      if (active) setResult({ key, data: null, loading: false, error: true });
    });
    return () => { active = false; };
  }, [url, key, validate]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...(url && result?.key === key ? result : PENDING), retry };
}
export const listResponse = (value) => {
  if (!Array.isArray(value)) throw new Error('Invalid list');
  return value;
};
export const statsResponse = (value) => {
  if (!value || Array.isArray(value) || !value.counts
    || ['total', ...Object.keys(STATUS_LABELS)].some((key) => !Number.isFinite(value.counts[key]) || value.counts[key] < 0)
    || !Number.isFinite(value.ca_realise)) throw new Error('Invalid stats');
  return value;
};
export const alertsResponse = (value) => listResponse(value?.reservations);
export const paymentsResponse = (value) => {
  const rows = listResponse(value);
  if (rows.some((r) => !Number.isFinite(r.amount))) throw new Error('Invalid amount');
  return rows;
};
export const projectKpisResponse = (value) => {
  if (!Number.isFinite(value?.available_lots) || !Number.isFinite(value?.taux_vente)) throw new Error('Invalid project KPIs');
  return value;
};
export const performanceResponse = (value) => {
  listResponse(value?.series);
  if (value.series.some((b) => !b.key || !Number.isFinite(b.lots_vendus) || !Number.isFinite(b.reservations_creees))) throw new Error('Invalid series');
  return value;
};
