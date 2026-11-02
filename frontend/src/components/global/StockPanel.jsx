import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABELS, STATUS_COLORS, STATUS_PHASES } from '../../utils/constants';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet';
import { DataTable } from '../ui/data-table';
import { LoadingSkeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import useDashboardResource, { listResponse } from './useDashboardResource';
import ResourceError from './ResourceError';

const GROUPS = [
  ['Stock', ['creation', 'available', 'blocked']],
  ['Commercial', STATUS_PHASES.commercial], ['Financier', STATUS_PHASES.financier],
  ['État des lieux', STATUS_PHASES.edl], ['Notaire', ['chez_notaire']], ['Livré', ['chez_proprietaire']],
];
function FilteredLots({ status, userId, onClose, projects }) {
  const result = useDashboardResource(`/api/dashboard/lots${userId ? `?user_id=${userId}` : ''}`, listResponse);
  const rows = result.data?.filter((r) => r.status === status) ?? [];
  return <DataTable caption={`Lots : ${STATUS_LABELS[status]}`} data={rows} loading={result.loading} error={result.error ? 'Lots indisponibles' : null} onRetry={result.retry} getRowKey={(r) => r.id} columns={[
    { key: 'numero', header: 'Lot', sortable: true, render: (v, row) => <Link onClick={onClose} to={`/app/dashboard?lot=${row.id}`}>Lot {v}</Link> },
    { key: 'project_id', header: 'Projet', render: (id) => projects?.find((p) => p.id === id)?.name ?? `Projet ${id}` },
    { key: 'client_name', header: 'Client', sortable: true },
  ]} />;
}
export default function StockPanel({ stats, userId, projects }) {
  const [selected, setSelected] = useState(null);
  const counts = stats.data?.counts;
  const total = counts?.total;
  return <Card aria-label="Répartition des lots" className="global-stock">
    <CardHeader className="global-section-heading"><CardTitle>Répartition des lots</CardTitle><span className="global-meta">{total != null ? `${total} lots` : '—'}</span></CardHeader>
    <CardContent>
      {stats.loading ? <LoadingSkeleton label="Chargement de la répartition" rows={5} /> : stats.error ? <ResourceError label="Répartition indisponible" onRetry={stats.retry} /> : total === 0 ? <EmptyState title="Aucun lot" /> : <>
        <div className="global-stock-bar" aria-hidden="true">{GROUPS.flatMap(([, statuses]) => statuses).filter((s) => counts[s] > 0).map((status) => <span key={status} style={{ width: `${counts[status] / total * 100}%`, background: STATUS_COLORS[status] }} />)}</div>
        <div className="global-stock-groups">{GROUPS.map(([group, statuses]) => <div key={group}><h3>{group}</h3><ul>{statuses.map((status) => <li key={status}><Button variant="ghost" size="sm" onClick={() => setSelected(status)} aria-label={`${STATUS_LABELS[status]} : ${counts[status] ?? '—'}, afficher les lots`}><span className="global-dot" style={{ background: STATUS_COLORS[status] }} /><span>{STATUS_LABELS[status]}</span><strong>{counts[status] ?? '—'}</strong></Button></li>)}</ul></div>)}</div>
        <div className="global-stock-footer"><span>Lots libérés</span><strong>{stats.data.lots_liberes ?? '—'}</strong></div>
      </>}
    </CardContent>
    <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><SheetContent className="global-stock-sheet"><SheetTitle>Lots : {STATUS_LABELS[selected]}</SheetTitle><SheetDescription>Stock actuel · {STATUS_LABELS[selected]}</SheetDescription>{selected && <FilteredLots status={selected} userId={userId} projects={projects} onClose={() => setSelected(null)} />}</SheetContent></Sheet>
  </Card>;
}
