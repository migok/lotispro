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
  const [selectedStatuses, setSelectedStatuses] = useState(['sold', 'reserved', 'blocked']); // Filtre par statut (pas de disponible)

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

      {/* Performance Financière */}
      <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-section-header">
          <h3>
            <span className="kpis-section-icon">💰</span>
            {isCommercial() ? 'Ma Performance' : 'Performance Financière'}
          </h3>
          <span className="kpis-section-badge">{formatNumber(stats?.ca_total, 'MAD')} total</span>
        </div>

        <div className="kpis-stock-grid">
          <div className="kpis-stock-card sold">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle sold"
                  strokeDasharray={`${stats?.ca_total ? ((stats?.ca_realise || 0) / stats.ca_total * 100).toFixed(2) : 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.ca_total ? ((stats?.ca_realise || 0) / stats.ca_total * 100).toFixed(2) : '0.00'}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{formatNumber(stats?.ca_realise, 'MAD')}</div>
              <div className="kpis-stock-label">
                {isCommercial() ? 'Mon CA Réalisé' : 'CA Réalisé'}
                <span className="kpis-info-icon kpis-info-icon-dark" title="Somme des lots vendus">ⓘ</span>
              </div>
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
                  strokeDasharray={`${stats?.ca_total ? ((stats?.ca_potentiel || 0) / stats.ca_total * 100).toFixed(2) : 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.ca_total ? ((stats?.ca_potentiel || 0) / stats.ca_total * 100).toFixed(2) : '0.00'}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{formatNumber(stats?.ca_potentiel, 'MAD')}</div>
              <div className="kpis-stock-label">
                CA Potentiel
                <span className="kpis-info-icon kpis-info-icon-dark" title="Valeur des lots réservés">ⓘ</span>
              </div>
            </div>
          </div>

          <div className="kpis-stock-card available">
            <div className="kpis-stock-visual">
              <div className="kpis-financial-icon">📈</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{isCommercial() ? (stats?.taux_transformation || 0) : (stats?.taux_vente || 0)}%</div>
              <div className="kpis-stock-label">
                {isCommercial() ? 'Taux transformation' : 'Taux de vente'}
                <span className="kpis-info-icon kpis-info-icon-dark" title={isCommercial() ? 'Réservations converties en ventes' : 'Lots vendus / Total lots'}>ⓘ</span>
              </div>
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
              <div className="kpis-stock-label">
                Disponibles
                <span className="kpis-info-icon kpis-info-icon-dark" title="Lots prêts à la vente">ⓘ</span>
              </div>
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
              <div className="kpis-stock-label">
                {isCommercial() ? 'Mes réserv.' : 'Réservés'}
                <span className="kpis-info-icon kpis-info-icon-dark" title="Lots avec réservation active">ⓘ</span>
              </div>
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
              <div className="kpis-stock-label">
                {isCommercial() ? 'Mes ventes' : 'Vendus'}
                <span className="kpis-info-icon kpis-info-icon-dark" title="Lots vendus définitivement">ⓘ</span>
              </div>
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
                <div className="kpis-stock-label">
                  Bloqués
                  <span className="kpis-info-icon kpis-info-icon-dark" title="Lots temporairement indisponibles">ⓘ</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Répartition par Catégorie */}
      <div className="kpis-categories-section" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-section-header" style={{ marginBottom: 'var(--spacing-md)' }}>
          <h3>
            <span className="kpis-section-icon">📊</span>
            Répartition par Catégorie
          </h3>
        </div>

        <div className="kpis-categories-grid">
          {/* Par Type de Lot */}
          <div className="kpis-section-v2">
            <div className="kpis-section-header">
              <h4 style={{ fontSize: '0.875rem', margin: 0 }}>
                <span className="kpis-section-icon">🏷️</span>
                Par Type de Lot
              </h4>
            </div>
            <div className="kpis-category-list">
              {stats?.by_type_lot && Object.entries(stats.by_type_lot).length > 0 ? (
                Object.entries(stats.by_type_lot).map(([typeLot, data]) => (
                  <div key={typeLot} className="kpis-category-item">
                    <div className="kpis-category-name">{typeLot || 'Non défini'}</div>
                    <div className="kpis-category-stats">
                      <span className="stat-sold" title="Vendus">{data.sold || 0} vendus</span>
                      <span className="stat-reserved" title="Réservés">{data.reserved || 0} réservés</span>
                      <span className="stat-available" title="Disponibles">{data.available || 0} dispo</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="kpis-category-empty">Aucune donnée</div>
              )}
            </div>
          </div>

          {/* Par Emplacement */}
          <div className="kpis-section-v2">
            <div className="kpis-section-header">
              <h4 style={{ fontSize: '0.875rem', margin: 0 }}>
                <span className="kpis-section-icon">📍</span>
                Par Emplacement
              </h4>
            </div>
            <div className="kpis-category-list">
              {stats?.by_emplacement && Object.entries(stats.by_emplacement).length > 0 ? (
                Object.entries(stats.by_emplacement).map(([emplacement, data]) => (
                  <div key={emplacement} className="kpis-category-item">
                    <div className="kpis-category-name">{emplacement || 'Non défini'}</div>
                    <div className="kpis-category-stats">
                      <span className="stat-sold" title="Vendus">{data.sold || 0} vendus</span>
                      <span className="stat-reserved" title="Réservés">{data.reserved || 0} réservés</span>
                      <span className="stat-available" title="Disponibles">{data.available || 0} dispo</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="kpis-category-empty">Aucune donnée</div>
              )}
            </div>
          </div>

          {/* Par Type de Maison */}
          <div className="kpis-section-v2">
            <div className="kpis-section-header">
              <h4 style={{ fontSize: '0.875rem', margin: 0 }}>
                <span className="kpis-section-icon">🏠</span>
                Par Type de Maison
              </h4>
            </div>
            <div className="kpis-category-list">
              {stats?.by_type_maison && Object.entries(stats.by_type_maison).length > 0 ? (
                Object.entries(stats.by_type_maison).map(([typeMaison, data]) => (
                  <div key={typeMaison} className="kpis-category-item">
                    <div className="kpis-category-name">{typeMaison || 'Non défini'}</div>
                    <div className="kpis-category-stats">
                      <span className="stat-sold" title="Vendus">{data.sold || 0} vendus</span>
                      <span className="stat-reserved" title="Réservés">{data.reserved || 0} réservés</span>
                      <span className="stat-available" title="Disponibles">{data.available || 0} dispo</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="kpis-category-empty">Aucune donnée</div>
              )}
            </div>
          </div>
        </div>
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
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginRight: 'var(--spacing-sm)' }}>
                  {['sold', 'reserved', 'blocked'].map(status => (
                    <button
                      key={status}
                      className={`btn btn-sm ${selectedStatuses.includes(status) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => {
                        setSelectedStatuses(prev =>
                          prev.includes(status)
                            ? prev.filter(s => s !== status)
                            : [...prev, status]
                        );
                      }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
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
                  {lots.filter(lot => selectedStatuses.length === 0 || selectedStatuses.includes(lot.status)).slice(0, 15).map((lot) => {
                    const daysRemaining = lot.status === 'reserved' ? getDaysRemaining(lot.expiration_date) : null;
                    const isExpiringSoon = daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;
                    const isExpired = daysRemaining !== null && daysRemaining <= 0;

                    return (
                    <tr key={lot.id} onClick={() => onSelectLot && onSelectLot(lot)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="lot-numero">{lot.numero}</span>
                      </td>
                      <td className="lot-zone">{lot.zone || '-'}</td>
                      <td>{lot.surface ? `${Math.round(parseFloat(lot.surface))} m²` : '-'}</td>
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

            {lots.filter(lot => selectedStatuses.length === 0 || selectedStatuses.includes(lot.status)).length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <div className="empty-state-title">Aucun lot</div>
                <div className="empty-state-description">
                  Aucun lot ne correspond aux filtres sélectionnés.
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

            {/* Sales History Table */}
            {performance?.sales_by_period?.length > 0 && (
              <div className={isManager() ? "mt-md" : ""}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                  {isCommercial() ? 'Mes ventes par mois' : 'Ventes par mois'}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="lots-table">
                    <thead>
                      <tr>
                        <th>Période</th>
                        <th>Ventes</th>
                        <th>CA</th>
                        <th>Évolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const sortedPeriods = [...performance.sales_by_period].sort((a, b) => b.period.localeCompare(a.period));
                        return sortedPeriods.slice(0, 6).map((item, index) => {
                          const prevItem = sortedPeriods[index + 1];
                          const countEvolution = prevItem && prevItem.count > 0
                            ? ((item.count - prevItem.count) / prevItem.count * 100).toFixed(1)
                            : null;
                          const caEvolution = prevItem && prevItem.total_amount > 0
                            ? ((item.total_amount - prevItem.total_amount) / prevItem.total_amount * 100).toFixed(1)
                            : null;

                          return (
                            <tr key={item.period}>
                              <td className="font-semibold">{item.period}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                  <span>{item.count}</span>
                                  {countEvolution !== null && (
                                    <span style={{
                                      fontSize: '0.75rem',
                                      color: parseFloat(countEvolution) >= 0 ? 'var(--success)' : 'var(--color-danger)',
                                      fontWeight: '500'
                                    }}>
                                      {parseFloat(countEvolution) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(countEvolution))}%
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="font-semibold" style={{ color: 'var(--success)' }}>
                                {formatNumber(item.total_amount, 'MAD')}
                              </td>
                              <td>
                                {caEvolution !== null ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    backgroundColor: parseFloat(caEvolution) >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: parseFloat(caEvolution) >= 0 ? 'var(--success)' : 'var(--color-danger)'
                                  }}>
                                    {parseFloat(caEvolution) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(caEvolution))}%
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
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
