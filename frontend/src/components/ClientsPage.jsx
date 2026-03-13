import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiPost } from '../utils/api';
import { formatPrice, formatCompactPrice } from '../utils/formatters';
import { CLIENT_TYPES, PIPELINE_LABELS } from '../utils/constants';

/* ── Icons ─────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
  </svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 4 6 8 10 4"/>
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 3 9 7 5 11"/>
  </svg>
);
const IconPhone = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.5 8.5v1.3a.9.9 0 01-1 .9 8.7 8.7 0 01-3.8-1.4 8.6 8.6 0 01-2.6-2.6A8.7 8.7 0 011.7 2.6.9.9 0 012.6 1.6H4a.9.9 0 01.9.78c.057.43.163.85.315 1.25a.9.9 0 01-.2.95L4.4 5.15a7.2 7.2 0 002.6 2.6l.57-.57a.9.9 0 01.95-.2c.4.153.82.258 1.25.315A.9.9 0 0110.5 8.5z"/>
  </svg>
);
const IconMail = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="10" height="8" rx="1"/><polyline points="1 3 6 7 11 3"/>
  </svg>
);
const IconCard = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1.5" width="10" height="9" rx="1"/><line x1="1" y1="5" x2="11" y2="5"/>
    <line x1="3.5" y1="8" x2="5.5" y2="8"/>
  </svg>
);
const IconSort = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="3" x2="12" y2="3"/><line x1="3" y1="6.5" x2="10" y2="6.5"/><line x1="5" y1="10" x2="8" y2="10"/>
  </svg>
);

/* ── Helpers ─────────────────────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const TYPE_CONFIG = {
  proprietaire: { label: 'Propriétaire', cls: 'cp-badge-gold' },
  revendeur:    { label: 'Revendeur',    cls: 'cp-badge-blue' },
  investisseur: { label: 'Investisseur', cls: 'cp-badge-green' },
  autre:        { label: 'Autre',        cls: 'cp-badge-gray' },
};

const PIPELINE_CONFIG = {
  buyer:              { label: 'Acheteur',           cls: 'cl-pip-buyer' },
  active_reservation: { label: 'Réservation active', cls: 'cl-pip-reserved' },
  past_reservation:   { label: 'Lot libéré',          cls: 'cl-pip-past' },
  prospect:           { label: 'Prospect',           cls: 'cl-pip-prospect' },
};

/* ── Component ─────────────────────────────────────────────── */
export default function ClientsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const toast = useToast();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });

  useEffect(() => { if (token) loadClients(); }, [token]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/dashboard/clients-pipeline');
      setClients(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.warning('Le nom est requis'); return; }
    setSaving(true);
    try {
      await apiPost('/api/clients', {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        cin: form.cin.trim() || null,
        client_type: form.client_type,
        notes: form.notes.trim() || null,
      });
      toast.success('Client créé avec succès');
      setShowModal(false);
      setForm({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
      loadClients();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived list ── */
  const displayList = useMemo(() => {
    let list = [...clients];
    if (typeFilter) list = list.filter(c => c.client_type === typeFilter);
    if (statusFilter) list = list.filter(c => c.pipeline_status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.cin || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'ca') return (b.total_purchases || 0) - (a.total_purchases || 0);
      if (sortBy === 'achats') return (b.total_sales || 0) - (a.total_sales || 0);
      if (sortBy === 'reservations') return (b.active_reservations || 0) - (a.active_reservations || 0);
      return (a.name || '').localeCompare(b.name || '', 'fr');
    });
    return list;
  }, [clients, typeFilter, statusFilter, searchQuery, sortBy]);

  /* ── KPIs ── */
  const totalReservations = clients.reduce((s, c) => s + (c.active_reservations || 0), 0);
  const totalBuyers = clients.filter(c => c.pipeline_status === 'buyer').length;
  const totalDeposits = clients.reduce((s, c) => s + (c.total_deposit || 0), 0);
  const totalCA = clients.reduce((s, c) => s + (c.total_purchases || 0), 0);
  const maxCA = Math.max(...clients.map(c => c.total_purchases || 0), 1);

  /* ── Pipeline ── */
  const pipeline = {
    buyer:              clients.filter(c => c.pipeline_status === 'buyer').length,
    active_reservation: clients.filter(c => c.pipeline_status === 'active_reservation').length,
    prospect:           clients.filter(c => c.pipeline_status === 'prospect').length,
    past_reservation:   clients.filter(c => c.pipeline_status === 'past_reservation').length,
  };

  const topClients = [...clients]
    .filter(c => c.total_purchases > 0)
    .sort((a, b) => (b.total_purchases || 0) - (a.total_purchases || 0))
    .slice(0, 5);

  return (
    <div className="cp-page page-container">

      {/* ── Header ── */}
      <div className="cp-header">
        <div>
          <p className="page-eyebrow">Portefeuille</p>
          <h1 className="cp-title">Clients</h1>
          <p className="cp-subtitle">Gérez votre portefeuille clients et suivez le pipeline</p>
        </div>
        <div className="cp-header-actions">
          <button
            className="cp-btn-primary"
            onClick={() => {
              setShowModal(true);
              setForm({ name: '', phone: '', email: '', cin: '', client_type: 'autre', notes: '' });
            }}
          >
            <IconPlus />
            Nouveau client
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="stat-strip">
        <div className="stat-tile stat-tile-accent">
          <div className="stat-tile-value num">{clients.length}</div>
          <div className="stat-tile-label">Total clients</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{totalReservations}</div>
          <div className="stat-tile-label">Réservations actives</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{totalBuyers}</div>
          <div className="stat-tile-label">Acheteurs</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{formatCompactPrice(totalDeposits)}</div>
          <div className="stat-tile-label">Acomptes versés</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{formatCompactPrice(totalCA)}</div>
          <div className="stat-tile-label">CA total</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cp-body">

        {/* Left: roster */}
        <div className="cp-team">
          <div className="cp-controls">
            <div className="cp-controls-left">
              <h2 className="cp-team-title">Portefeuille clients</h2>
              <span className="badge">{displayList.length} client{displayList.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="cp-controls-right">
              <div className="cp-filter-select">
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">Tous les types</option>
                  {CLIENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <IconChevronDown />
              </div>
              <div className="cp-filter-select">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">Tous les statuts</option>
                  <option value="buyer">Acheteurs</option>
                  <option value="active_reservation">Réservation active</option>
                  <option value="prospect">Prospects</option>
                  <option value="past_reservation">Lot libéré</option>
                </select>
                <IconChevronDown />
              </div>
              <div className="cp-filter-select">
                <IconSort />
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="name">Nom A–Z</option>
                  <option value="ca">CA total</option>
                  <option value="achats">Achats</option>
                  <option value="reservations">Réservations</option>
                </select>
                <IconChevronDown />
              </div>
            </div>
          </div>

          <div className="search-bar" style={{ marginBottom: 'var(--spacing-md)' }}>
            <IconSearch />
            <input
              placeholder="Rechercher un client (nom, téléphone, CIN)…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
              >
                <IconX />
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-state">Chargement…</div>
          ) : displayList.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchQuery || typeFilter || statusFilter
                  ? 'Aucun client pour ces critères.'
                  : 'Aucun client enregistré.'}
              </p>
              {!searchQuery && !typeFilter && !statusFilter && (
                <button className="cp-btn-primary" onClick={() => setShowModal(true)}>
                  <IconPlus /> Ajouter le premier client
                </button>
              )}
            </div>
          ) : (
            <div className="cp-roster">
              {displayList.map((c, idx) => {
                const typeConf = TYPE_CONFIG[c.client_type] || TYPE_CONFIG.autre;
                const pipConf = PIPELINE_CONFIG[c.pipeline_status] || { label: c.pipeline_status, cls: 'cl-pip-prospect' };
                const caRatio = maxCA > 0 ? Math.min(100, ((c.total_purchases || 0) / maxCA) * 100) : 0;
                const hasFinancial = (c.total_deposit > 0) || (c.total_purchases > 0);

                return (
                  <div
                    key={c.id}
                    className="cp-card"
                    style={{ animationDelay: `${idx * 0.05}s`, cursor: 'pointer' }}
                    onClick={() => navigate(`/app/clients/${c.id}`)}
                  >
                    {/* Identity */}
                    <div className="cp-card-top">
                      <div className="monogram monogram-lg">{getInitials(c.name)}</div>
                      <div className="cp-identity">
                        <div className="cp-identity-row">
                          <span className="identity-name">{c.name}</span>
                          {c.client_type && c.client_type !== 'autre' && (
                            <span className={`cp-perf-badge ${typeConf.cls}`}>{typeConf.label}</span>
                          )}
                          <span className={`cl-pip-badge ${pipConf.cls}`}>{pipConf.label}</span>
                        </div>
                        <div className="cl-contact-row">
                          {c.phone && (
                            <span className="cl-contact-item"><IconPhone />{c.phone}</span>
                          )}
                          {c.email && (
                            <span className="cl-contact-item"><IconMail />{c.email}</span>
                          )}
                          {c.cin && (
                            <span className="cl-contact-item"><IconCard />{c.cin}</span>
                          )}
                        </div>
                      </div>
                      <div className="cp-card-btns">
                        <button
                          className="cl-view-btn"
                          onClick={e => { e.stopPropagation(); navigate(`/app/clients/${c.id}`); }}
                          title="Voir le profil"
                        >
                          <IconChevronRight />
                        </button>
                      </div>
                    </div>

                    {/* Mini stats */}
                    <div className="cp-mini-stats">
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{c.active_reservations || 0}</span>
                        <span className="cp-mini-lbl">Réservations</span>
                      </div>
                      <div className="cp-mini-stat-sep" />
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{c.total_sales || 0}</span>
                        <span className="cp-mini-lbl">Achats</span>
                      </div>
                      <div className="cp-mini-stat-sep" />
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{formatCompactPrice(c.total_deposit || 0)}</span>
                        <span className="cp-mini-lbl">Acompte</span>
                      </div>
                    </div>

                    {/* CA bar */}
                    {hasFinancial && (
                      <div className="cp-ca-row">
                        <div className="cp-ca-labels">
                          <span className="cp-ca-label">Total achats</span>
                          <span className="cp-ca-value num">{formatPrice(c.total_purchases || 0)}</span>
                        </div>
                        <div className="cp-ca-bar-track">
                          <div className="cp-ca-bar-fill" style={{ width: `${caRatio.toFixed(1)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Pipeline panel */}
        <div className="cp-perf-panel card">
          <div className="cp-panel-header">
            <p className="page-eyebrow" style={{ marginBottom: 4 }}>Vue d'ensemble</p>
            <h3 className="cp-panel-title">Pipeline clients</h3>
          </div>

          <div className="cl-pipeline">
            {[
              { key: 'buyer',              label: 'Acheteurs',            cls: 'cl-pip-bar-buyer' },
              { key: 'active_reservation', label: 'Réservations actives', cls: 'cl-pip-bar-reserved' },
              { key: 'prospect',           label: 'Prospects',            cls: 'cl-pip-bar-prospect' },
              { key: 'past_reservation',   label: 'Lots libérés',         cls: 'cl-pip-bar-past' },
            ].map(({ key, label, cls }) => {
              const count = pipeline[key] || 0;
              const pct = clients.length > 0 ? (count / clients.length) * 100 : 0;
              return (
                <div key={key} className="cl-pip-row">
                  <div className="cl-pip-meta">
                    <span className="cl-pip-label">{label}</span>
                    <span className="cl-pip-count num">{count}</span>
                  </div>
                  <div className="cl-pip-track">
                    <div className={`cl-pip-fill ${cls}`} style={{ width: `${pct.toFixed(1)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {topClients.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0 14px' }}>
                <p className="page-eyebrow" style={{ marginTop: 14 }}>Meilleurs clients</p>
              </div>
              <div className="cp-leaderboard">
                {topClients.map((c, i) => {
                  const pct = maxCA > 0 ? Math.min(100, ((c.total_purchases || 0) / maxCA) * 100) : 0;
                  return (
                    <div
                      key={c.id}
                      className="cp-lb-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/app/clients/${c.id}`)}
                    >
                      <span className={`cp-lb-rank${i === 0 ? ' cp-lb-rank-1' : ''}`}>{i + 1}</span>
                      <div className="monogram monogram-sm">{getInitials(c.name)}</div>
                      <div className="cp-lb-identity">
                        <span className="cp-lb-name">{c.name}</span>
                        <div className="cp-lb-bar-track">
                          <div className="cp-lb-bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
                        </div>
                      </div>
                      <span className="cp-lb-value num">{formatCompactPrice(c.total_purchases)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="cp-panel-footer">
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{totalBuyers}</span>
              <span className="cp-panel-stat-lbl">Acheteurs</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{totalReservations}</span>
              <span className="cp-panel-stat-lbl">Réservations</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{formatCompactPrice(totalCA)}</span>
              <span className="cp-panel-stat-lbl">CA total</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-top">
              <div>
                <p className="page-eyebrow" style={{ marginBottom: 4 }}>Nouveau contact</p>
                <h2 className="cp-modal-title">Créer un client</h2>
              </div>
              <button className="cp-close-btn" onClick={() => setShowModal(false)}>
                <IconX />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="cp-modal-body">
                <div className="field-group">
                  <label className="field-label">Nom complet *</label>
                  <input
                    className="field-input"
                    type="text"
                    placeholder="Jean Dupont"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="form-2col">
                  <div className="field-group">
                    <label className="field-label">Téléphone</label>
                    <input
                      className="field-input"
                      type="tel"
                      placeholder="0612345678"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">CIN</label>
                    <input
                      className="field-input"
                      type="text"
                      placeholder="AB123456"
                      value={form.cin}
                      onChange={e => setForm(f => ({ ...f, cin: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="jean@exemple.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Type de client</label>
                  <select
                    className="field-input"
                    value={form.client_type}
                    onChange={e => setForm(f => ({ ...f, client_type: e.target.value }))}
                  >
                    {CLIENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Notes</label>
                  <textarea
                    className="field-input"
                    placeholder="Informations complémentaires…"
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ resize: 'vertical', minHeight: 72 }}
                  />
                </div>
              </div>

              <div className="cp-modal-footer">
                <button type="button" className="cp-btn-ghost" onClick={() => setShowModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="cp-btn-primary" disabled={saving}>
                  {saving ? 'Création…' : 'Créer le client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
