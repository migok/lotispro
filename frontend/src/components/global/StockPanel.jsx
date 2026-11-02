import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABELS, STATUS_COLORS, STATUS_PHASES } from '../../utils/constants';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet';
import { DataTable } from '../ui/data-table';
import { LoadingSkeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { InfoTip } from '../ui/info-tip';
import useDashboardResource, { listResponse } from './useDashboardResource';
import ResourceError from './ResourceError';

const GROUPS = [
  ['Stock', ['creation', 'available', 'blocked']],
  ['Commercial', STATUS_PHASES.commercial], ['Financier', STATUS_PHASES.financier],
  ['État des lieux', STATUS_PHASES.edl], ['Notaire', ['chez_notaire']], ['Livré', ['chez_proprietaire']],
];
function FilteredLots({ status, rows, loading, onClose, projects }) {
  return <DataTable caption={`Lots : ${STATUS_LABELS[status]}`} data={rows} loading={loading} getRowKey={(r) => r.id} columns={[
    { key: 'numero', header: 'Lot', sortable: true, render: (v, row) => <Link onClick={onClose} to={`/app/dashboard?lot=${row.id}`}>Lot {v}</Link> },
    { key: 'project_id', header: 'Projet', render: (id) => projects?.find((p) => p.id === id)?.name ?? `Projet ${id}` },
    { key: 'client_name', header: 'Client', sortable: true },
  ]} />;
}
const STOCK_STATUSES = new Set(['creation', 'available', 'blocked']);
const uniqueLots = (rows) => [...new Map((rows ?? []).map((row) => [row.id, row])).values()];
export default function StockPanel({ stats, userId, projects, revision = 0 }) {
  const [selected, setSelected] = useState(null);
  const global = useDashboardResource('/api/dashboard/lots', listResponse, revision);
  const personal = useDashboardResource(userId ? `/api/dashboard/lots?user_id=${userId}` : null, listResponse, revision);
  const loading = global.loading || Boolean(userId && personal.loading);
  const failed = global.error || (userId && personal.error);
  const globalRows = uniqueLots(global.data);
  const pipelineRows = userId ? uniqueLots(personal.data) : globalRows;
  // Counts and opened lists share these exact rows, including deduplication of the legacy join.
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status,
    (STOCK_STATUSES.has(status) ? globalRows : pipelineRows).filter((row) => row.status === status),
  ]));
  const counts = Object.fromEntries(Object.entries(byStatus).map(([status, rows]) => [status, rows.length]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return <Card aria-label="Répartition des lots" className="global-stock">
    <CardHeader className="global-section-heading"><CardTitle>Répartition des lots</CardTitle><span className="global-meta">{loading || failed ? '—' : `${total} lots${userId ? ' visibles' : ''}`}</span>{userId && <InfoTip text="En création, disponibles et bloqués : stock global. Autres statuts : votre pipeline personnel." />}</CardHeader>
    <CardContent>
      {loading ? <LoadingSkeleton label="Chargement de la répartition" rows={5} /> : failed ? <>{global.error && <ResourceError label="Stock indisponible" onRetry={global.retry} />}{personal.error && <ResourceError label="Pipeline indisponible" onRetry={personal.retry} />}</> : total === 0 ? <EmptyState title="Aucun lot" /> : <>
        <div className="global-stock-bar" aria-hidden="true">{GROUPS.flatMap(([, statuses]) => statuses).filter((s) => counts[s] > 0).map((status) => <span key={status} style={{ width: `${counts[status] / total * 100}%`, background: STATUS_COLORS[status] }} />)}</div>
        <div className="global-stock-groups">{GROUPS.map(([group, statuses]) => <div key={group}><h3>{group}</h3><ul>{statuses.map((status) => <li key={status}><Button variant="ghost" size="sm" onClick={() => setSelected(status)} aria-label={`${STATUS_LABELS[status]} : ${counts[status] ?? '—'}, afficher les lots`}><span className="global-dot" style={{ background: STATUS_COLORS[status] }} /><span>{STATUS_LABELS[status]}</span><strong>{counts[status] ?? '—'}</strong></Button></li>)}</ul></div>)}</div>
        <div className="global-stock-footer"><span>Lots libérés</span><strong>{stats.data?.lots_liberes ?? '—'}</strong></div>
      </>}
    </CardContent>
    <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><SheetContent className="global-stock-sheet"><SheetTitle>Lots : {STATUS_LABELS[selected]}</SheetTitle><SheetDescription>{userId && !STOCK_STATUSES.has(selected) ? 'Votre pipeline' : 'Stock global'} · {STATUS_LABELS[selected]}</SheetDescription>{selected && <FilteredLots status={selected} rows={byStatus[selected]} loading={loading} projects={projects} onClose={() => setSelected(null)} />}</SheetContent></Sheet>
  </Card>;
}
