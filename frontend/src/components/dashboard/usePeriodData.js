import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../utils/api';
import { periodParams } from './period';

const EMPTY = { key: null, stats: null, performance: null, error: null };

/**
 * Period KPIs (`/api/dashboard/stats`) and series (`/api/dashboard/performance`)
 * for a project, an optional commercial and a period, fetched in parallel.
 *
 * Responses of superseded requests are ignored (request id ref), so a slow
 * answer for an old period never overwrites the current one. `loading` is
 * derived: true until the response for the current inputs has arrived.
 */
export default function usePeriodData({ projectId, userId, period }) {
  const { dateFrom, dateTo } = period;
  const key = JSON.stringify([projectId ?? null, userId ?? null, dateFrom, dateTo]);
  const [result, setResult] = useState(EMPTY);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const params = periodParams({ dateFrom, dateTo });
    if (projectId) params.append('project_id', projectId);
    if (userId) params.append('user_id', userId);
    const query = params.toString();

    Promise.all([
      apiGet(`/api/dashboard/stats?${query}`),
      apiGet(`/api/dashboard/performance?${query}`),
    ])
      .then(([stats, performance]) => {
        if (id !== requestId.current) return;
        setResult({ key, stats, performance, error: null });
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        setResult({
          key,
          stats: null,
          performance: null,
          error: error?.message || 'Erreur lors du chargement des indicateurs de la période',
        });
      });
  }, [key, projectId, userId, dateFrom, dateTo]);

  const loading = result.key !== key;
  return {
    stats: loading ? null : result.stats,
    performance: loading ? null : result.performance,
    loading,
    error: loading ? null : result.error,
  };
}
