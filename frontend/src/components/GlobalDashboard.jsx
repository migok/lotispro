import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/authHooks';
import { formatAmount, formatDate } from '../utils/formatters';
import { formatPercentNumber } from './dashboard/period';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { StatTile } from './ui/stat-tile';
import { LoadingSkeleton } from './ui/skeleton';
import { EmptyState } from './ui/empty-state';
import CreateProjectModal from './CreateProjectModal';
import useDashboardResource, { alertsResponse, listResponse, paymentsResponse, projectKpisResponse, statsResponse } from './global/useDashboardResource';
import ResourceError from './global/ResourceError';
import TreatmentPanel from './global/TreatmentPanel';
import StockPanel from './global/StockPanel';
import CommercialTrend from './global/CommercialTrend';
import DashboardLot from './global/DashboardLot';
import '../styles/global-dashboard.css';

function ProjectRow({ project, userId, revision }) {
  const query = userId ? `?user_id=${userId}` : '';
  const result = useDashboardResource(`/api/projects/${project.id}/kpis${query}`, projectKpisResponse, revision);
  return <li className="global-project-row">
    <Link to={`/app/projects/${project.id}`} className="global-project-name">{project.name}</Link>
    <span className="global-meta">{project.total_lots} lots</span>
    {result.loading ? <span className="global-meta" aria-busy="true">—</span> : result.error ? <ResourceError label="Stock indisponible" onRetry={result.retry} /> : <>
      <span className="global-available">{result.data.available_lots} disponibles</span>
      <span>{formatPercentNumber(result.data.taux_vente)} % vendus</span>
      <span className="global-project-ca">{formatAmount(result.data.ca_realise)}</span>
    </>}
  </li>;
}

export default function GlobalDashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const userId = !isManager ? user?.id : null;
  const scope = userId ? `?user_id=${userId}` : '';
  const identity = `${user?.id}:${user?.role}`;
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  const [params, setParams] = useSearchParams();
  const projects = useDashboardResource('/api/projects', listResponse, identity);
  const stats = useDashboardResource(`/api/dashboard/stats${scope}`, statsResponse, identity);
  const alerts = useDashboardResource(`/api/dashboard/alerts?days=7${userId ? `&user_id=${userId}` : ''}`, alertsResponse, identity);
  const payments = useDashboardResource('/api/dashboard/late-payments', paymentsResponse, identity);
  const options = useDashboardResource('/api/dashboard/options-tracking', listResponse, identity);
  const notaires = useDashboardResource(`/api/dashboard/notaire-alerts${scope}`, listResponse, identity);
  const data = stats.data;
  const lateTotal = payments.data?.reduce((sum, row) => sum + row.amount, 0);
  const refresh = () => { setRevision((n) => n + 1); for (const resource of [projects, stats, alerts, payments, options, notaires]) resource.retry(); };
  const closeLot = () => { const next = new URLSearchParams(params); next.delete('lot'); setParams(next, { replace: true }); };
  return <div className="global-dashboard">
    <header className="global-header">
      <div><p className="global-eyebrow">{isManager ? 'Vue globale' : 'Mon activité'} · {formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}</p><h1>Tableau de bord</h1></div>
      {isManager && <Button onClick={() => setCreating(true)}><span aria-hidden="true">+</span> Nouveau projet</Button>}
    </header>
    <section aria-label="Indicateurs actuels" className="global-kpi-region">
      <div className="global-kpis">
        <StatTile label="CA réalisé" value={data?.ca_realise} currency loading={stats.loading} baseline={data ? `${formatAmount(data.ca_potentiel, { compact: true })} potentiel` : undefined} description={data ? `CA potentiel : ${formatAmount(data.ca_potentiel)}. Cumul actuel calculé par le serveur.` : 'Cumul actuel calculé par le serveur.'} />
        <StatTile label="Stock disponible" value={data?.counts?.available} loading={stats.loading} baseline={data?.percentages?.available != null ? `${formatPercentNumber(data.percentages.available)} % de ${data.counts.total} lots` : undefined} />
        <StatTile label="Taux de vente" value={data?.taux_vente != null ? `${formatPercentNumber(data.taux_vente)} %` : null} loading={stats.loading} description="Taux actuel calculé par le serveur." />
        <StatTile label="Retards de paiement" value={payments.data?.length} loading={payments.loading} baseline={lateTotal != null ? `${formatAmount(lateTotal)} en retard` : undefined} />
      </div>
      {stats.error && <ResourceError label="Indicateurs indisponibles" onRetry={stats.retry} />}
      {payments.error && <ResourceError label="Retards de paiement indisponibles" onRetry={payments.retry} />}
    </section>
    <div className="global-workspace">
      <TreatmentPanel options={options} alerts={alerts} payments={payments} notaires={notaires} />
      <StockPanel key={identity} stats={stats} userId={userId} projects={projects.data} />
    </div>
    <Card aria-label="Projets">
      <CardHeader className="global-section-heading"><CardTitle>Projets{projects.data && <span className="global-count">{projects.data.length}</span>}</CardTitle><Link to="/app/projects" className="global-text-link">Tous les projets</Link></CardHeader>
      <CardContent>
        {projects.loading ? <LoadingSkeleton label="Chargement des projets" rows={3} /> : projects.error ? <ResourceError label="Projets indisponibles" onRetry={projects.retry} /> : !projects.data.length ? <EmptyState title="Aucun projet" description={isManager ? 'Créez votre premier projet pour commencer.' : 'Aucun projet ne vous est encore assigné.'} /> : <><ul className="global-projects">{projects.data.slice(0, 6).map((p) => <ProjectRow key={p.id} project={p} userId={userId} revision={`${identity}:${revision}`} />)}</ul>{projects.data.length > 6 && <p className="global-meta">6 sur {projects.data.length} projets · <Link to="/app/projects">Voir tous les projets</Link></p>}</>}
      </CardContent>
    </Card>
    <CommercialTrend userId={userId} revision={`${identity}:${revision}`} />
    {creating && <CreateProjectModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
    {params.get('lot') && <DashboardLot key={`${identity}:${params.get('lot')}`} lotId={params.get('lot')} onClose={closeLot} onRefresh={refresh} />}
  </div>;
}
