import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { LoadingSkeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { formatAmount, formatDate } from '../../utils/formatters';
import { treatmentRows } from '../../utils/deadlines';
import { DeadlineBadge } from '../ui/deadline-badge';
import ResourceError from './ResourceError';

export default function TreatmentPanel({ options, alerts, payments, notaires }) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState('all');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const sources = [options, alerts, payments, notaires];
  const loading = sources.some((r) => r.loading);
  const incomplete = sources.some((r) => r.error);
  const rows = treatmentRows({ options: options.data ?? [], alerts: alerts.data ?? [], payments: payments.data ?? [], notaires: notaires.data ?? [] }, now);
  const filtered = kind === 'all' ? rows : rows.filter((r) => r.kind === kind);
  const visible = expanded ? filtered : filtered.slice(0, 5);
  return <Card aria-label="À traiter" className="global-treatment">
    <CardHeader className="global-section-heading"><CardTitle>À traiter</CardTitle><span className="global-count">{(incomplete || loading) && !rows.length ? '—' : rows.length} dossiers{(incomplete || loading) && rows.length > 0 ? ' connus' : ''}</span></CardHeader>
    <CardContent>
      <div className="global-filters" role="group" aria-label="Type de dossier">
        {[['all', 'Tous'], ['expiration', 'Échéances'], ['payment', 'Paiements'], ['notaire', 'Notaire']].map(([key, label]) => <Button key={key} size="sm" variant={kind === key ? 'secondary' : 'ghost'} aria-pressed={kind === key} onClick={() => { setKind(key); setExpanded(false); }}>{label}</Button>)}
      </div>
      {incomplete && <div className="global-partial"><strong>Liste incomplète</strong>{[['Échéances', options], ['Réservations à risque', alerts], ['Paiements', payments], ['Notaire', notaires]].filter(([, resource]) => resource.error).map(([label, resource]) => <ResourceError key={label} label={`${label} indisponibles`} onRetry={resource.retry} />)}</div>}
      {loading && <LoadingSkeleton label="Chargement des dossiers à traiter" rows={2} />}
      {!loading && !incomplete && !filtered.length && <EmptyState title={kind === 'all' ? 'Aucun dossier à traiter' : 'Aucun dossier dans cette catégorie'} />}
      <ul className="global-deadlines">{visible.map((row) => <li key={row.id} className="global-deadline" data-urgency={row.urgency.level}>
        <div className="global-deadline-top"><span className="global-deadline-type">{row.type}</span><DeadlineBadge date={row.due} now={now} /></div>
        <div className="global-deadline-main"><Link to={`/app/dashboard?lot=${row.lot_id}`} aria-label={`Ouvrir le lot ${row.lot_numero}`}>Lot {row.lot_numero}<span aria-hidden="true"> ↗</span></Link><span>{row.kind === 'payment' ? formatAmount(row.amount) : formatDate(row.due)}</span></div>
        <div className="global-deadline-meta"><span>{[row.project_name, row.client_name].filter(Boolean).join(' · ')}</span>{row.client_phone && <a href={`tel:${row.client_phone}`} aria-label={`Téléphoner à ${row.client_name}`}>{row.client_phone}</a>}</div>
      </li>)}</ul>
      {filtered.length > 5 && <Button variant="ghost" className="global-show-all" onClick={() => setExpanded(!expanded)}>{expanded ? 'Réduire la liste' : `Voir tout (${filtered.length})`}</Button>}
    </CardContent>
  </Card>;
}
