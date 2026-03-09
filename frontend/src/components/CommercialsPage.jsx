import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { formatDate, formatPrice, formatCompactPrice } from '../utils/formatters';

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
const IconEyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
  </svg>
);
const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="1.8"/>
    <line x1="2" y1="2" x2="14" y2="14"/>
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 4 13 4"/><path d="M5 4V2.5h5V4"/><path d="M2.5 4l.9 9h8.2l.9-9"/>
    <line x1="5.5" y1="6.5" x2="5.5" y2="10.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="10.5"/>
  </svg>
);
const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3v7a1 1 0 001 1h9a1 1 0 001-1V4.5a1 1 0 00-1-1H6L4.5 2H2a1 1 0 00-1 1z"/>
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

function getPerf(totalSales) {
  if (totalSales > 5) return { label: 'Top performer', cls: 'cp-badge-gold' };
  if (totalSales > 2) return { label: 'Performant', cls: 'cp-badge-green' };
  if (totalSales > 0) return { label: 'Actif', cls: 'cp-badge-blue' };
  return { label: 'Nouveau', cls: 'cp-badge-gray' };
}

/* ── Chart ─────────────────────────────────────────────── */
const CHART_COLORS = ['#d4973a', '#4a9eff', '#2ecc71', '#e05555', '#a78bfa'];

function getLast6Months() {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('fr-FR', { month: 'short' }).replace('.', '');
    result.push({ key, label });
  }
  return result;
}

function MonthlyBarChart({ data, metric }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);

  const months = getLast6Months();
  const shown = data.filter(c => c.monthly?.length > 0).slice(0, 5);

  let maxVal = 0;
  shown.forEach(c => {
    months.forEach(m => {
      const entry = c.monthly?.find(x => x.period === m.key);
      if (entry) {
        const v = metric === 'ca' ? (entry.total_amount || 0) : (entry.count || 0);
        if (v > maxVal) maxVal = v;
      }
    });
  });
  if (maxVal === 0) maxVal = 1;

  if (shown.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '20px 0', fontSize: '0.8rem' }}>
        Aucune vente ce semestre
      </div>
    );
  }

  const n = shown.length;
  const VW = 300, VH = 148;
  const LP = 36, RP = 4, TP = 6, BP = 22;
  const cW = VW - LP - RP;
  const cH = VH - TP - BP;
  const slotW = cW / months.length;
  const barW = Math.max(3, (slotW * 0.72) / n - 2);
  const barsTotal = barW * n + 2 * (n - 1);
  const slotStart = (slotW - barsTotal) / 2;
  const getBarY = v => TP + cH - (v / maxVal) * cH;
  const getBarH = v => (v / maxVal) * cH;

  const fmtTick = v => {
    if (metric === 'ca') {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
      return `${Math.round(v)}`;
    }
    return `${Math.round(v)}`;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => maxVal * f);

  const handleBarHover = (e, c, m, v, ci) => {
    if (v === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      name: c.name,
      month: m.label,
      value: v,
      color: CHART_COLORS[ci % CHART_COLORS.length],
    });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
        {yTicks.map((v, i) => {
          const y = getBarY(v);
          return (
            <g key={i}>
              <line x1={LP} y1={y} x2={VW - RP} y2={y}
                stroke="var(--border-subtle)" strokeWidth="0.5"
                strokeDasharray={i === 0 ? undefined : '2 3'}
              />
              <text x={LP - 3} y={y + 3} textAnchor="end" fontSize="7.5"
                fill="var(--text-muted)" fontFamily="var(--font-mono)">
                {fmtTick(v)}
              </text>
            </g>
          );
        })}
        {months.map((m, mi) => {
          const slotX = LP + mi * slotW;
          return (
            <g key={m.key}>
              {shown.map((c, ci) => {
                const entry = c.monthly?.find(x => x.period === m.key);
                const v = entry ? (metric === 'ca' ? (entry.total_amount || 0) : (entry.count || 0)) : 0;
                const bH = getBarH(v);
                const bY = getBarY(v);
                const bX = slotX + slotStart + ci * (barW + 2);
                return (
                  <rect key={c.commercial_id} x={bX} y={bY}
                    width={barW} height={Math.max(bH, v > 0 ? 1 : 0)} rx="1.5"
                    fill={CHART_COLORS[ci % CHART_COLORS.length]}
                    opacity={v === 0 ? 0.1 : 0.88}
                    style={{ cursor: v > 0 ? 'pointer' : 'default' }}
                    onMouseEnter={e => handleBarHover(e, c, m, v, ci)}
                    onMouseMove={e => handleBarHover(e, c, m, v, ci)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
              <text x={slotX + slotW / 2} y={VH - 5}
                textAnchor="middle" fontSize="7.5" fill="var(--text-muted)">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="cp-chart-tooltip" style={{
          left: tooltip.x + 12,
          top: tooltip.y - 72,
          transform: tooltip.x > 200 ? 'translateX(-140px)' : 'none',
        }}>
          <div className="cp-tooltip-header">
            <span className="cp-tooltip-dot" style={{ background: tooltip.color }} />
            <span className="cp-tooltip-name">{tooltip.name}</span>
          </div>
          <div className="cp-tooltip-period">{tooltip.month}</div>
          <div className="cp-tooltip-value">
            {metric === 'ca'
              ? formatCompactPrice(tooltip.value)
              : `${tooltip.value} vente${tooltip.value > 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      <div className="cp-chart-legend">
        {shown.map((c, ci) => (
          <div key={c.commercial_id} className="cp-legend-item">
            <span className="cp-legend-dot" style={{ background: CHART_COLORS[ci % CHART_COLORS.length] }} />
            <span className="cp-legend-name">{c.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────── */
export default function CommercialsPage() {
  const { token } = useAuth();
  const toast = useToast();

  /* Data */
  const [commercials, setCommercials] = useState([]);
  const [commercialStats, setCommercialStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Filters */
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('ca');
  const [filteredIds, setFilteredIds] = useState(null); // null = all

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [chartMetric, setChartMetric] = useState('ca');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  useEffect(() => {
    if (token) {
      loadCommercials();
      loadStats();
      loadProjects();
      loadMonthlyData();
    }
  }, [token]);

  useEffect(() => {
    if (!projectFilter) { setFilteredIds(null); return; }
    loadProjectCommercials(projectFilter);
  }, [projectFilter]);

  /* ── Loaders ── */
  const loadCommercials = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/users?role=commercial');
      setCommercials(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erreur lors du chargement des commerciaux');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await apiGet('/api/dashboard/commercial-stats');
      const map = {};
      if (Array.isArray(data)) data.forEach(s => { map[s.commercial_id] = s; });
      setCommercialStats(map);
    } catch { /* silent */ }
  };

  const loadProjects = async () => {
    try {
      const data = await apiGet('/api/projects');
      setProjects(Array.isArray(data) ? data : (data?.items || []));
    } catch { /* silent */ }
  };

  const loadMonthlyData = async () => {
    try {
      const data = await apiGet('/api/dashboard/commercial-monthly?months_back=6');
      setMonthlyData(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  };

  const loadProjectCommercials = async (projectId) => {
    try {
      const users = await apiGet(`/api/projects/${projectId}/users`);
      const ids = users
        .filter(u => u.role === 'commercial')
        .map(u => u.id);
      setFilteredIds(ids);
    } catch {
      setFilteredIds(null);
    }
  };

  /* ── Create ── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Le nom est requis');
    if (!form.email.trim()) return setError("L'email est requis");
    if (form.password.length < 6) return setError('Mot de passe minimum 6 caractères');
    if (form.password !== form.confirmPassword) return setError('Les mots de passe ne correspondent pas');
    setSaving(true);
    try {
      await apiPost('/api/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: 'commercial',
      });
      toast.success('Commercial créé avec succès');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', confirmPassword: '' });
      loadCommercials();
      loadStats();
    } catch (err) {
      setError(err.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async (id) => {
    try {
      await apiDelete(`/api/users/${id}`);
      toast.success('Commercial supprimé');
      setDeleteConfirm(null);
      loadCommercials();
      loadStats();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la suppression');
    }
  };

  /* ── Derived: filtered + sorted list ── */
  const displayList = useMemo(() => {
    let list = [...commercials];
    if (filteredIds) list = list.filter(c => filteredIds.includes(c.id));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const sa = commercialStats[a.id] || {};
      const sb = commercialStats[b.id] || {};
      if (sortBy === 'ca') return (sb.total_revenue || 0) - (sa.total_revenue || 0);
      if (sortBy === 'ventes') return (sb.total_sales || 0) - (sa.total_sales || 0);
      if (sortBy === 'reservations') return (sb.active_reservations || 0) - (sa.active_reservations || 0);
      return (a.name || '').localeCompare(b.name || '', 'fr');
    });
    return list;
  }, [commercials, commercialStats, filteredIds, searchQuery, sortBy]);

  /* ── Global KPIs ── */
  const totalSales = Object.values(commercialStats).reduce((s, x) => s + (x.total_sales || 0), 0);
  const totalRevenue = Object.values(commercialStats).reduce((s, x) => s + (x.total_revenue || 0), 0);
  const totalDeposits = Object.values(commercialStats).reduce((s, x) => s + (x.total_deposits || 0), 0);
  const activeReservations = Object.values(commercialStats).reduce((s, x) => s + (x.active_reservations || 0), 0);
  const maxRevenue = Math.max(...Object.values(commercialStats).map(s => s.total_revenue || 0), 1);

  /* ── Leaderboard (top 5 by CA) ── */
  const leaderboard = [...commercials]
    .sort((a, b) => (commercialStats[b.id]?.total_revenue || 0) - (commercialStats[a.id]?.total_revenue || 0))
    .slice(0, 5);

  return (
    <div className="cp-page page-container">

      {/* ── Header ── */}
      <div className="cp-header">
        <div>
          <p className="page-eyebrow">Administration</p>
          <h1 className="cp-title">Commerciaux</h1>
          <p className="cp-subtitle">Console de pilotage · Suivez les performances de votre équipe</p>
        </div>
        <div className="cp-header-actions">
          <button
            className="cp-btn-primary"
            onClick={() => {
              setShowModal(true);
              setError('');
              setShowPassword(false);
              setForm({ name: '', email: '', password: '', confirmPassword: '' });
            }}
          >
            <IconPlus />
            Nouveau commercial
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="stat-strip">
        <div className="stat-tile stat-tile-accent">
          <div className="stat-tile-value num">{commercials.length}</div>
          <div className="stat-tile-label">Commerciaux actifs</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{totalSales}</div>
          <div className="stat-tile-label">Ventes totales</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{activeReservations}</div>
          <div className="stat-tile-label">Réservations actives</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{formatCompactPrice(totalDeposits)}</div>
          <div className="stat-tile-label">Acomptes collectés</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value num">{formatCompactPrice(totalRevenue)}</div>
          <div className="stat-tile-label">CA total généré</div>
        </div>
      </div>

      {/* ── Body: team + leaderboard ── */}
      <div className="cp-body">

        {/* Left: team section */}
        <div className="cp-team">

          {/* Controls bar */}
          <div className="cp-controls">
            <div className="cp-controls-left">
              <h2 className="cp-team-title">Équipe commerciale</h2>
              <span className="badge">{displayList.length} membre{displayList.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="cp-controls-right">
              {/* Project filter */}
              <div className="cp-filter-select">
                <IconFolder />
                <select
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                >
                  <option value="">Tous les projets</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <IconChevronDown />
              </div>
              {/* Sort */}
              <div className="cp-filter-select">
                <IconSort />
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="ca">CA généré</option>
                  <option value="ventes">Ventes</option>
                  <option value="reservations">Réservations</option>
                  <option value="nom">Nom A–Z</option>
                </select>
                <IconChevronDown />
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="search-bar" style={{ marginBottom: 'var(--spacing-md)' }}>
            <IconSearch />
            <input
              placeholder="Rechercher un commercial (nom, email)…"
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

          {/* Commercial cards */}
          {loading ? (
            <div className="loading-state">Chargement…</div>
          ) : displayList.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchQuery
                  ? 'Aucun résultat pour cette recherche.'
                  : projectFilter
                  ? 'Aucun commercial assigné à ce projet.'
                  : 'Aucun commercial enregistré.'}
              </p>
              {!searchQuery && !projectFilter && (
                <button className="cp-btn-primary" onClick={() => setShowModal(true)}>
                  <IconPlus /> Ajouter le premier commercial
                </button>
              )}
            </div>
          ) : (
            <div className="cp-roster">
              {displayList.map((c, idx) => {
                const stats = commercialStats[c.id] || {};
                const perf = getPerf(stats.total_sales || 0);
                const caRatio = maxRevenue > 0
                  ? Math.min(100, ((stats.total_revenue || 0) / maxRevenue) * 100)
                  : 0;

                return (
                  <div
                    key={c.id}
                    className="cp-card"
                    style={{ animationDelay: `${idx * 0.06}s` }}
                  >

                    {/* Identity row */}
                    <div className="cp-card-top">
                      <div className="monogram monogram-lg">{getInitials(c.name)}</div>
                      <div className="cp-identity">
                        <div className="cp-identity-row">
                          <span className="identity-name">{c.name}</span>
                          <span className={`cp-perf-badge ${perf.cls}`}>{perf.label}</span>
                        </div>
                        <span className="identity-email">{c.email}</span>
                        {c.created_at && (
                          <span className="identity-meta">Depuis {formatDate(c.created_at)}</span>
                        )}
                      </div>
                      <div className="cp-card-btns">
                        <button
                          className="cp-action-btn"
                          title="Supprimer ce commercial"
                          onClick={() => setDeleteConfirm(c)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>

                    {/* Mini stats */}
                    <div className="cp-mini-stats">
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{stats.total_sales || 0}</span>
                        <span className="cp-mini-lbl">Ventes</span>
                      </div>
                      <div className="cp-mini-stat-sep" />
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{stats.active_reservations || 0}</span>
                        <span className="cp-mini-lbl">Réservations</span>
                      </div>
                      <div className="cp-mini-stat-sep" />
                      <div className="cp-mini-stat">
                        <span className="cp-mini-val num">{formatCompactPrice(stats.total_deposits || 0)}</span>
                        <span className="cp-mini-lbl">Acomptes</span>
                      </div>
                    </div>

                    {/* CA + progress bar */}
                    <div className="cp-ca-row">
                      <div className="cp-ca-labels">
                        <span className="cp-ca-label">CA généré</span>
                        <span className="cp-ca-value num">{formatPrice(stats.total_revenue || 0)}</span>
                      </div>
                      <div className="cp-ca-bar-track">
                        <div className="cp-ca-bar-fill" style={{ width: `${caRatio.toFixed(1)}%` }} />
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Performance panel */}
        <div className="cp-perf-panel card">
          <div className="cp-panel-header">
            <div className="cp-panel-header-row">
              <div>
                <p className="page-eyebrow" style={{ marginBottom: 4 }}>Performance</p>
                <h3 className="cp-panel-title">Par commercial · mois</h3>
              </div>
              <div className="chart-toggle">
                <button
                  className={`chart-tab${chartMetric === 'ventes' ? ' active' : ''}`}
                  onClick={() => setChartMetric('ventes')}
                >
                  Ventes
                </button>
                <button
                  className={`chart-tab${chartMetric === 'ca' ? ' active' : ''}`}
                  onClick={() => setChartMetric('ca')}
                >
                  CA généré
                </button>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="cp-chart-area">
            <MonthlyBarChart data={monthlyData} metric={chartMetric} />
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <>
              <div className="cp-panel-section-title">Classement CA</div>
              <div className="cp-leaderboard">
                {leaderboard.slice(0, 3).map((c, i) => {
                  const stats = commercialStats[c.id] || {};
                  const rev = stats.total_revenue || 0;
                  const pct = maxRevenue > 0 ? Math.min(100, (rev / maxRevenue) * 100) : 0;
                  return (
                    <div key={c.id} className="cp-lb-row">
                      <span className={`cp-lb-rank${i === 0 ? ' cp-lb-rank-1' : ''}`}>{i + 1}</span>
                      <div className="monogram monogram-sm">{getInitials(c.name)}</div>
                      <div className="cp-lb-identity">
                        <span className="cp-lb-name">{c.name}</span>
                        <div className="cp-lb-bar-track">
                          <div className="cp-lb-bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
                        </div>
                      </div>
                      <span className="cp-lb-value num">{formatCompactPrice(rev)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Summary footer */}
          <div className="cp-panel-footer">
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{totalSales}</span>
              <span className="cp-panel-stat-lbl">Ventes</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{activeReservations}</span>
              <span className="cp-panel-stat-lbl">Réservations</span>
            </div>
            <div className="cp-panel-stat">
              <span className="cp-panel-stat-val num">{formatCompactPrice(totalRevenue)}</span>
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
                <p className="page-eyebrow" style={{ marginBottom: 4 }}>Nouveau compte</p>
                <h2 className="cp-modal-title">Créer un commercial</h2>
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
                <div className="field-group">
                  <label className="field-label">Email *</label>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="jean.dupont@exemple.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

                <div className="field-group">
                  <label className="field-label">Mot de passe *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="field-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 caractères"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                    >
                      {showPassword ? <IconEyeOff /> : <IconEyeOpen />}
                    </button>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Confirmer le mot de passe *</label>
                  <input
                    className="field-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Répéter le mot de passe"
                    value={form.confirmPassword}
                    onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  />
                </div>

                {error && <div className="error-box">{error}</div>}
              </div>

              <div className="cp-modal-footer">
                <button type="button" className="cp-btn-ghost" onClick={() => setShowModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="cp-btn-primary" disabled={saving}>
                  {saving ? 'Création…' : 'Créer le commercial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-top">
              <div>
                <p className="page-eyebrow" style={{ marginBottom: 4, color: 'var(--color-blocked)' }}>
                  Action irréversible
                </p>
                <h2 className="cp-modal-title">Supprimer le commercial</h2>
              </div>
            </div>
            <div style={{ padding: '20px 28px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Êtes-vous sûr de vouloir supprimer{' '}
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                {deleteConfirm.name}
              </strong>{' '}
              ? Cette action est irréversible.
            </div>
            <div className="cp-modal-footer">
              <button className="cp-btn-ghost" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button className="btn-text-danger" onClick={() => handleDelete(deleteConfirm.id)}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
