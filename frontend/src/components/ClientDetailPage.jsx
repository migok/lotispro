import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/toastHooks';
import { apiGet, apiPost, apiPut, apiFetch, buildApiError } from '../utils/api';
import { useAuth } from '../contexts/authHooks';
import { formatPrice, formatDate, formatSurface } from '../utils/formatters';
import ClientForm from './clients/ClientForm';
import NotificationHistory from './notifications/NotificationHistory';
import PaymentsPanel from './lots/PaymentsPanel';
import { acteThresholdMessage, getFinancialSummary } from '../services/reservationFinanceService';
import {
  NOTIFICATION_CHANNEL_LABELS,
  acteAddressOf,
  describeAcquisition,
  shouldToastClientError,
} from '../utils/clientProfile';

/* ── Label maps ─────────────────────────────────────────────── */
const CLIENT_TYPE_LABELS = {
  proprietaire: 'Propriétaire',
  revendeur: 'Revendeur',
  investisseur: 'Investisseur',
  autre: 'Autre',
};

const RESERVATION_STATUS = {
  active:    { label: 'Active',    cls: 'badge-gold' },
  validated: { label: 'Validée',   cls: 'badge-green' },
  converted: { label: 'Vendu',     cls: 'badge-red' },
  released:  { label: 'Libérée',   cls: 'badge-gray' },
  expired:   { label: 'Expirée',   cls: 'badge-red' },
};

/* ── SVG Icons ──────────────────────────────────────────────── */
const IconPhone = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" />
  </svg>
);

const IconMail = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="16" height="13" rx="1.5" />
    <path d="M2 7l8 5.5L18 7" />
  </svg>
);

const IconCalendar = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13" style={{ flexShrink: 0 }}>
    <rect x="3" y="4" width="14" height="13" rx="1.5" />
    <path d="M3 8h14M7 3v2M13 3v2" />
  </svg>
);

const IconCard = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 9h16M6 13h3" />
  </svg>
);

const IconEdit = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 3.5l2 2-9 9-2.5.5.5-2.5 9-9zM13 5l2 2" />
  </svg>
);

const IconChevronLeft = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.5 5l-5 5 5 5" />
  </svg>
);

const IconBuilding = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="14" height="14" rx="1.5" />
    <path d="M7 7h2M11 7h2M7 11h2M11 11h2M7 15h2M11 15h2" />
  </svg>
);

const IconArrowRight = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h12M11 6l4 4-4 4" />
  </svg>
);

const IconNote = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="12" height="14" rx="1.5" />
    <path d="M7 8h6M7 11h4" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
    <path d="M2.5 8l4 4 7-7" />
  </svg>
);

const IconCertificate = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <rect x="3" y="2" width="14" height="16" rx="1.5" />
    <path d="M7 6h6M7 9h6M7 12h4" />
    <path d="M13 14l1.5 1.5L17 13" />
  </svg>
);

const IconDownload = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M10 3v10M6 9l4 4 4-4" />
    <path d="M3 16h14" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M17 3L3 9l5.5 2.5L11 17l2-5.5L17 3z" />
  </svg>
);

/* ── Monogram ───────────────────────────────────────────────── */
function Monogram({ name, size = '' }) {
  const initials = (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={['monogram', size ? `monogram-${size}` : ''].join(' ').trim()}>
      {initials}
    </div>
  );
}

/* ── Timeline dot color helper ──────────────────────────────── */
function timelineType(ev) {
  if (ev.kind === 'sale') return 'sale';
  return ev.status || 'other';
}

/* ── Payment overview card ──────────────────────────────────── */
// Reservations on which a payment can still be recorded (engaged, not yet sold)
const OPEN_RESERVATION_STATUSES = ['active', 'validated'];

/**
 * Échéancier et encaissements d'une réservation du client (spec E4-T5) : mêmes
 * montants et libellés que la fiche lot (PaymentsPanel).
 * « Enregistrer un encaissement » seulement sur une réservation engagée : la fiche client
 * n'expose pas le statut du lot, donc on s'appuie sur le résumé financier — `gap_due_timing`
 * n'est écrit qu'à l'engagement (E4-T5) et la réservation passe en `converted` au solde —
 * plus la règle auteur / manager (`canRecordFor`). Le backend refuse de toute façon un
 * encaissement hors réservation engagée.
 */
function PaymentOverviewCard({ schedule, reservations, canRecordFor, onPaymentRecorded, highlighted }) {
  const res = reservations.find(r => r.id === schedule.reservation_id);
  const label = res
    ? `Lot ${res.lot_numero} — ${res.project_name}`
    : `Réservation #${schedule.reservation_id}`;
  const isConverted = res?.status === 'converted';
  const [collapsed, setCollapsed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const reportSummary = useCallback((summary) => setEngaged(summary.gap_due_timing != null), []);

  return (
    <div
      id={`pay-card-${schedule.reservation_id}`}
      className={`pay-overview-card${highlighted ? ' pay-overview-card--highlight' : ''}`}
    >
      <div className="pay-overview-header" onClick={() => setCollapsed(v => !v)}>
        <div className="pay-overview-label">
          {label}
          {isConverted && (
            <span className="badge pay-validated-badge" style={{ background: 'color-mix(in srgb, #ef4444 18%, var(--bg-surface))', color: '#ef4444', border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)' }}>
              <IconCheck /> Vendu
            </span>
          )}
        </div>
        <button className={`pay-overview-toggle ${collapsed ? '' : 'open'}`} aria-label={collapsed ? 'Déplier' : 'Replier'}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="pay-bricks" style={{ padding: '10px 14px' }}>
          <PaymentsPanel
            reservationId={schedule.reservation_id}
            canRecord={engaged && canRecordFor(res)}
            onSummaryChange={reportSummary}
            onPaymentRecorded={onPaymentRecorded}
          />
        </div>
      )}
    </div>
  );
}

const LEGACY_ENGAGEMENT_NOTE = 'Réservation engagée avant la nouvelle gestion des montants.';

/** Télécharger / envoyer l'acte de réservation (les clics ne déclenchent pas la navigation de la ligne). */
function DeedButtons({ reservationId, lotNumero, clientEmail, onDownloadCertificate, onSendEmail }) {
  return (
    <>
      <span className="cd-cert-label">Acte de réservation</span>
      <button
        className="btn btn-ghost btn-sm cd-cert-btn"
        onClick={() => onDownloadCertificate(reservationId, lotNumero)}
        title="Télécharger l'acte de réservation en PDF"
      >
        <IconDownload />
        Télécharger
      </button>
      {clientEmail && (
        <button
          className="btn btn-ghost btn-sm cd-cert-btn"
          onClick={() => onSendEmail(reservationId)}
          title={`Envoyer l'acte par email à ${clientEmail}`}
        >
          <IconSend />
          Envoyer par email
        </button>
      )}
    </>
  );
}

/* ── Acte / reçu d'une réservation ─────────────────────────── */
/**
 * Acte de réservation une fois le seuil d'encaissement atteint (`financial-summary`),
 * sinon le message de seuil et, dès le premier acompte, le reçu de paiement.
 */
function ReservationDeedActions({ reservationId, lotNumero, clientEmail, onDownloadCertificate, onDownloadReceipt, onSendEmail }) {
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFinancialSummary(reservationId)
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.acte_available === 'boolean') setSummary(data);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [reservationId]);

  if (failed) {
    return <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Documents indisponibles.</span>;
  }
  if (!summary) return null;

  // Not engaged (e.g. an option): no deed, no threshold message. `gap_due_timing` is only written at engagement.
  if (summary.legacy !== true && summary.gap_due_timing == null) return null;

  if (summary.legacy === true) {
    return (
      <>
        <span className="cd-legacy-note">{LEGACY_ENGAGEMENT_NOTE}</span>
        {summary.acte_available && (
          <DeedButtons
            reservationId={reservationId}
            lotNumero={lotNumero}
            clientEmail={clientEmail}
            onDownloadCertificate={onDownloadCertificate}
            onSendEmail={onSendEmail}
          />
        )}
      </>
    );
  }

  if (summary.acte_available) {
    return (
      <DeedButtons
        reservationId={reservationId}
        lotNumero={lotNumero}
        clientEmail={clientEmail}
        onDownloadCertificate={onDownloadCertificate}
        onSendEmail={onSendEmail}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.73rem', color: 'var(--text-muted)' }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7.5" width="12" height="7" rx="1.5"/>
          <path d="M5 7.5V5a3 3 0 016 0v2.5"/>
        </svg>
        {acteThresholdMessage(summary)}
      </div>
      {summary.first_payment > 0 && (
        <>
          <span className="cd-cert-label">Reçu de paiement</span>
          <button
            className="btn btn-ghost btn-sm cd-cert-btn"
            onClick={() => onDownloadReceipt(reservationId, lotNumero)}
            title="Télécharger le reçu de paiement"
          >
            <IconDownload />
            Télécharger
          </button>
        </>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isManager } = useAuth();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Payment data
  const [paymentSchedules, setPaymentSchedules] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Row → payments navigation: the target reservation, and its briefly highlighted card
  const [focus, setFocus] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  useEffect(() => {
    if (!focus || activeTab !== 'payments' || paymentLoading) return;
    const el = document.getElementById(`pay-card-${focus.id}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus, activeTab, paymentLoading, paymentSchedules]);

  const openPayments = (res) => {
    setFocus({ id: res.id, numero: res.lot_numero });
    setHighlightId(res.id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2000);
    setActiveTab('payments');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadClient is recreated every render; reload only when clientId changes
  useEffect(() => { loadClient(); }, [clientId]);

  // Load payment schedules on mount (needed for acte condition in reservations tab)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPaymentSchedules is recreated every render; reload only when clientId changes
  useEffect(() => { loadPaymentSchedules(); }, [clientId]);

  const loadClient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/clients/${clientId}/details`);
      setClient(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentSchedules = async () => {
    setPaymentLoading(true);
    try {
      const data = await apiGet(`/api/payments/schedules/client/${clientId}`);
      setPaymentSchedules(data);
    } catch (err) {
      console.error('Error loading payment schedules:', err);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Payment recorded from the payments tab: reservation statuses / amounts may have changed
  const handlePaymentRecorded = () => { loadClient(); };

  // Commercial author of the reservation or manager, reservation not yet sold
  const canRecordFor = (res) => !!res
    && OPEN_RESERVATION_STATUSES.includes(res.status)
    && (isManager() || (res.reserved_by_user_id != null && res.reserved_by_user_id === user?.id));

  const handleDownloadCertificate = async (reservationId, lotNumero) => {
    try {
      // Acte archivé à l'engagement d'abord ; repli sur la génération à la volée
      let response = await apiFetch(`/api/reservations/${reservationId}/acte`);
      if (response.status === 404) {
        response = await apiFetch(`/api/reservations/${reservationId}/certificate`);
      }
      if (!response.ok) {
        // threshold refusal: 400 `message`; other errors may carry `detail`
        throw buildApiError(await response.json().catch(() => ({})), response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acte_reservation_${reservationId}_lot${lotNumero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la génération du certificat');
    }
  };

  const handleDownloadReceipt = async (reservationId, lotNumero) => {
    try {
      const response = await apiFetch(`/api/reservations/${reservationId}/receipt`);
      if (!response.ok) {
        throw buildApiError(await response.json().catch(() => ({})), response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recu_paiement_${reservationId}_lot${lotNumero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la génération du reçu');
    }
  };

  const handleSendCertificateEmail = async (reservationId) => {
    try {
      const result = await apiPost(`/api/reservations/${reservationId}/certificate/email`, {});
      toast.success(result.message || 'Certificat envoyé par email');
    } catch (err) {
      toast.error(err.message || 'Erreur lors de l\'envoi du certificat');
    }
  };

  const handleSave = async (payload) => {
    try {
      await apiPut(`/api/clients/${clientId}`, payload);
    } catch (err) {
      if (shouldToastClientError(err)) toast.error(err.message || 'Erreur lors de la mise à jour du client');
      throw err;
    }
    await loadClient();
    setIsEditing(false);
    toast.success('Client mis à jour');
  };

  /* ── Guards ─────────────────────────────────────────────── */
  if (loading) return <div className="loading-state">Chargement…</div>;
  if (error) return (
    <div className="page-container">
      <div className="empty-state">
        <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/app/clients')}>
          Retour aux clients
        </button>
      </div>
    </div>
  );
  if (!client) return null;

  /* ── Derived data ───────────────────────────────────────── */
  const allSales = client.sales_history || [];
  const allReservations = client.reservations_history || [];

  const projectsMap = new Map();
  [...allSales, ...allReservations].forEach(item => {
    if (item.project_id && !projectsMap.has(item.project_id)) {
      projectsMap.set(item.project_id, item.project_name);
    }
  });
  const projects = Array.from(projectsMap.entries()).map(([id, name]) => ({ id, name }));

  const sales = selectedProjectId
    ? allSales.filter(s => s.project_id === selectedProjectId)
    : allSales;
  const reservations = selectedProjectId
    ? allReservations.filter(r => r.project_id === selectedProjectId)
    : allReservations;

  const stats = {
    total_purchases: sales.reduce((sum, s) => sum + (s.price || 0), 0),
    total_lots: sales.length,
    total_deposit: reservations.reduce((sum, r) => sum + (r.deposit || 0), 0),
    total_refund: reservations.filter(r => r.status === 'released').reduce((sum, r) => sum + (r.deposit_refund_amount || 0), 0),
    active_reservations: reservations.filter(r => r.status === 'active' || r.status === 'validated').length,
    lots_liberes: reservations.filter(r => r.status === 'released' || r.status === 'expired').length,
  };

  const lastSale = sales[0] || null;

  const timelineEvents = [
    ...sales.map(s => ({
      kind: 'sale', date: s.sale_date,
      label: `Vente lot ${s.lot_numero}`,
      sub: s.project_name, amount: s.price,
    })),
    ...reservations.map(r => ({
      kind: 'reservation', status: r.status,
      date: r.reservation_date,
      label: `Réservation lot ${r.lot_numero}`,
      sub: r.project_name, amount: r.deposit,
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const hasMultipleProjects = projects.length > 1;

  const TABS = [
    { key: 'info',         label: 'Informations' },
    { key: 'purchases',    label: `Achats (${sales.length})` },
    { key: 'reservations', label: `Réservations (${reservations.length})` },
    { key: 'payments',     label: 'Paiements' },
  ];

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="cd-page page-container">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="cd-header">
        <button className="cd-back-btn" onClick={() => navigate('/app/clients')}>
          <IconChevronLeft />
          Retour
        </button>
        <div className="cd-title-block">
          <h1 className="cd-name">{client.name}</h1>
          <p className="cd-meta">
            {CLIENT_TYPE_LABELS[client.client_type] || 'Client'}
            {' · '}
            <span className="badge badge-green">Client actif</span>
            {' · Créé le '}
            {formatDate(client.created_at)}
          </p>
        </div>
      </div>

      {/* ── Action bar ──────────────────────────────────── */}
      <div className="cd-actions">
        {client.phone && (
          <a href={`tel:${client.phone}`} className="cd-action-btn">
            <IconPhone />Appeler
          </a>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} className="cd-action-btn">
            <IconMail />Envoyer email
          </a>
        )}
        <button className="cd-action-btn" onClick={() => setIsEditing(true)}>
          <IconEdit />Modifier
        </button>
      </div>

      {/* ── Project filter ──────────────────────────────── */}
      {hasMultipleProjects && (
        <div className="cd-project-filter">
          <span className="cd-project-filter-icon"><IconBuilding /></span>
          <select
            className="cd-project-select"
            value={selectedProjectId ?? ''}
            onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Tous les projets</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedProjectId && (
            <button
              className="cd-project-clear"
              onClick={() => setSelectedProjectId(null)}
              title="Effacer le filtre"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────── */}
      <div className="stat-strip">
        <div className="stat-tile cd-stat-grow">
          <div className="stat-tile-value" style={{ color: 'var(--color-success)' }}>
            {formatPrice(stats.total_purchases || 0)}
          </div>
          <div className="stat-tile-label">CA Total</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{stats.total_lots || 0}</div>
          <div className="stat-tile-label">Lots achetés</div>
        </div>
        <div className="stat-tile cd-stat-grow">
          <div className="stat-tile-value" style={{ color: 'var(--color-primary)' }}>
            {formatPrice(stats.total_deposit || 0)}
          </div>
          <div className="stat-tile-label">Acomptes versés</div>
        </div>
        {stats.total_refund > 0 && (
          <div className="stat-tile cd-stat-grow">
            <div className="stat-tile-value" style={{ color: 'var(--color-success)' }}>
              {formatPrice(stats.total_refund)}
            </div>
            <div className="stat-tile-label">Acomptes récupérés</div>
          </div>
        )}
        <div className="stat-tile">
          <div className="stat-tile-value num">{stats.active_reservations || 0}</div>
          <div className="stat-tile-label">Réservations actives</div>
        </div>
        {stats.lots_liberes > 0 && (
          <div className="stat-tile">
            <div className="stat-tile-value num" style={{ color: '#a78bfa' }}>{stats.lots_liberes}</div>
            <div className="stat-tile-label">Lots libérés</div>
          </div>
        )}
      </div>

      {/* ── Body grid: résumé + timeline ────────────────── */}
      <div className="cd-body-grid">

        {/* Résumé commercial */}
        <div className="card cd-summary">
          <h3 className="cd-section-title">Résumé commercial</h3>

          <ul className="cd-summary-list">
            {stats.total_lots > 0 && (
              <li>{stats.total_lots} lot{stats.total_lots > 1 ? 's' : ''} acheté{stats.total_lots > 1 ? 's' : ''}</li>
            )}
            {stats.active_reservations > 0 && (
              <li>{stats.active_reservations} réservation{stats.active_reservations > 1 ? 's' : ''} en cours</li>
            )}
            {lastSale && (
              <li>Dernier achat le {formatDate(lastSale.sale_date)}</li>
            )}
            {!stats.total_lots && !stats.active_reservations && (
              <li style={{ color: 'var(--text-muted)' }}>Aucune activité enregistrée</li>
            )}
          </ul>
        </div>

        {/* Historique client */}
        <div className="card cd-timeline-card">
          <h3 className="cd-section-title">Historique client</h3>
          {timelineEvents.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--spacing-lg) 0' }}>
              Aucune activité
            </div>
          ) : (
            <ol className="cd-timeline-list">
              {timelineEvents.map((ev, i) => {
                const type = timelineType(ev);
                return (
                  <li key={i} className={`cd-timeline-item cd-tl-${type}`}>
                    <div className="cd-tl-dot" />
                    <div className="cd-tl-content">
                      <div className="cd-tl-top">
                        <span className="cd-tl-day">{formatDate(ev.date)}</span>
                        {ev.sub && <span className="badge badge-gray">{ev.sub}</span>}
                      </div>
                      <div className="cd-tl-label">{ev.label}</div>
                      {ev.amount > 0 && (
                        <div className="cd-tl-amount">{formatPrice(ev.amount)}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {timelineEvents.length > 0 && (
            <button className="cd-tl-more">
              Voir toute l'activité
              <IconArrowRight />
            </button>
          )}
        </div>
      </div>

      {/* ── Tab nav ─────────────────────────────────────── */}
      <div className="cd-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`cd-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => { setFocus(null); setActiveTab(tab.key); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────── */}
      <div className="cd-tab-body">

        {/* ── Informations ── */}
        {activeTab === 'info' && (
          isEditing ? (
            <div className="card">
              <ClientForm
                initialValues={client}
                excludeId={client.id}
                onSubmit={handleSave}
                onCancel={() => setIsEditing(false)}
              />
            </div>
          ) : (
            <div className="cd-info-grid">
              {/* Identité */}
              <div className="card">
                <h4 className="cd-subsection-title">Identité</h4>
                <div className="cd-info-rows">
                  <div className="cd-info-row">
                    <span className="cd-info-val">
                      {[client.first_name, client.last_name].filter(Boolean).join(' ') || client.name}
                    </span>
                  </div>
                  {client.maiden_name && (
                    <div className="cd-info-row">
                      <span className="cd-info-val">Née {client.maiden_name}</span>
                    </div>
                  )}
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconCard /></span>
                    <span className="cd-info-val">{client.cin || '—'}</span>
                  </div>
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconCalendar /></span>
                    <span className="cd-info-val">{formatDate(client.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Coordonnées */}
              <div className="card">
                <h4 className="cd-subsection-title">Coordonnées</h4>
                <div className="cd-info-rows">
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconPhone /></span>
                    <span className="cd-info-val">{client.phone || '—'}</span>
                  </div>
                  {client.whatsapp && (
                    <div className="cd-info-row">
                      <span className="cd-info-icon"><IconPhone /></span>
                      <span className="cd-info-val">{client.whatsapp} (WhatsApp)</span>
                    </div>
                  )}
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconMail /></span>
                    <span className="cd-info-val">{client.email || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Adresses */}
              <div className="card">
                <h4 className="cd-subsection-title">Adresses</h4>
                <div className="cd-info-rows">
                  {[
                    ['morocco', 'Maroc', client.address_morocco, client.city_morocco],
                    ['abroad', 'Étranger', client.address_abroad, client.city_abroad, client.country_abroad],
                  ].filter(([, , value]) => value).map(([key, label, ...parts]) => {
                    const full = parts.filter(Boolean).join(', ');
                    return (
                    <div className="cd-info-row" key={key}>
                      <span className="cd-info-icon"><IconNote /></span>
                      <span className="cd-info-val">
                        {label} : {full}
                        {full === acteAddressOf(client) && (
                          <>
                            {' '}<span className="badge badge-gold" title="Adresse utilisée pour les actes">Actes</span>
                          </>
                        )}
                      </span>
                    </div>
                    );
                  })}
                  {!client.address_morocco && !client.address_abroad && (
                    <div className="cd-info-row"><span className="cd-info-val">—</span></div>
                  )}
                </div>
              </div>

              {/* Canal d'acquisition */}
              <div className="card">
                <h4 className="cd-subsection-title">Canal d&apos;acquisition</h4>
                <div className="cd-info-rows">
                  <div className="cd-info-row">
                    <span className="cd-info-val">
                      {describeAcquisition(client) ? `Canal : ${describeAcquisition(client)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Préférences */}
              <div className="card">
                <h4 className="cd-subsection-title">Préférences</h4>
                <div className="cd-info-rows">
                  <div className="cd-info-row">
                    <span className="cd-info-val">
                      Notifications :{' '}
                      {(client.notification_channels || []).length > 0
                        ? client.notification_channels
                            .map((c) => NOTIFICATION_CHANNEL_LABELS[c] || c)
                            .join(', ')
                        : 'aucune'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contexte commercial */}
              <div className="card">
                <h4 className="cd-subsection-title">Contexte commercial</h4>
                <div className="cd-context">
                  {client.created_by ? (
                    <div className="cd-context-row">
                      <Monogram name={client.created_by.name} />
                      <div>
                        <div className="cd-summary-section-label">Commercial responsable</div>
                        <div className="cd-commercial-name">{client.created_by.name}</div>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Aucun commercial assigné
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* ── Achats ── */}
        {activeTab === 'purchases' && (
          sales.length === 0
            ? <div className="empty-state">Aucun achat enregistré</div>
            : (
              <div className="card">
                {sales.map((sale, i) => (
                  <div key={sale.id} className={`cd-list-row${i > 0 ? ' cd-list-row--sep' : ''}`}>
                    <div className="cd-lot-badge cd-lot--sold">{sale.lot_numero}</div>
                    <div className="cd-list-main">
                      <div className="cd-list-title">Lot {sale.lot_numero} — {sale.project_name}</div>
                      <div className="cd-list-sub">
                        {[
                          sale.lot_surface && `${formatSurface(sale.lot_surface)} m²`,
                          sale.lot_zone && `Zone ${sale.lot_zone}`,
                          sale.sold_by_name,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="cd-list-right">
                      <div className="cd-list-price">{formatPrice(sale.price)}</div>
                      <div className="cd-list-date">{formatDate(sale.sale_date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}

        {/* ── Réservations ── */}
        {activeTab === 'reservations' && (
          reservations.length === 0
            ? <div className="empty-state">Aucune réservation enregistrée</div>
            : (
              <div className="card">
                {reservations.map((res, i) => {
                  const st = RESERVATION_STATUS[res.status] || { label: res.status, cls: 'badge-gray' };
                  return (
                    <div
                      key={res.id}
                      className={`cd-list-row cd-list-row--link${i > 0 ? ' cd-list-row--sep' : ''}`}
                      role="button"
                      tabIndex={0}
                      title={`Voir les paiements du lot ${res.lot_numero}`}
                      aria-label={`Voir les paiements du lot ${res.lot_numero}`}
                      onClick={() => openPayments(res)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPayments(res); }
                      }}
                    >
                      <div className={`cd-lot-badge cd-lot--${res.status}`}>{res.lot_numero}</div>
                      <div className="cd-list-main">
                        <div className="cd-list-title">
                          Lot {res.lot_numero} — {res.project_name}
                          {' '}<span className={`badge ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="cd-list-sub">
                          {[
                            res.lot_surface && `${formatSurface(res.lot_surface)} m²`,
                            res.lot_zone && `Zone ${res.lot_zone}`,
                            res.reserved_by_name,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="cd-list-right">
                        {res.deposit > 0 && (
                          <div className="cd-list-price cd-list-price--brass">
                            {formatPrice(res.deposit)}
                          </div>
                        )}
                        {res.status === 'released' && res.deposit_refund_amount > 0 && (
                          <div className="cd-refund-row" title={res.deposit_refund_date ? `Récupéré le ${formatDate(res.deposit_refund_date)}` : undefined}>
                            <span className="cd-refund-label">Récupéré</span>
                            <span className="cd-refund-amount">{formatPrice(res.deposit_refund_amount)}</span>
                          </div>
                        )}
                        {res.status === 'released' && res.deposit > 0 && !res.deposit_refund_amount && (
                          <div className="cd-refund-row cd-refund-row--none">
                            <span className="cd-refund-label">Non remboursé</span>
                          </div>
                        )}
                        <div className="cd-list-date">{formatDate(res.reservation_date)}</div>
                        {res.status === 'active' && res.expiration_date && (
                          <div className="cd-list-expire">Expire {formatDate(res.expiration_date)}</div>
                        )}
                        <div className="cd-cert-actions" onClick={(e) => e.stopPropagation()}>
                          {['active', 'validated', 'converted'].includes(res.status) && (
                            <ReservationDeedActions
                              reservationId={res.id}
                              lotNumero={res.lot_numero}
                              clientEmail={client.email}
                              onDownloadCertificate={handleDownloadCertificate}
                              onDownloadReceipt={handleDownloadReceipt}
                              onSendEmail={handleSendCertificateEmail}
                            />
                          )}
                        </div>
                      </div>
                      <span className="cd-list-chevron" aria-hidden="true">›</span>
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* ── Paiements ── */}
        {activeTab === 'payments' && (
          paymentLoading
            ? <div className="loading-state">Chargement des paiements…</div>
            : (() => {
                // Schedules are created at engagement only (the legacy « Créer le plan » was removed)
                return (
                  <>
                    {focus && !paymentSchedules.some(sc => sc.reservation_id === focus.id) && (
                      <div className="cd-no-schedule">Aucun échéancier pour le lot {focus.numero}.</div>
                    )}
                    {paymentSchedules.length === 0 && (
                      <div className="empty-state">
                        <p>Aucun plan de paiement pour ce client.</p>
                      </div>
                    )}
                    {paymentSchedules.length > 0 && (
                      <div className="pay-schedules-list">
                        {paymentSchedules.map(schedule => (
                          <PaymentOverviewCard
                            key={schedule.id}
                            schedule={schedule}
                            reservations={allReservations}
                            canRecordFor={canRecordFor}
                            onPaymentRecorded={handlePaymentRecorded}
                            highlighted={schedule.reservation_id === highlightId}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()
        )}

      </div>

      {/* ── Notifications ───────────────────────────────── */}
      <div className="card cd-notifications">
        <h4 className="cd-subsection-title">Notifications</h4>
        <NotificationHistory clientId={clientId} />
      </div>

      {/* ── Notes internes ──────────────────────────────── */}
      <div className="card cd-notes">
        <h4 className="cd-subsection-title">Notes internes</h4>
        {client.notes ? (
          <p className="cd-notes-text">{client.notes}</p>
        ) : (
          <button className="cd-notes-placeholder" onClick={() => setIsEditing(true)}>
            <IconNote />
            Ajouter une note interne…
            <IconArrowRight />
          </button>
        )}
      </div>

    </div>
  );
}
