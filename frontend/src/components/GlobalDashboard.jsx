import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../utils/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

// ─── Inject scoped styles once ───────────────────────────────────────────────
const STYLE_ID = "gdb-styles";
const STYLES = `
/* ── GlobalDashboard ── */
.gdb-root {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: var(--spacing-xl) var(--spacing-xl) 64px;
  max-width: 1360px;
  margin: 0 auto;
  font-family: var(--font-body);
}

/* Header */
.gdb-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--spacing-xl);
  gap: var(--spacing-md);
  flex-wrap: wrap;
}
.gdb-header-left {}
.gdb-eyebrow {
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: var(--spacing-xs);
}
.gdb-title {
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  margin: 0 0 6px;
}
.gdb-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
}
.gdb-subtitle strong {
  color: var(--text-secondary);
  font-weight: 500;
}

/* Quick Actions */
.gdb-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
.gdb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s, transform 0.1s;
  text-decoration: none;
  white-space: nowrap;
}
.gdb-btn:hover { opacity: 0.85; transform: translateY(-1px); }
.gdb-btn:active { transform: translateY(0); }
.gdb-btn svg { flex-shrink: 0; }
.gdb-btn-primary {
  background: var(--color-primary);
  color: #ffffff;
}
.gdb-btn-ghost {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}
.gdb-btn-ghost:hover { color: var(--text-primary); border-color: var(--border-gold); }

/* KPI Strip */
.gdb-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}
@media (max-width: 1100px) { .gdb-strip { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px) { .gdb-strip { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 420px) { .gdb-strip { grid-template-columns: 1fr; } }

.gdb-tile {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;
}
.gdb-tile::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--tile-accent, var(--border-subtle));
  opacity: 0.7;
}
.gdb-tile:hover { border-color: var(--border-gold); box-shadow: var(--shadow-md); }

.gdb-tile-icon {
  width: 36px; height: 36px;
  border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  background: var(--tile-icon-bg, var(--bg-surface));
  color: var(--tile-accent, var(--text-secondary));
  margin-bottom: 4px;
}
.gdb-tile-value {
  font-family: var(--font-body);
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: var(--num-features);
}
.gdb-tile-label {
  font-size: 0.74rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
}
.gdb-tile-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Two-column body */
.gdb-body {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--spacing-xl);
  align-items: start;
}
@media (max-width: 1024px) { .gdb-body { grid-template-columns: 1fr; } }

/* Section heading */
.gdb-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}
.gdb-section-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.gdb-section-link {
  font-size: 0.76rem;
  color: var(--color-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: gap 0.15s;
}
.gdb-section-link:hover { gap: 7px; }

/* Project Cards grid */
.gdb-proj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--spacing-md);
}
.gdb-proj-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  cursor: pointer;
}
.gdb-proj-card:hover {
  border-color: var(--border-gold);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.gdb-proj-name {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.gdb-proj-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* Progress bar */
.gdb-progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.gdb-progress-bar {
  height: 4px;
  background: var(--bg-primary);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.gdb-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
}
.gdb-progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.gdb-progress-labels span:first-child { color: var(--color-primary); font-weight: 500; }

/* Lot chips */
.gdb-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.gdb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.gdb-chip-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.gdb-chip-avail { background: rgba(46,204,113,0.1); color: var(--color-success); }
.gdb-chip-avail .gdb-chip-dot { background: var(--color-success); }
.gdb-chip-res { background: rgba(232,169,58,0.1); color: var(--color-warning); }
.gdb-chip-res .gdb-chip-dot { background: var(--color-warning); }
.gdb-chip-sold { background: rgba(96,165,250,0.1); color: var(--color-info); }
.gdb-chip-sold .gdb-chip-dot { background: var(--color-info); }

.gdb-proj-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-subtle);
}
.gdb-voir-btn {
  font-size: 0.75rem;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-family: var(--font-body);
  font-weight: 500;
  transition: gap 0.15s;
}
.gdb-voir-btn:hover { gap: 7px; }

/* Right panel */
.gdb-right {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

/* Alert/Payment list */
.gdb-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.gdb-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-subtle);
  gap: var(--spacing-sm);
}
.gdb-panel-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gdb-panel-count {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.gdb-panel-count.has-items { background: rgba(224,85,85,0.15); color: var(--color-danger); }
.gdb-panel-count.warning { background: rgba(232,169,58,0.15); color: var(--color-warning); }

.gdb-panel-empty {
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.gdb-panel-empty svg { opacity: 0.3; }

/* Alert row */
.gdb-alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px var(--spacing-lg);
  border-bottom: 1px solid var(--border-subtle);
  gap: var(--spacing-sm);
  transition: background 0.15s;
}
.gdb-alert-row:last-child { border-bottom: none; }
.gdb-alert-row:hover { background: var(--bg-surface); }
.gdb-alert-info { flex: 1; min-width: 0; }
.gdb-alert-client {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gdb-alert-lot {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 1px;
}
.gdb-days-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.gdb-days-critical { background: rgba(224,85,85,0.15); color: var(--color-danger); }
.gdb-days-warn { background: rgba(232,169,58,0.15); color: var(--color-warning); }

/* Late payment row */
.gdb-pay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px var(--spacing-lg);
  border-bottom: 1px solid var(--border-subtle);
  gap: var(--spacing-sm);
  transition: background 0.15s;
}
.gdb-pay-row:last-child { border-bottom: none; }
.gdb-pay-row:hover { background: var(--bg-surface); }
.gdb-pay-info { flex: 1; min-width: 0; }
.gdb-pay-client {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gdb-pay-meta {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gdb-pay-amount {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-danger);
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: var(--num-features);
  white-space: nowrap;
}

/* Loading shimmer */
.gdb-shimmer {
  background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-tertiary) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: gdb-shimmer 1.4s infinite;
  border-radius: var(--radius-md);
}
@keyframes gdb-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.gdb-skel { border-radius: var(--radius-lg); }

/* Fade-in animation */
@keyframes gdb-fadein {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.gdb-tile { animation: gdb-fadein 0.35s ease both; }
.gdb-tile:nth-child(1) { animation-delay: 0.05s; }
.gdb-tile:nth-child(2) { animation-delay: 0.10s; }
.gdb-tile:nth-child(3) { animation-delay: 0.15s; }
.gdb-tile:nth-child(4) { animation-delay: 0.20s; }
.gdb-tile:nth-child(5) { animation-delay: 0.25s; }
.gdb-proj-card { animation: gdb-fadein 0.35s ease both; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtCurrency = (v) => {
  if (!v && v !== 0) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M MAD`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K MAD`;
  return `${v} MAD`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const todayLabel = () =>
  new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconGrid = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="7" height="7" rx="1"/>
    <rect x="11" y="2" width="7" height="7" rx="1"/>
    <rect x="2" y="11" width="7" height="7" rx="1"/>
    <rect x="11" y="11" width="7" height="7" rx="1"/>
  </svg>
);
const IconLot = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10L10 3l7 7v7H3V10z"/>
  </svg>
);
const IconCash = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="5" width="18" height="11" rx="2"/>
    <circle cx="10" cy="10.5" r="2.5"/>
    <path d="M5 5V4a2 2 0 012-2h6a2 2 0 012 2v1"/>
  </svg>
);
const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L2 17h16L10 2z"/>
    <path d="M10 8v4"/>
    <circle cx="10" cy="14.5" r="0.5" fill="currentColor" stroke="none"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10 4v12M4 10h12"/>
  </svg>
);
const IconUsers = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="6" r="3"/>
    <path d="M1 17c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6"/>
  </svg>
);
const IconBriefcase = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="16" height="11" rx="1"/>
    <path d="M7 7V5a2 2 0 014 0v2"/>
    <path d="M10 12v2"/>
  </svg>
);
const IconArrowRight = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h12M12 6l4 4-4 4"/>
  </svg>
);
const IconClock = () => (
  <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="8"/>
    <path d="M10 6v4l3 2"/>
  </svg>
);
const IconCheckCircle = () => (
  <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="8"/>
    <path d="M6 10l3 3 5-5"/>
  </svg>
);
const IconPayment = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="5" width="18" height="11" rx="2"/>
    <path d="M1 9h18"/>
    <path d="M5 13h3"/>
  </svg>
);

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
const TileSkeleton = () => (
  <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "var(--spacing-lg)", display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="gdb-shimmer gdb-skel" style={{ width: 36, height: 36 }} />
    <div className="gdb-shimmer gdb-skel" style={{ width: "55%", height: 28 }} />
    <div className="gdb-shimmer gdb-skel" style={{ width: "70%", height: 12 }} />
  </div>
);
const CardSkeleton = () => (
  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "var(--spacing-lg)", display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="gdb-shimmer gdb-skel" style={{ width: "70%", height: 18 }} />
    <div className="gdb-shimmer gdb-skel" style={{ width: "100%", height: 4 }} />
    <div style={{ display: "flex", gap: 8 }}>
      <div className="gdb-shimmer gdb-skel" style={{ width: 60, height: 18, borderRadius: "9999px" }} />
      <div className="gdb-shimmer gdb-skel" style={{ width: 60, height: 18, borderRadius: "9999px" }} />
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GlobalDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [latePayments, setLatePayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const isManager = user?.role === "manager";

  useEffect(() => { injectStyles(); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Pour les commerciaux : filtrer sur leur propre activité
      const uid = !isManager && user?.id ? user.id : null;
      const statsUrl = uid ? `/api/dashboard/stats?user_id=${uid}` : "/api/dashboard/stats";
      const alertsUrl = uid ? `/api/dashboard/alerts?days=7&user_id=${uid}` : "/api/dashboard/alerts?days=7";
      const [projRes, statsRes, alertRes, payRes] = await Promise.allSettled([
        apiGet("/api/projects"),
        apiGet(statsUrl),
        apiGet(alertsUrl),
        apiGet("/api/dashboard/late-payments"),
      ]);

      if (projRes.status === "fulfilled") {
        const data = projRes.value;
        setProjects(Array.isArray(data) ? data : (data?.projects ?? []));
      }
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (alertRes.status === "fulfilled") {
        const d = alertRes.value;
        setAlerts(Array.isArray(d) ? d : (d?.reservations ?? []));
      }
      if (payRes.status === "fulfilled") {
        const d = payRes.value;
        setLatePayments(Array.isArray(d) ? d : []);
      }
    } catch (err) {
      showToast("Erreur lors du chargement du tableau de bord", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, isManager, user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalProjects = projects.length;
  const availableCount = stats?.counts?.available ?? 0;
  const caRealise = stats?.ca_realise ?? 0;
  const alertCount = alerts.length;
  const lateCount = latePayments.length;
  const lotsLiberes = stats?.lots_liberes ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="gdb-root">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="gdb-header">
        <div className="gdb-header-left">
          <div className="gdb-eyebrow">{isManager ? "Vue globale" : "Mon activité"}</div>
          <h1 className="gdb-title">Tableau de Bord</h1>
          <div className="gdb-subtitle">
            <strong>{todayLabel()}</strong>
            {user?.name && (
              <> &nbsp;·&nbsp; Bienvenue, <strong>{user.name.split(" ")[0]}</strong></>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="gdb-actions">
          {isManager && (
            <button className="gdb-btn gdb-btn-primary" onClick={() => navigate("/app/projects")}>
              <IconPlus />
              Nouveau projet
            </button>
          )}
          <button className="gdb-btn gdb-btn-primary" onClick={() => navigate("/app/clients")}>
            <IconUsers />
            Clients
          </button>
          {isManager && (
            <button className="gdb-btn gdb-btn-primary" onClick={() => navigate("/app/commerciaux")}>
              <IconBriefcase />
              Commerciaux
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="gdb-strip">
        {loading ? (
          <>
            <TileSkeleton /> <TileSkeleton /> <TileSkeleton /> <TileSkeleton /> <TileSkeleton />
          </>
        ) : (
          <>
            <div className="gdb-tile" style={{ "--tile-accent": "var(--color-primary)", "--tile-icon-bg": "var(--color-primary-subtle)" }}>
              <div className="gdb-tile-icon"><IconGrid /></div>
              <div className="gdb-tile-value num">{totalProjects}</div>
              <div className="gdb-tile-label">
                {isManager ? "Projets actifs" : "Mes projets"}
                <span className="kpis-info-icon" title={isManager ? "Nombre de projets immobiliers actifs sur la plateforme" : "Projets immobiliers qui vous sont assignés"}>ⓘ</span>
              </div>
              <div className="gdb-tile-sub">{totalProjects === 1 ? "1 projet assigné" : `${totalProjects} projets assignés`}</div>
            </div>

            {isManager ? (
              <div className="gdb-tile" style={{ "--tile-accent": "var(--color-success)", "--tile-icon-bg": "rgba(46,204,113,0.1)" }}>
                <div className="gdb-tile-icon" style={{ color: "var(--color-success)" }}><IconLot /></div>
                <div className="gdb-tile-value num">{availableCount}</div>
                <div className="gdb-tile-label">
                  Lots disponibles
                  <span className="kpis-info-icon" title="Lots libres, prêts à la vente sur l'ensemble des projets">ⓘ</span>
                </div>
                <div className="gdb-tile-sub">
                  {stats ? `${stats.counts?.total ?? 0} lots au total` : "—"}
                </div>
              </div>
            ) : (
              <div className="gdb-tile" style={{ "--tile-accent": "var(--color-warning)", "--tile-icon-bg": "rgba(245,158,11,0.1)" }}>
                <div className="gdb-tile-icon" style={{ color: "var(--color-warning)" }}><IconLot /></div>
                <div className="gdb-tile-value num">{stats?.counts?.reserved ?? 0}</div>
                <div className="gdb-tile-label">
                  Mes réservations
                  <span className="kpis-info-icon" title="Lots que vous avez réservés pour vos clients — statut actif ou validé">ⓘ</span>
                </div>
                <div className="gdb-tile-sub">
                  {(stats?.counts?.sold ?? 0) > 0 ? `${stats.counts.sold} vente${stats.counts.sold > 1 ? "s" : ""} confirmée${stats.counts.sold > 1 ? "s" : ""}` : "Réservations en cours"}
                </div>
              </div>
            )}

            <div className="gdb-tile" style={{ "--tile-accent": "var(--color-primary)", "--tile-icon-bg": "var(--color-primary-subtle)" }}>
              <div className="gdb-tile-icon"><IconCash /></div>
              <div className="gdb-tile-value num" style={{ fontSize: caRealise >= 1_000_000 ? "1.45rem" : "1.75rem" }}>
                {fmtCurrency(caRealise)}
              </div>
              <div className="gdb-tile-label">
                {isManager ? "CA Réalisé" : "Mon CA"}
                <span className="kpis-info-icon" title="Chiffre d'affaires confirmé : ventes finalisées + acomptes des réservations validées">ⓘ</span>
              </div>
              <div className="gdb-tile-sub">
                {stats?.ca_potentiel ? `+ ${fmtCurrency(stats.ca_potentiel)} potentiel` : "Ventes confirmées"}
              </div>
            </div>

            <div
              className="gdb-tile"
              style={{
                "--tile-accent": alertCount > 0 ? "var(--color-danger)" : "var(--color-success)",
                "--tile-icon-bg": alertCount > 0 ? "rgba(224,85,85,0.1)" : "rgba(46,204,113,0.1)",
              }}
            >
              <div className="gdb-tile-icon" style={{ color: alertCount > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                <IconAlert />
              </div>
              <div className="gdb-tile-value num" style={{ color: alertCount > 0 ? "var(--color-danger)" : undefined }}>
                {alertCount}
              </div>
              <div className="gdb-tile-label">
                Alertes actives
                <span className="kpis-info-icon" title="Réservations dont la date d'expiration approche dans les 7 jours — à relancer ou convertir en vente">ⓘ</span>
              </div>
              <div className="gdb-tile-sub">
                {alertCount === 0
                  ? "Aucune réservation à risque"
                  : `${alertCount} réservation${alertCount > 1 ? "s" : ""} à risque`}
              </div>
            </div>

            <div className="gdb-tile" style={{ "--tile-accent": "#a78bfa", "--tile-icon-bg": "rgba(167,139,250,0.1)" }}>
              <div className="gdb-tile-icon" style={{ color: "#a78bfa" }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <rect x="3" y="9" width="14" height="10" rx="2"/>
                  <path d="M7 9V6a3 3 0 0 1 6 0"/>
                  <circle cx="10" cy="14" r="1.2" fill="currentColor" stroke="none"/>
                </svg>
              </div>
              <div className="gdb-tile-value num" style={{ color: "#a78bfa" }}>{lotsLiberes}</div>
              <div className="gdb-tile-label">
                Lots libérés
                <span className="kpis-info-icon" title="Réservations annulées ou expirées — ces lots sont redevenus disponibles à la vente">ⓘ</span>
              </div>
              <div className="gdb-tile-sub">
                {lotsLiberes === 0
                  ? "Aucune réservation libérée"
                  : `${lotsLiberes} réservation${lotsLiberes > 1 ? "s" : ""} annulée${lotsLiberes > 1 ? "s" : ""} / expirée${lotsLiberes > 1 ? "s" : ""}`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="gdb-body">

        {/* Left: Projects */}
        <div>
          <div className="gdb-section-head">
            <div className="gdb-section-title">Projets</div>
            <button className="gdb-section-link" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }} onClick={() => navigate("/app/projects")}>
              Voir tous <IconArrowRight />
            </button>
          </div>

          {loading ? (
            <div className="gdb-proj-grid">
              <CardSkeleton /><CardSkeleton /><CardSkeleton />
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, margin: "0 auto 8px" }}>
                <rect x="2" y="2" width="7" height="7" rx="1"/>
                <rect x="11" y="2" width="7" height="7" rx="1"/>
                <rect x="2" y="11" width="7" height="7" rx="1"/>
                <rect x="11" y="11" width="7" height="7" rx="1"/>
              </svg>
              <div>Aucun projet pour le moment</div>
              {isManager && (
                <button className="gdb-btn gdb-btn-primary" style={{ marginTop: 12 }} onClick={() => navigate("/app/projects")}>
                  <IconPlus /> Créer un projet
                </button>
              )}
            </div>
          ) : (
            <div className="gdb-proj-grid">
              {projects.map((p, i) => {
                const total = p.total_lots ?? 0;
                const sold = p.sold_lots ?? 0;
                const reserved = p.reserved_lots ?? 0;
                const available = total - sold - reserved;
                const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
                return (
                  <div
                    key={p.id}
                    className="gdb-proj-card"
                    style={{ animationDelay: `${0.05 * i}s` }}
                    onClick={() => navigate(`/app/projects/${p.id}`)}
                  >
                    <div>
                      <div className="gdb-proj-name">{p.name}</div>
                      <div className="gdb-proj-meta">{total} lots · créé le {fmtDate(p.created_at)}</div>
                    </div>

                    <div className="gdb-progress-wrap">
                      <div className="gdb-progress-bar">
                        <div className="gdb-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="gdb-progress-labels">
                        <span>{pct}% vendus</span>
                        <span>{sold}/{total}</span>
                      </div>
                    </div>

                    <div className="gdb-chips">
                      <span className="gdb-chip gdb-chip-avail">
                        <span className="gdb-chip-dot" /> {available} dispo.
                      </span>
                      {reserved > 0 && (
                        <span className="gdb-chip gdb-chip-res">
                          <span className="gdb-chip-dot" /> {reserved} rés.
                        </span>
                      )}
                      {sold > 0 && (
                        <span className="gdb-chip gdb-chip-sold">
                          <span className="gdb-chip-dot" /> {sold} vendus
                        </span>
                      )}
                    </div>

                    <div className="gdb-proj-footer">
                      <button className="gdb-voir-btn" onClick={(e) => { e.stopPropagation(); navigate(`/app/projects/${p.id}`); }}>
                        Voir le projet <IconArrowRight />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Alerts + Late Payments */}
        <div className="gdb-right">

          {/* Alertes */}
          <div>
            <div className="gdb-section-head">
              <div className="gdb-section-title">Alertes</div>
            </div>
            <div className="gdb-panel">
              <div className="gdb-panel-head">
                <div className="gdb-panel-title">
                  <IconAlert />
                  Réservations à risque
                </div>
                <span className={`gdb-panel-count ${alertCount > 0 ? "has-items" : ""}`}>
                  {alertCount}
                </span>
              </div>

              {loading ? (
                <div style={{ padding: "var(--spacing-lg)" }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0" }}>
                      <div className="gdb-shimmer gdb-skel" style={{ flex: 1, height: 12 }} />
                      <div className="gdb-shimmer gdb-skel" style={{ width: 50, height: 18, borderRadius: "9999px" }} />
                    </div>
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <div className="gdb-panel-empty">
                  <IconCheckCircle />
                  Aucune réservation à risque
                </div>
              ) : (
                alerts.slice(0, 5).map((a) => {
                  const days = daysUntil(a.expiration_date);
                  return (
                    <div key={a.id} className="gdb-alert-row">
                      <div className="gdb-alert-info">
                        <div className="gdb-alert-client">{a.client_name ?? "Client inconnu"}</div>
                        <div className="gdb-alert-lot">
                          Lot {a.lot_numero}
                          {a.project_name ? ` · ${a.project_name}` : ""}
                        </div>
                      </div>
                      <span className={`gdb-days-badge ${days !== null && days <= 2 ? "gdb-days-critical" : "gdb-days-warn"}`}>
                        {days === null ? "—" : days <= 0 ? "Expiré" : `J-${days}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Paiements en retard */}
          <div>
            <div className="gdb-section-head">
              <div className="gdb-section-title">Paiements</div>
            </div>
            <div className="gdb-panel">
              <div className="gdb-panel-head">
                <div className="gdb-panel-title">
                  <IconPayment />
                  Retards de paiement
                </div>
                <span className={`gdb-panel-count ${lateCount > 0 ? "warning" : ""}`}>
                  {lateCount}
                </span>
              </div>

              {loading ? (
                <div style={{ padding: "var(--spacing-lg)" }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0" }}>
                      <div className="gdb-shimmer gdb-skel" style={{ flex: 1, height: 12 }} />
                      <div className="gdb-shimmer gdb-skel" style={{ width: 70, height: 14 }} />
                    </div>
                  ))}
                </div>
              ) : latePayments.length === 0 ? (
                <div className="gdb-panel-empty">
                  <IconCheckCircle />
                  Aucun paiement en retard
                </div>
              ) : (
                latePayments.slice(0, 5).map((p) => (
                  <div key={p.id} className="gdb-pay-row">
                    <div className="gdb-pay-info">
                      <div className="gdb-pay-client">{p.client_name ?? "Client inconnu"}</div>
                      <div className="gdb-pay-meta">
                        Lot {p.lot_numero}
                        {p.project_name ? ` · ${p.project_name}` : ""}
                        {p.due_date ? ` · Échu le ${fmtDate(p.due_date)}` : ""}
                      </div>
                    </div>
                    <div className="gdb-pay-amount num">
                      {fmtCurrency(p.amount_due)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
