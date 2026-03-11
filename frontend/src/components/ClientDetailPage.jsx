import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiPost, apiPut, apiPatch, apiFetch } from '../utils/api';
import { formatPrice, formatDate } from '../utils/formatters';
import { CLIENT_TYPES } from '../utils/constants';

/* ── Label maps ─────────────────────────────────────────────── */
const CLIENT_TYPE_LABELS = {
  proprietaire: 'Propriétaire',
  revendeur: 'Revendeur',
  investisseur: 'Investisseur',
  autre: 'Autre',
};

const RESERVATION_STATUS = {
  active:    { label: 'Active',    cls: 'badge-gold' },
  converted: { label: 'Convertie', cls: 'badge-green' },
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

const IconClock = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3l2 2" />
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

/* ── SVG Donut Chart ────────────────────────────────────────── */
function DonutChart({ paidPct, color, size = 80 }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, paidPct || 0));
  const offset = circumference - (safePct / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="var(--bg-surface)"
        strokeWidth="10"
      />
      {/* Progress ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      {/* Center label */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize="11"
        fontWeight="600"
        fontFamily="var(--font-body)"
      >
        {Math.round(safePct)}%
      </text>
    </svg>
  );
}

/* ── Installment table brick (with donut) ───────────────────── */
function InstallmentBrick({ type, label, items, onInstallmentUpdate }) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const paid  = items.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  const allPaid = items.length > 0 && items.every(i => i.status === 'paid');
  const color = type === 'deposit' ? 'var(--color-primary)' : 'var(--color-success, #2ecc71)';

  return (
    <div className={`pay-brick pay-brick--${type}`}>
      {/* Summary row with donut */}
      <div className="pay-brick-summary">
        <DonutChart paidPct={paidPct} color={color} size={64} />
        <div className="pay-brick-meta">
          <div className="pay-brick-label">{label}</div>
          <div className="pay-brick-amounts">
            <span className="pay-brick-paid">{formatPrice(paid)}</span>
            <span className="pay-brick-sep"> / </span>
            <span className="pay-brick-total">{formatPrice(total)}</span>
          </div>
          <div className="pay-brick-remaining">Restant : {formatPrice(total - paid)}</div>
        </div>
        {allPaid
          ? <span className="badge badge-green pay-brick-status"><IconCheck /> Soldé</span>
          : <span className="badge badge-gray pay-brick-status">{items.filter(i => i.status === 'paid').length}/{items.length} versements</span>
        }
      </div>
      {/* Table */}
      {items.length > 0 && (
        <table className="pay-table">
          <thead>
            <tr><th>#</th><th>Échéance</th><th>Montant</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(inst => {
              const isOverdue = inst.status === 'pending' && new Date(inst.due_date) < new Date();
              return (
                <tr key={inst.id} className={[
                  inst.status === 'paid' ? 'pay-row--paid' : '',
                  isOverdue ? 'pay-row--overdue' : '',
                ].filter(Boolean).join(' ')}>
                  <td className="pay-cell-num">{inst.installment_number}</td>
                  <td className="pay-cell-date">{formatDate(inst.due_date)}</td>
                  <td className="pay-cell-amount">{formatPrice(inst.amount)}</td>
                  <td>
                    <span className={`badge ${inst.status === 'paid' ? 'badge-green' : isOverdue ? 'badge-red' : 'badge-gray'}`}>
                      {inst.status === 'paid' ? <><IconCheck /> Payé</> : <><IconClock /> En attente</>}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`pay-toggle-btn ${inst.status === 'paid' ? 'pay-toggle-btn--undo' : 'pay-toggle-btn--mark'}`}
                      onClick={() => onInstallmentUpdate(inst.id, inst.status === 'paid' ? 'pending' : 'paid')}
                      title={inst.status === 'paid' ? 'Marquer non payé' : 'Marquer payé'}
                    >
                      {inst.status === 'paid' ? '↩' : '✓'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Payment overview card ──────────────────────────────────── */
function PaymentOverviewCard({ schedule, reservations, onInstallmentUpdate }) {
  const res = reservations.find(r => r.id === schedule.reservation_id);
  const label = res
    ? `Lot ${res.lot_numero} — ${res.project_name}`
    : `Réservation #${schedule.reservation_id}`;
  const isValidated = res?.status === 'validated';

  const firstPaymentAmount = res?.deposit ?? 0;
  const firstPaymentDate = res?.deposit_date || res?.reservation_date;

  const depositInstallments = schedule.installments
    .filter(i => i.payment_type === 'deposit')
    .sort((a, b) => a.installment_number - b.installment_number);
  const balanceInstallments = schedule.installments
    .filter(i => i.payment_type === 'balance')
    .sort((a, b) => a.installment_number - b.installment_number);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="pay-overview-card">
      {/* Header */}
      <div className="pay-overview-header" onClick={() => setCollapsed(v => !v)}>
        <div className="pay-overview-label">
          {label}
          {isValidated && (
            <span className="badge badge-green pay-validated-badge">
              <IconCheck /> Réservation validée
            </span>
          )}
        </div>
        <div className="pay-overview-price">{formatPrice(schedule.lot_price)}</div>
        <button className={`pay-overview-toggle ${collapsed ? '' : 'open'}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="pay-bricks">
          {/* ── Brique 1 : 1er versement ── */}
          <div className={`pay-brick pay-brick--first ${isValidated ? 'pay-brick--first-paid' : ''}`}>
            <div className="pay-brick-head">
              <span className="pay-brick-label">1er versement</span>
              <span className="pay-brick-progress">
                <span className="pay-brick-paid">{formatPrice(firstPaymentAmount)}</span>
              </span>
              {isValidated
                ? <span className="badge badge-green pay-brick-status"><IconCheck /> Payé</span>
                : <span className="badge badge-gray pay-brick-status"><IconClock /> En attente</span>
              }
            </div>
            {firstPaymentDate && (
              <div className="pay-first-payment-date">
                <IconCalendar /> {formatDate(firstPaymentDate)}
              </div>
            )}
            {!isValidated && (
              <button
                className="pay-first-payment-confirm"
                onClick={() => {
                  const firstInst = depositInstallments[0];
                  if (firstInst) onInstallmentUpdate(firstInst.id, 'paid');
                }}
              >
                <IconCheck /> Confirmer la réception
              </button>
            )}
          </div>

          {/* ── Brique 2 : Échéancier acompte ── */}
          <InstallmentBrick
            type="deposit"
            label="Échéancier acompte"
            items={depositInstallments}
            onInstallmentUpdate={onInstallmentUpdate}
          />

          {/* ── Brique 3 : Échéancier solde ── */}
          <InstallmentBrick
            type="balance"
            label="Échéancier solde"
            items={balanceInstallments}
            onInstallmentUpdate={onInstallmentUpdate}
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Payment data
  const [paymentSchedules, setPaymentSchedules] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => { loadClient(); }, [clientId]);

  // Load payment schedules when payments tab is opened
  useEffect(() => {
    if (activeTab === 'payments' && paymentSchedules.length === 0) {
      loadPaymentSchedules();
    }
  }, [activeTab]);

  const loadClient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/clients/${clientId}/details`);
      setClient(data);
      setEditForm({
        name:        data.name        || '',
        phone:       data.phone       || '',
        email:       data.email       || '',
        cin:         data.cin         || '',
        address:     data.address     || '',
        client_type: data.client_type || 'autre',
        notes:       data.notes       || '',
      });
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

  const handleCreateDefaultSchedule = async (reservation) => {
    if (!reservation.lot_price) { toast.warning('Prix du lot inconnu, impossible de créer un plan'); return; }
    try {
      await apiPost('/api/payments/schedules', {
        reservation_id: reservation.id,
        lot_price: reservation.lot_price,
        deposit_pct: 50,
        balance_delay_months: 0,
        deposit_installments: { count: 1, periodicity_months: 1 },
        balance_installments: { count: 1, periodicity_months: 1 },
      });
      await loadPaymentSchedules();
      toast.success('Plan de paiement créé avec succès');
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la création du plan');
    }
  };

  const handleInstallmentUpdate = async (installmentId, newStatus) => {
    try {
      await apiPatch(`/api/payments/installments/${installmentId}`, {
        status: newStatus,
        paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
      });
      // Reload both payment data and client (reservation status may have changed)
      await Promise.all([loadPaymentSchedules(), loadClient()]);
      toast.success(newStatus === 'paid' ? 'Versement marqué payé' : 'Versement remis en attente');
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleDownloadCertificate = async (reservationId, lotNumero) => {
    try {
      const response = await apiFetch(`/api/reservations/${reservationId}/certificate`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Erreur ${response.status}`);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPut(`/api/clients/${clientId}`, editForm);
      await loadClient();
      setIsEditing(false);
      toast.success('Client mis à jour avec succès');
    } catch {
      toast.error('Erreur lors de la mise à jour du client');
    } finally {
      setSaving(false);
    }
  };

  /* ── Guards ─────────────────────────────────────────────── */
  if (loading) return <div className="loading-state">Chargement…</div>;
  if (error) return (
    <div className="page-container">
      <div className="empty-state">
        <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/clients')}>
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
  };

  const remaining = stats.total_purchases - stats.total_deposit;
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
        <button className="cd-back-btn" onClick={() => navigate('/clients')}>
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
            {remaining > 0 && (
              <li>Restant à payer : {formatPrice(remaining)}</li>
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
            onClick={() => setActiveTab(tab.key)}
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
              <div className="form-2col">
                <div className="field-group">
                  <label className="field-label">Nom complet *</label>
                  <input className="field-input" type="text" value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="field-group">
                  <label className="field-label">Téléphone</label>
                  <input className="field-input" type="tel" value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input className="field-input" type="email" value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="field-group">
                  <label className="field-label">CIN</label>
                  <input className="field-input" type="text" value={editForm.cin}
                    onChange={e => setEditForm({ ...editForm, cin: e.target.value })} />
                </div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}>
                  <label className="field-label">Adresse</label>
                  <input className="field-input" type="text" placeholder="Rue, ville, pays"
                    value={editForm.address || ''}
                    onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                </div>
                <div className="field-group">
                  <label className="field-label">Type de client</label>
                  <select className="field-input" value={editForm.client_type}
                    onChange={e => setEditForm({ ...editForm, client_type: e.target.value })}>
                    {CLIENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}>
                  <label className="field-label">Notes</label>
                  <textarea className="field-input" rows={3} value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 'var(--spacing-lg)' }}>
                <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="cd-info-grid">
              {/* Coordonnées */}
              <div className="card">
                <h4 className="cd-subsection-title">Coordonnées</h4>
                <div className="cd-info-rows">
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconPhone /></span>
                    <span className="cd-info-val">{client.phone || '—'}</span>
                  </div>
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconMail /></span>
                    <span className="cd-info-val">{client.email || '—'}</span>
                  </div>
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconCard /></span>
                    <span className="cd-info-val">{client.cin || '—'}</span>
                  </div>
                  {client.address && (
                    <div className="cd-info-row">
                      <span className="cd-info-icon"><IconNote /></span>
                      <span className="cd-info-val">{client.address}</span>
                    </div>
                  )}
                  <div className="cd-info-row">
                    <span className="cd-info-icon"><IconCalendar /></span>
                    <span className="cd-info-val">{formatDate(client.created_at)}</span>
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
                          sale.lot_surface && `${sale.lot_surface} m²`,
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
                    <div key={res.id} className={`cd-list-row${i > 0 ? ' cd-list-row--sep' : ''}`}>
                      <div className={`cd-lot-badge cd-lot--${res.status}`}>{res.lot_numero}</div>
                      <div className="cd-list-main">
                        <div className="cd-list-title">
                          Lot {res.lot_numero} — {res.project_name}
                          {' '}<span className={`badge ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="cd-list-sub">
                          {[
                            res.lot_surface && `${res.lot_surface} m²`,
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
                        <button
                          className="btn btn-ghost btn-sm cd-cert-btn"
                          onClick={() => handleDownloadCertificate(res.id, res.lot_numero)}
                          title="Télécharger l'acte de réservation PDF"
                        >
                          <IconCertificate />
                          Certificat
                        </button>
                      </div>
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
                const scheduledReservationIds = new Set(paymentSchedules.map(s => s.reservation_id));
                const reservationsWithoutPlan = allReservations.filter(
                  r => r.status === 'active' && !scheduledReservationIds.has(r.id) && r.lot_price
                );
                return (
                  <>
                    {reservationsWithoutPlan.length > 0 && (
                      <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--spacing-sm)' }}>
                          Réservations sans plan de paiement
                        </div>
                        {reservationsWithoutPlan.map(res => (
                          <div key={res.id} className="cd-list-row" style={{ alignItems: 'center' }}>
                            <div className="cd-lot-badge cd-lot--reserved">{res.lot_numero}</div>
                            <div className="cd-list-main">
                              <div className="cd-list-title">Lot {res.lot_numero} — {res.project_name}</div>
                              <div className="cd-list-sub">{formatPrice(res.lot_price)}</div>
                            </div>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ whiteSpace: 'nowrap' }}
                              onClick={() => handleCreateDefaultSchedule(res)}
                            >
                              Créer le plan
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {paymentSchedules.length === 0 && reservationsWithoutPlan.length === 0 && (
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
                            onInstallmentUpdate={handleInstallmentUpdate}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()
        )}

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
