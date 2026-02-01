import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = 'http://localhost:8000';

// Helper pour faire des requêtes GET avec authentification
const apiGet = async (endpoint) => {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
};

// Format currency
const formatPrice = (price) => {
  if (!price) return '0 MAD';
  return new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(price) + ' MAD';
};

// Format number with K/M suffix
const formatNumber = (num, suffix = '') => {
  if (!num || num === 0) return `0${suffix ? ' ' + suffix : ''}`;

  const absNum = Math.abs(num);

  if (absNum >= 1000000) {
    const formatted = (num / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M${suffix ? ' ' + suffix : ''}`;
  }

  if (absNum >= 1000) {
    const formatted = (num / 1000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}K${suffix ? ' ' + suffix : ''}`;
  }

  return `${Math.round(num)}${suffix ? ' ' + suffix : ''}`;
};

// Format date
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Calculate days remaining until expiration
const getDaysRemaining = (expirationDate) => {
  if (!expirationDate) return null;
  const now = new Date();
  const expDate = new Date(expirationDate);
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Helper pour faire des requêtes POST avec authentification
const apiPost = async (endpoint, data) => {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Status labels
const STATUS_LABELS = {
  available: 'Disponible',
  reserved: 'Reservé',
  sold: 'Vendu',
  blocked: 'Bloqué',
};

const PIPELINE_LABELS = {
  buyer: 'Acheteur',
  active_reservation: 'Reservation active',
  past_reservation: 'Ancienne reservation',
  prospect: 'Prospect',
};

export default function Dashboard({ onSelectLot, onNavigate, projectId: propsProjectId }) {
  const { user, isManager, isCommercial, isClient } = useAuth();
  const [stats, setStats] = useState(null);
  const [lots, setLots] = useState([]);
  const [alerts, setAlerts] = useState({ reservations: [], summary: {} });
  const [performance, setPerformance] = useState(null);
  const [clientsPipeline, setClientsPipeline] = useState([]);
  const [commercialsPerformance, setCommercialsPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  // Utiliser le projectId passé en props ou celui sélectionné
  const effectiveProjectId = propsProjectId || selectedProjectId;

  useEffect(() => {
    if (!propsProjectId) {
      loadProjects();
    }
    if (isManager()) {
      loadUsers();
    }
  }, [propsProjectId]);

  useEffect(() => {
    loadDashboardData();
  }, [effectiveProjectId, selectedUserId]);

  const loadProjects = async () => {
    try {
      const projectsData = await apiGet('/api/projects');
      setProjects(projectsData);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const usersData = await apiGet('/api/users?role=commercial');
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Construire les query params
      const params = new URLSearchParams();
      if (effectiveProjectId) params.append('project_id', effectiveProjectId);
      // Pour les commerciaux, toujours filtrer par leur propre ID
      if (isCommercial()) {
        params.append('user_id', user.id);
      } else if (selectedUserId) {
        params.append('user_id', selectedUserId);
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';

      // Requêtes de base pour tous les utilisateurs
      const alertsParams = new URLSearchParams(params);
      alertsParams.set('days', '3');
      const perfParams = new URLSearchParams(params);
      perfParams.set('period', 'month');

      const baseRequests = [
        apiGet(`/api/dashboard/stats${queryString}`),
        apiGet(`/api/dashboard/lots${queryString}`),
        apiGet(`/api/dashboard/alerts?${alertsParams.toString()}`),
        apiGet(`/api/dashboard/performance?${perfParams.toString()}`),
        apiGet(`/api/dashboard/clients-pipeline${queryString}`),
      ];

      const [statsData, lotsData, alertsData, perfData, clientsData] = await Promise.all(baseRequests);

      setStats(statsData);
      setLots(lotsData);
      setAlerts(alertsData);
      setPerformance(perfData);
      setClientsPipeline(clientsData);

      // Charger les performances des commerciaux (uniquement pour les managers)
      if (isManager()) {
        try {
          const commercialsParams = new URLSearchParams();
          if (effectiveProjectId) commercialsParams.append('project_id', effectiveProjectId);
          const commercialsQuery = commercialsParams.toString() ? `?${commercialsParams.toString()}` : '';
          const commercialsData = await apiGet(`/api/dashboard/commercials-performance${commercialsQuery}`);
          setCommercialsPerformance(commercialsData);
        } catch (err) {
          console.error('Error loading commercials performance:', err);
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard dashboard-v2">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isCommercial() ? 'Mon Activité' : 'Dashboard Commercial'}
          </h1>
          <p className="page-subtitle">
            {isCommercial()
              ? `Bienvenue ${user?.name || ''} - Suivi de vos performances`
              : 'Vue d\'ensemble de l\'activité commerciale'}
          </p>
        </div>

        {/* Filtres - Masquer le filtre projet si on est dans un projet */}
        {(!propsProjectId || isManager()) && (
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            {/* Filtre par projet - Masquer si projectId est passé en props */}
            {!propsProjectId && (
              <div style={{ minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xs)' }}>
                  Projet
                </label>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => setSelectedProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="form-input"
                  style={{ padding: 'var(--spacing-sm)' }}
                >
                  <option value="">Tous les projets</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filtre par commercial (uniquement pour les managers) */}
            {isManager() && (
              <div style={{ minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xs)' }}>
                  Commercial
                </label>
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
                  className="form-input"
                  style={{ padding: 'var(--spacing-sm)' }}
                >
                  <option value="">Tous les commerciaux</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bouton de réinitialisation */}
            {(selectedProjectId || selectedUserId) && (
              <button
                onClick={() => {
                  setSelectedProjectId(null);
                  setSelectedUserId(null);
                }}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '1.25rem' }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hero KPIs - Chiffre d'Affaires */}
      <div className="kpis-hero" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-hero-grid">
          <div className="kpis-hero-card gradient-success">
            <div className="kpis-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div className="kpis-hero-content">
              <div className="kpis-hero-value">{formatNumber(stats?.ca_realise, 'MAD')}</div>
              <div className="kpis-hero-label">{isCommercial() ? 'Mon CA Réalisé' : 'CA Réalisé'}</div>
            </div>
          </div>

          <div className="kpis-hero-card gradient-primary">
            <div className="kpis-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
            <div className="kpis-hero-content">
              <div className="kpis-hero-value">{formatNumber(stats?.ca_potentiel, 'MAD')}</div>
              <div className="kpis-hero-label">CA Potentiel</div>
            </div>
          </div>

          <div className="kpis-hero-card gradient-warning">
            <div className="kpis-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div className="kpis-hero-content">
              <div className="kpis-hero-value">{isCommercial() ? (stats?.taux_transformation || 0) : (stats?.taux_vente || 0)}%</div>
              <div className="kpis-hero-label">{isCommercial() ? 'Taux transformation' : 'Taux de vente'}</div>
            </div>
          </div>

          <div className="kpis-hero-card gradient-info">
            <div className="kpis-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <div className="kpis-hero-content">
              <div className="kpis-hero-value">{formatNumber(stats?.surfaces?.total, 'm²')}</div>
              <div className="kpis-hero-label">Surface Totale</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock de Lots - Modern Cards */}
      <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-section-header">
          <h3>
            <span className="kpis-section-icon">📦</span>
            Stock de Lots
          </h3>
          <span className="kpis-section-badge">{stats?.counts?.total || 0} lots</span>
        </div>

        <div className="kpis-stock-grid">
          <div className="kpis-stock-card available">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle available"
                  strokeDasharray={`${stats?.percentages?.available || 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.percentages?.available || 0}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{stats?.counts?.available || 0}</div>
              <div className="kpis-stock-label">Disponibles</div>
            </div>
          </div>

          <div className="kpis-stock-card reserved">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle reserved"
                  strokeDasharray={`${stats?.percentages?.reserved || 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.percentages?.reserved || 0}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{stats?.counts?.reserved || 0}</div>
              <div className="kpis-stock-label">{isCommercial() ? 'Mes réserv.' : 'Réservés'}</div>
            </div>
          </div>

          <div className="kpis-stock-card sold">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle sold"
                  strokeDasharray={`${stats?.percentages?.sold || 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.percentages?.sold || 0}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{stats?.counts?.sold || 0}</div>
              <div className="kpis-stock-label">{isCommercial() ? 'Mes ventes' : 'Vendus'}</div>
            </div>
          </div>

          {(stats?.counts?.blocked > 0 || !isCommercial()) && (
            <div className="kpis-stock-card blocked">
              <div className="kpis-stock-visual">
                <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                  <path
                    className="kpis-circle-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="kpis-circle blocked"
                    strokeDasharray={`${stats?.percentages?.blocked || 0}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="kpis-stock-percent">{stats?.percentages?.blocked || 0}%</div>
              </div>
              <div className="kpis-stock-info">
                <div className="kpis-stock-value">{stats?.counts?.blocked || 0}</div>
                <div className="kpis-stock-label">Bloqués</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Surfaces Section - Metrics List Style */}
      <div className="kpis-dual-section" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-section-v2">
          <div className="kpis-section-header">
            <h3>
              <span className="kpis-section-icon">📐</span>
              Surfaces
            </h3>
          </div>

          <div className="kpis-metrics-list">
            <div className="kpis-metric-item">
              <div className="kpis-metric-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Surface Totale</div>
                <div className="kpis-metric-value">{formatNumber(stats?.surfaces?.total, 'm²')}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon success">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Disponible</div>
                <div className="kpis-metric-value">{formatNumber(stats?.surfaces?.available, 'm²')}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Réservée</div>
                <div className="kpis-metric-value">{formatNumber(stats?.surfaces?.reserved, 'm²')}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon danger">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Vendue</div>
                <div className="kpis-metric-value">{formatNumber(stats?.surfaces?.sold, 'm²')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics for Commercials */}
        {isCommercial() && (
          <div className="kpis-section-v2">
            <div className="kpis-section-header">
              <h3>
                <span className="kpis-section-icon">⏱️</span>
                Mes Métriques
              </h3>
            </div>

            <div className="kpis-metrics-list">
              <div className="kpis-metric-item">
                <div className="kpis-metric-icon primary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="kpis-metric-content">
                  <div className="kpis-metric-label">Délai moy. réservation</div>
                  <div className="kpis-metric-value">{performance?.average_durations?.available_to_reserved || 0}j</div>
                </div>
              </div>

              <div className="kpis-metric-item">
                <div className="kpis-metric-icon success">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <div className="kpis-metric-content">
                  <div className="kpis-metric-label">Délai moy. vente</div>
                  <div className="kpis-metric-value">{performance?.average_durations?.reserved_to_sold || 0}j</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Main Column */}
        <div className="dashboard-main">
          {/* Alerts Section - Seulement pour manager et commercial */}
          {(isManager() || isCommercial()) && alerts.summary.total_at_risk > 0 && (
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title">
                  <span>⚠️</span> {isCommercial() ? 'Mes Alertes' : 'Alertes commerciales'}
                </h2>
                <span className="text-warning font-semibold">
                  {alerts.summary.total_at_risk} réservation(s) expirant dans 3 jours ou moins
                </span>
              </div>

              <div className="stats-grid mb-lg">
                <div className="stat-item">
                  <div className="stat-value text-danger">{alerts.summary.expired_count || 0}</div>
                  <div className="stat-label">Expirées</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value text-warning">{alerts.summary.expiring_soon_count || 0}</div>
                  <div className="stat-label">Expirent bientôt</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{formatNumber(alerts.summary.value_at_risk, 'MAD')}</div>
                  <div className="stat-label">Valeur à risque</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{formatNumber(alerts.summary.deposit_at_risk, 'MAD')}</div>
                  <div className="stat-label">Acomptes engagés</div>
                </div>
              </div>

              <div className="alerts-container">
                {alerts.reservations.slice(0, 5).map((alert) => (
                  <div key={alert.id} className={`alert-card ${alert.risk_type}`}>
                    <div className="alert-icon">
                      {alert.risk_type === 'expired' ? '🚨' : '⏰'}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">
                        Lot {alert.lot_numero} - {alert.client_name}
                      </div>
                      <div className="alert-details">
                        {alert.risk_type === 'expired' ? (
                          <span className="text-danger">Expirée depuis {Math.abs(Math.round(alert.days_remaining))} jour(s)</span>
                        ) : (
                          <span>Expire dans {Math.round(alert.days_remaining)} jour(s)</span>
                        )}
                        {' • '}{formatPrice(alert.lot_price)}
                        {alert.deposit > 0 && ` • Acompte: ${formatPrice(alert.deposit)}`}
                      </div>
                      <div className="alert-actions">
                        <button className="btn btn-sm btn-success">Convertir en vente</button>
                        <button className="btn btn-sm btn-ghost">Relancer</button>
                        <button className="btn btn-sm btn-ghost">Libérer</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lots Table */}
          <div className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                <span>📋</span> {isCommercial() ? 'Mes Lots & Opportunités' : 'Stock & Opportunités'}
              </h2>
              <div className="section-actions">
                <button className="btn btn-ghost btn-sm">Filtrer</button>
                <button className="btn btn-primary btn-sm" onClick={() => onNavigate && onNavigate('map')}>
                  Voir la carte
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="lots-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Zone</th>
                    <th>Surface</th>
                    <th>Prix</th>
                    <th>Statut</th>
                    <th>Jours</th>
                    <th>Temps restant</th>
                    <th>Client</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.slice(0, 15).map((lot) => {
                    const daysRemaining = lot.status === 'reserved' ? getDaysRemaining(lot.expiration_date) : null;
                    const isExpiringSoon = daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;
                    const isExpired = daysRemaining !== null && daysRemaining <= 0;

                    return (
                    <tr key={lot.id} onClick={() => onSelectLot && onSelectLot(lot)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="lot-numero">{lot.numero}</span>
                      </td>
                      <td className="lot-zone">{lot.zone || '-'}</td>
                      <td>{lot.surface ? `${lot.surface} m²` : '-'}</td>
                      <td className="font-semibold">{formatPrice(lot.price)}</td>
                      <td>
                        <span className={`status-badge ${lot.status}`}>
                          <span className="status-dot"></span>
                          {STATUS_LABELS[lot.status] || lot.status}
                        </span>
                      </td>
                      <td className="text-muted">
                        {lot.days_in_status ? Math.round(lot.days_in_status) : 0}j
                      </td>
                      <td>
                        {lot.status === 'reserved' && daysRemaining !== null ? (
                          <span style={{
                            color: isExpired ? 'var(--color-danger)' : isExpiringSoon ? 'var(--color-warning)' : 'var(--text-primary)',
                            fontWeight: (isExpired || isExpiringSoon) ? '600' : '400'
                          }}>
                            {isExpired ? `Expiré (${Math.abs(daysRemaining)}j)` : `${daysRemaining}j`}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="text-muted">
                        {lot.client_name || '-'}
                      </td>
                      <td>
                        <div className="flex gap-sm">
                          {/* Seuls les managers et commerciaux peuvent effectuer des actions */}
                          {(isManager() || isCommercial()) && (
                            <>
                              {lot.status === 'available' && (
                                <>
                                  <button className="btn btn-sm btn-warning" onClick={(e) => { e.stopPropagation(); }}>
                                    Réserver
                                  </button>
                                  <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); }}>
                                    Vendre
                                  </button>
                                </>
                              )}
                              {lot.status === 'reserved' && (
                                <>
                                  <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); }}>
                                    Vendre
                                  </button>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const days = prompt('Combien de jours voulez-vous ajouter à la réservation ?', '7');
                                      if (days && !isNaN(parseInt(days)) && parseInt(days) > 0) {
                                        try {
                                          await apiPost(`/api/reservations/${lot.reservation_id}/extend`, {
                                            additional_days: parseInt(days)
                                          });
                                          alert('Réservation prolongée avec succès!');
                                          loadDashboardData();
                                        } catch (error) {
                                          alert(error.message || 'Erreur lors de la prolongation');
                                        }
                                      }
                                    }}
                                  >
                                    Prolonger
                                  </button>
                                  <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); }}>
                                    Libérer
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          {/* Les clients voient juste le statut */}
                          {isClient() && lot.status === 'available' && (
                            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Contactez un commercial</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {lots.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <div className="empty-state-title">Aucun lot</div>
                <div className="empty-state-description">
                  Importez des lots depuis un fichier GeoJSON pour commencer.
                </div>
              </div>
            )}
          </div>

          {/* Performance Section - Masquer les stats générales pour les commerciaux (déjà dans "Ma Performance") */}
          <div className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                <span>📈</span> {isCommercial() ? 'Mon Historique de Ventes' : 'Performance commerciale'}
              </h2>
            </div>

            {/* Stats générales - seulement pour les managers */}
            {isManager() && (
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{performance?.average_durations?.available_to_reserved || 0}j</div>
                  <div className="stat-label">Durée moy. disponible → réservé</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{performance?.average_durations?.reserved_to_sold || 0}j</div>
                  <div className="stat-label">Durée moy. réservé → vendu</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats?.taux_transformation || 0}%</div>
                  <div className="stat-label">Taux de transformation</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats?.counts?.total || 0}</div>
                  <div className="stat-label">Total des lots</div>
                </div>
              </div>
            )}

            {/* Sales Chart */}
            {performance?.sales_by_period?.length > 0 && (
              <div className={isManager() ? "mt-md" : ""}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                  {isCommercial() ? 'Mes ventes par mois' : 'Ventes par mois'}
                </h3>
                <div className="chart-container">
                  {performance.sales_by_period.slice(0, 6).reverse().map((item, index) => {
                    const maxAmount = Math.max(...performance.sales_by_period.map(p => p.count || 0));
                    const height = maxAmount > 0 ? ((item.count || 0) / maxAmount) * 100 : 0;
                    return (
                      <div
                        key={index}
                        className="chart-bar"
                        style={{ height: `${Math.max(height, 5)}%` }}
                      >
                        <span className="chart-bar-value">{item.count}</span>
                        <span className="chart-bar-label">{item.period}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Performance des Commerciaux - Uniquement pour les managers */}
          {isManager() && (
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title">
                  <span>👔</span> Performance des Commerciaux
                </h2>
              </div>

              {commercialsPerformance.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="lots-table">
                    <thead>
                      <tr>
                        <th>Commercial</th>
                        <th>Ventes</th>
                        <th>CA Réalisé</th>
                        <th>Réservations</th>
                        <th>Taux Transfo.</th>
                        <th>CA Moyen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commercialsPerformance.map((commercial) => (
                        <tr key={commercial.user_id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                              <div className="client-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                                {commercial.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                              </div>
                              <div>
                                <div className="font-semibold">{commercial.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{commercial.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="font-semibold">{commercial.total_sales}</span>
                          </td>
                          <td>
                            <span className="font-semibold" style={{ color: 'var(--success)' }}>
                              {formatNumber(commercial.ca_total, 'MAD')}
                            </span>
                          </td>
                          <td>{commercial.total_reservations}</td>
                          <td>
                            <span className={`status-badge ${commercial.taux_transformation >= 50 ? 'sold' : commercial.taux_transformation >= 25 ? 'reserved' : 'available'}`}>
                              {commercial.taux_transformation}%
                            </span>
                          </td>
                          <td>{formatNumber(commercial.ca_moyen, 'MAD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">👔</div>
                  <div className="empty-state-title">Aucune donnée</div>
                  <div className="empty-state-description">
                    Les performances apparaîtront quand les commerciaux auront réalisé des ventes.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="dashboard-sidebar">
          {/* Clients Pipeline - Seulement pour manager et commercial */}
          {(isManager() || isCommercial()) && (
          <div className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                <span>👥</span> {isCommercial() ? 'Mes Clients' : 'Pipeline clients'}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate && onNavigate('clients')}>
                Voir tout
              </button>
            </div>

            <div className="client-list">
              {clientsPipeline.slice(0, 8).map((client) => (
                <div key={client.id} className="client-card">
                  <div className="client-avatar">
                    {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="client-info">
                    <div className="client-name">{client.name}</div>
                    <div className="client-details">
                      {client.active_reservations > 0 && (
                        <span>{client.active_reservations} réserv.</span>
                      )}
                      {client.total_sales > 0 && (
                        <span>{client.total_sales} achat(s)</span>
                      )}
                      {client.total_deposit > 0 && (
                        <span>{formatPrice(client.total_deposit)}</span>
                      )}
                    </div>
                  </div>
                  <span className={`pipeline-badge ${client.pipeline_status}`}>
                    {PIPELINE_LABELS[client.pipeline_status] || client.pipeline_status}
                  </span>
                </div>
              ))}
            </div>

            {clientsPipeline.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">👥</div>
                <div className="empty-state-title">Aucun client</div>
                <button className="btn btn-primary btn-sm" onClick={() => onNavigate && onNavigate('clients')}>
                  Ajouter un client
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
