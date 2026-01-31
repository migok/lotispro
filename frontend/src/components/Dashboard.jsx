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
      const baseRequests = [
        apiGet(`/api/dashboard/stats${queryString}`),
        apiGet(`/api/dashboard/lots${queryString}`),
        apiGet(`/api/dashboard/alerts?days_threshold=7${queryString ? '&' + params.toString() : ''}`),
        apiGet(`/api/dashboard/performance?period=month${queryString ? '&' + params.toString() : ''}`),
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
    <div className="dashboard">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isCommercial() ? `Mon Activité` : 'Dashboard Commercial'}
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
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-sm)',
                    border: '1px solid var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
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
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-sm)',
                    border: '1px solid var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
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

      {/* KPIs Section - Fusionnée pour les commerciaux */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon available">📦</div>
          </div>
          <div className="kpi-value">{stats?.counts?.available || 0}</div>
          <div className="kpi-label">Lots disponibles</div>
          <div className="kpi-trend">{stats?.percentages?.available || 0}% du total</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon reserved">📋</div>
          </div>
          <div className="kpi-value">{stats?.counts?.reserved || 0}</div>
          <div className="kpi-label">{isCommercial() ? 'Mes réservations' : 'Lots réservés'}</div>
          <div className="kpi-trend">{stats?.percentages?.reserved || 0}% du total</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon sold">✅</div>
          </div>
          <div className="kpi-value">{stats?.counts?.sold || 0}</div>
          <div className="kpi-label">{isCommercial() ? 'Mes ventes' : 'Lots vendus'}</div>
          <div className="kpi-trend">{stats?.percentages?.sold || 0}% du total</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon chart">📊</div>
          </div>
          <div className="kpi-value">{isCommercial() ? (stats?.taux_transformation || 0) : (stats?.taux_vente || 0)}%</div>
          <div className="kpi-label">{isCommercial() ? 'Taux de transformation' : 'Taux de vente'}</div>
        </div>

        <div className="kpi-card highlight">
          <div className="kpi-header">
            <div className="kpi-icon money" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>💰</div>
          </div>
          <div className="kpi-value">{formatNumber(stats?.ca_realise, 'MAD')}</div>
          <div className="kpi-label" style={{ color: 'rgba(255,255,255,0.8)' }}>{isCommercial() ? 'Mon CA Réalisé' : 'CA Réalisé'}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon money">💵</div>
          </div>
          <div className="kpi-value">{formatNumber(stats?.ca_potentiel, 'MAD')}</div>
          <div className="kpi-label">CA Potentiel restant</div>
        </div>

        {/* Métriques supplémentaires pour les commerciaux */}
        {isCommercial() && (
          <>
            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon">⏱️</div>
              </div>
              <div className="kpi-value">{performance?.average_durations?.available_to_reserved || 0}j</div>
              <div className="kpi-label">Délai moy. réservation</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon">🎯</div>
              </div>
              <div className="kpi-value">{performance?.average_durations?.reserved_to_sold || 0}j</div>
              <div className="kpi-label">Délai moy. vente</div>
            </div>
          </>
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
                  {alerts.summary.total_at_risk} réservation(s) à risque
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
                    <th>Client</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.slice(0, 15).map((lot) => (
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
                  ))}
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
