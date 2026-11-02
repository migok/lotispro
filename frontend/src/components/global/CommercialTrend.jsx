import { lazy, Suspense, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { LoadingSkeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { DataTable } from '../ui/data-table';
import { StatTile } from '../ui/stat-tile';
import PeriodPicker from '../dashboard/PeriodPicker';
import { businessToday, shortcutRange, periodParams, bucketLabel, formatVariation, formatFlowUnavailableNotice } from '../dashboard/period';
import useDashboardResource, { statsResponse, performanceResponse } from './useDashboardResource';
import ResourceError from './ResourceError';

const TrendChart = lazy(() => import('./TrendChart'));
export default function CommercialTrend({ userId, revision }) {
  const [period, setPeriod] = useState(() => shortcutRange('month', businessToday()));
  const params = periodParams(period);
  if (userId) params.set('user_id', userId);
  const stats = useDashboardResource(`/api/dashboard/stats?${params}`, statsResponse, revision);
  const performance = useDashboardResource(`/api/dashboard/performance?${params}`, performanceResponse, revision);
  const loading = stats.loading || performance.loading;
  const unavailable = stats.data?.flow_kpis_available === false;
  const series = performance.data?.series ?? [];
  const flow = stats.data?.flow;
  return <Card aria-label="Évolution commerciale" className="global-trend">
    <CardHeader><CardTitle>Évolution commerciale</CardTitle></CardHeader>
    <CardContent>
      <PeriodPicker value={period} onChange={setPeriod} />
      {stats.error && <ResourceError label="Indicateurs de période indisponibles" onRetry={stats.retry} />}
      {performance.error && <ResourceError label="Évolution indisponible" onRetry={performance.retry} />}
      {loading ? <LoadingSkeleton label="Chargement de l’évolution commerciale" rows={4} /> : !stats.error && !performance.error && <>
        {unavailable && <p className="global-history-notice" role="status">{formatFlowUnavailableNotice(stats.data.history_start)}</p>}
        <div className="global-period-kpis">
          <StatTile label="Lots vendus sur la période" value={unavailable ? null : flow?.lots_vendus} baseline={flow && !unavailable ? `${formatVariation(stats.data.variations?.lots_vendus).text} · période précédente` : undefined} />
          <StatTile label="Réservations créées" value={flow?.reservations_creees} baseline={flow ? `${formatVariation(stats.data.variations?.reservations_creees).text} · période précédente` : undefined} />
        </div>
        {!series.length || !series.some((r) => r.reservations_creees || (!unavailable && r.lots_vendus)) ? <EmptyState title="Aucune activité sur cette période" /> : <Suspense fallback={<LoadingSkeleton label="Chargement du graphique" rows={4} />}><TrendChart series={series} salesAvailable={!unavailable} /></Suspense>}
        {series.length > 0 && <details className="global-series-details"><summary>Voir les données du graphique</summary><DataTable caption="Évolution commerciale par période" data={series} getRowKey={(r) => r.key} columns={[
          { key: 'key', header: 'Période', render: bucketLabel },
          ...(!unavailable ? [{ key: 'lots_vendus', header: 'Lots vendus', align: 'right' }] : []),
          { key: 'reservations_creees', header: 'Réservations créées', align: 'right' },
        ]} /></details>}
      </>}
    </CardContent>
  </Card>;
}
