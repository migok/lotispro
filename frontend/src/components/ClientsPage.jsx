import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Amount } from './ui/amount';
import { Button } from './ui/button';
import { DataTable } from './ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { EmptyState } from './ui/empty-state';
import { LoadingSkeleton } from './ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { StatTile } from './ui/stat-tile';
import { useAuth } from '../contexts/authHooks';
import { useToast } from '../contexts/toastHooks';
import { apiGet, apiPost } from '../utils/api';
import { CLIENT_TYPES, PIPELINE_LABELS } from '../utils/constants';
import { shouldToastClientError } from '../utils/clientProfile';
import ClientForm from './clients/ClientForm';
import { PIPELINE_FILTERS, countByPipeline, filterByPipeline, filterBySearchAndType, portfolioTotals } from './clients/portfolioFilters';
import '../styles/clients.css';

const TYPE_LABELS = Object.fromEntries(CLIENT_TYPES.map((type) => [type.value, type.label]));
const plural = (count) => `${count} client${count > 1 ? 's' : ''}`;

export default function ClientsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const type = params.get('type') || '';
  const pipeline = params.get('pipeline') || '';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview] = useState(null);
  const previewTrigger = useRef(null);
  const createTrigger = useRef(null);
  const openCreate = (event) => { createTrigger.current = event.currentTarget; setShowModal(true); };

  const loadClients = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await apiGet('/api/dashboard/clients-pipeline');
      if (!Array.isArray(data)) throw new Error('Invalid clients response');
      setClients(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) loadClients(); }, [token, loadClients]);

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  };
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });

  const handleCreate = async (payload) => {
    try {
      await apiPost('/api/clients', payload);
    } catch (err) {
      if (shouldToastClientError(err)) toast.error(err.message || 'Erreur lors de la création');
      throw err;
    }
    toast.success('Client créé avec succès');
    setShowModal(false);
    loadClients();
  };

  const totals = useMemo(() => portfolioTotals(clients), [clients]);
  const base = useMemo(() => filterBySearchAndType(clients, { q, type }), [clients, q, type]);
  const counts = useMemo(() => countByPipeline(base), [base]);
  const total = PIPELINE_FILTERS.reduce((sum, { key }) => sum + counts[key], 0);
  const rows = useMemo(() => filterByPipeline(base, pipeline), [base, pipeline]);
  const hasFilters = Boolean(q || type || pipeline);
  const portfolioSearch = location.search;

  const columns = useMemo(() => [
    { key: 'name', header: 'Client', sortable: true, render: (_, c) => <div className="clients-name">
      <Link to={`/app/clients/${c.id}`} state={{ portfolioSearch }}>{c.name}</Link>
      {TYPE_LABELS[c.client_type] && <span className="clients-meta">{TYPE_LABELS[c.client_type]}</span>}
    </div> },
    { key: 'pipeline_status', header: 'Pipeline', sortable: true, render: (value) => PIPELINE_LABELS[value] || value || '—' },
    { key: 'phone', header: 'Téléphone', render: (value) => value ? <a href={`tel:${value}`}>{value}</a> : '—' },
    { key: 'active_reservations', header: 'Réservations', sortable: true, align: 'right', render: (value) => value || 0 },
    { key: 'total_sales', header: 'Achats', sortable: true, align: 'right', render: (value) => value || 0 },
    { key: 'total_deposit', header: 'Acomptes', sortable: true, align: 'right', render: (value) => <Amount value={value || 0} /> },
    { key: 'total_purchases', header: 'Total des achats', sortable: true, align: 'right', render: (value) => <Amount value={value || 0} /> },
    { key: 'actions', header: 'Aperçu', render: (_, c) => <Button variant="ghost" size="sm" aria-label={`Aperçu de ${c.name}`} onClick={(event) => { previewTrigger.current = event.currentTarget; setPreview(c); }}>Aperçu</Button> },
  ], [portfolioSearch]);

  let body;
  if (loading) {
    body = <LoadingSkeleton label="Chargement des clients" rows={4} />;
  } else if (failed) {
    body = <div role="alert" className="clients-error"><span>Impossible de charger les clients</span><Button variant="secondary" onClick={loadClients}>Réessayer</Button></div>;
  } else if (!clients.length) {
    body = <EmptyState title="Aucun client enregistré" description="Ajoutez votre premier client pour suivre son parcours."
      action={<Button onClick={openCreate}>Ajouter le premier client</Button>} />;
  } else {
    body = <>
      <div className="clients-kpis">
        <StatTile label="Réservations actives" value={totals.reservations} />
        <StatTile label="Acomptes versés" value={totals.deposits} currency />
        <StatTile label="Total des achats" value={totals.purchases} currency />
      </div>
      <div className="clients-toolbar">
        <label className="clients-field">Rechercher un client
          <input type="search" value={q} placeholder="Nom, téléphone ou CIN" onChange={(event) => setFilter('q', event.target.value)} />
        </label>
        <label className="clients-field">Type de client
          <select value={type} onChange={(event) => setFilter('type', event.target.value)}>
            <option value="">Tous les types</option>
            {CLIENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {hasFilters && rows.length > 0 && <Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>}
      </div>
      {total > 0 && <div className="clients-pipeline-bar" aria-hidden="true">
        {PIPELINE_FILTERS.filter(({ key }) => counts[key] > 0).map(({ key }) => <div key={key} data-pipeline={key}
          className={`clients-pipeline-segment is-${key}${pipeline === key ? ' is-selected' : ''}${pipeline && pipeline !== key ? ' is-dimmed' : ''}`}
          style={{ width: `${(counts[key] / total) * 100}%` }} onClick={() => setFilter('pipeline', pipeline === key ? '' : key)} />)}
      </div>}
      <div className="clients-pipeline">
        {PIPELINE_FILTERS.map(({ key, label }) => <Button key={key} variant="outline" size="sm" aria-pressed={pipeline === key}
          aria-label={`${label} : ${plural(counts[key])}`} onClick={() => setFilter('pipeline', pipeline === key ? '' : key)}>
          {label} <span className="clients-count">{counts[key]}</span>
        </Button>)}
      </div>
      {rows.length === 0
        ? <EmptyState title="Aucun client pour ces critères" description="Modifiez la recherche ou les filtres."
          action={<Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>} />
        : <DataTable caption="Portefeuille clients" columns={columns} data={rows} pageSize={15} resetKey={`${q}|${type}|${pipeline}`} />}
    </>;
  }

  return <div className="clients-page page-container">
    <div className="clients-header">
      <div>
        <p className="clients-eyebrow">Portefeuille</p>
        <h1>Clients</h1>
      </div>
      <Button onClick={openCreate}>Nouveau client</Button>
    </div>
    {body}
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); createTrigger.current?.focus(); }}>
        <DialogTitle>Créer un client</DialogTitle>
        <DialogDescription>Renseignez les informations du nouveau contact.</DialogDescription>
        <ClientForm onSubmit={handleCreate} onCancel={() => setShowModal(false)} submitLabel="Créer le client" />
      </DialogContent>
    </Dialog>
    <Sheet open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <SheetContent onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); previewTrigger.current?.focus(); }}>
        {preview && <>
          <SheetTitle>{preview.name}</SheetTitle>
          <SheetDescription>{PIPELINE_LABELS[preview.pipeline_status] || 'Aperçu du client'}</SheetDescription>
          <div className="clients-preview">
            <dl>
              <dt>CIN</dt><dd>{preview.cin || '—'}</dd>
              <dt>Téléphone</dt><dd>{preview.phone ? <a href={`tel:${preview.phone}`}>{preview.phone}</a> : '—'}</dd>
              <dt>E-mail</dt><dd>{preview.email ? <a href={`mailto:${preview.email}`}>{preview.email}</a> : '—'}</dd>
              <dt>Acomptes versés</dt><dd><Amount value={preview.total_deposit || 0} compact={false} /></dd>
              <dt>Total des achats</dt><dd><Amount value={preview.total_purchases || 0} compact={false} /></dd>
            </dl>
            <Link to={`/app/clients/${preview.id}`} state={{ portfolioSearch }}>Ouvrir la fiche client</Link>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  </div>;
}
