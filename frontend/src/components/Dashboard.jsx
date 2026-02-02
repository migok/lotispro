import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiGet, apiPost } from '../utils/api';
import { formatPrice, formatDate, formatNumber } from '../utils/formatters';
import { STATUS_LABELS, PIPELINE_LABELS } from '../utils/constants';

// Calculate days remaining until expiration
const getDaysRemaining = (expirationDate) => {
  if (!expirationDate) return null;
  const now = new Date();
  const expDate = new Date(expirationDate);
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function Dashboard({ onSelectLot, onNavigate, projectId: propsProjectId }) {
  const { user, isManager, isCommercial, isClient } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [lots, setLots] = useState([]);
  const [alerts, setAlerts] = useState({ reservations: [], summary: {} });
  const [performance, setPerformance] = useState(null);
  const [clientsPipeline, setClientsPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // KPIs du projet (uniquement pour managers avec projectId)
  const [projectKpis, setProjectKpis] = useState(null);

  // Filtres
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState(['sold', 'reserved', 'blocked']); // Filtre par statut (pas de disponible)

  // Modal de vente
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedLotForSale, setSelectedLotForSale] = useState(null);
  const [clients, setClients] = useState([]);
  const [saleData, setSaleData] = useState({
    client_id: '',
    price: '',
    notes: ''
  });

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

  // Charger les KPIs du projet pour les managers
  useEffect(() => {
    if (isManager() && propsProjectId) {
      loadProjectKpis();
    }
  }, [propsProjectId, selectedUserId]);

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

  const loadProjectKpis = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedUserId) params.append('user_id', selectedUserId);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const kpisData = await apiGet(`/api/projects/${propsProjectId}/kpis${queryString}`);
      setProjectKpis(kpisData);
    } catch (error) {
      console.error('Error loading project KPIs:', error);
    }
  };

  // Helper pour les tendances KPIs
  const getTendanceIcon = (value) => {
    if (value > 0) return { icon: '↑', color: 'var(--color-success)', label: `+${value}%` };
    if (value < 0) return { icon: '↓', color: 'var(--color-danger)', label: `${value}%` };
    return { icon: '→', color: 'var(--text-secondary)', label: '0%' };
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
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger la liste des clients
  const loadClients = async () => {
    try {
      const clientsData = await apiGet('/api/clients');
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  // Ouvrir le modal de vente pour un lot disponible
  const handleSellAvailableLot = (lot) => {
    setSelectedLotForSale(lot);
    setSaleData({
      client_id: '',
      price: lot.price || '',
      notes: ''
    });
    setShowSaleModal(true);
    loadClients();
  };

  // Vendre un lot réservé (convertir la réservation en vente)
  const handleSellReservedLot = async (lot) => {
    if (!lot.reservation_id) {
      toast.error('Erreur: Aucune réservation associée à ce lot');
      return;
    }

    const price = prompt('Prix de vente final:', lot.price || '');
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return;
    }

    const notes = prompt('Notes (optionnel):') || '';

    try {
      await apiPost(`/api/reservations/${lot.reservation_id}/convert-to-sale`, {
        price: parseFloat(price),
        notes: notes
      });
      toast.success('Lot vendu avec succès');
      loadDashboardData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la vente du lot');
    }
  };

  // Soumettre la vente d'un lot disponible
  const handleSubmitSale = async () => {
    if (!saleData.client_id || !saleData.price) {
      toast.warning('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      await apiPost('/api/sales', {
        lot_id: selectedLotForSale.id,
        client_id: parseInt(saleData.client_id),
        price: parseFloat(saleData.price),
        notes: saleData.notes || null
      });
      toast.success('Lot vendu avec succès');
      setShowSaleModal(false);
      setSelectedLotForSale(null);
      setSaleData({ client_id: '', price: '', notes: '' });
      loadDashboardData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la vente du lot');
    }
  };

  // Libérer une réservation
  const handleReleaseLot = async (lot) => {
    if (!lot.reservation_id) {
      toast.error('Erreur: Aucune réservation associée à ce lot');
      return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir libérer le lot ${lot.numero} ?`)) {
      return;
    }

    try {
      await apiPost(`/api/reservations/${lot.reservation_id}/release`, {});
      toast.success('Réservation libérée avec succès');
      loadDashboardData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la libération du lot');
    }
  };

  // Convertir une alerte (réservation) en vente
  const handleConvertAlertToSale = async (alertItem) => {
    const price = prompt('Prix de vente final:', alertItem.lot_price || '');
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return;
    }

    const notes = prompt('Notes (optionnel):') || '';

    try {
      await apiPost(`/api/reservations/${alertItem.id}/convert-to-sale`, {
        price: parseFloat(price),
        notes: notes
      });
      toast.success('Réservation convertie en vente avec succès');
      loadDashboardData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la conversion en vente');
    }
  };

  // Libérer une alerte (réservation)
  const handleReleaseAlert = async (alertItem) => {
    if (!confirm(`Êtes-vous sûr de vouloir libérer le lot ${alertItem.lot_numero} ?`)) {
      return;
    }

    try {
      await apiPost(`/api/reservations/${alertItem.id}/release`, {});
      toast.success('Réservation libérée avec succès');
      loadDashboardData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la libération');
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
            {isCommercial() ? 'Mon Activité' : 'Tableau de Bord'}
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

      {/* KPIs Stratégiques - Uniquement pour les managers avec un projet sélectionné */}
      {isManager() && propsProjectId && projectKpis && (
        <div className="manager-kpis-summary" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="kpis-section-header" style={{ marginBottom: 'var(--spacing-md)' }}>
            <h3>
              <span className="kpis-section-icon">🎯</span>
              Indicateurs Clés de Décision
            </h3>
            {projectKpis?.ca_objectif > 0 && (
              <span className="kpis-section-badge" style={{
                background: (projectKpis?.progression_ca || 0) >= 75 ? 'var(--color-success)' : (projectKpis?.progression_ca || 0) >= 50 ? 'var(--color-warning)' : 'var(--color-danger)',
                color: 'white'
              }}>
                {projectKpis?.progression_ca || 0}% de l'objectif
              </span>
            )}
          </div>

          {/* Hero KPIs Cards */}
          <div className="kpis-hero">
            <div className="kpis-hero-grid">
              <div className="kpis-hero-card gradient-success">
                <div className="kpis-hero-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div className="kpis-hero-content">
                  <div className="kpis-hero-value">{formatNumber(projectKpis?.ca_realise, 'MAD')}</div>
                  <div className="kpis-hero-label">CA Réalisé</div>
                  {projectKpis?.ca_objectif > 0 && (
                    <div className="kpis-hero-progress">
                      <div className="kpis-hero-progress-bar">
                        <div
                          className="kpis-hero-progress-fill"
                          style={{ width: `${Math.min(projectKpis?.progression_ca || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
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
                  <div className="kpis-hero-value">{formatNumber(projectKpis?.ca_potentiel, 'MAD')}</div>
                  <div className="kpis-hero-label">CA Potentiel</div>
                  <div className="kpis-hero-subtitle">Lots réservés</div>
                </div>
              </div>

              <div className="kpis-hero-card gradient-warning">
                <div className="kpis-hero-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20V10M18 20V4M6 20v-4"/>
                  </svg>
                </div>
                <div className="kpis-hero-content">
                  <div className="kpis-hero-value">{projectKpis?.ventes_mois || 0}</div>
                  <div className="kpis-hero-label">Ventes ce Mois</div>
                  <div className="kpis-hero-trend" style={{ color: getTendanceIcon(projectKpis?.tendance_ventes || 0).color }}>
                    {getTendanceIcon(projectKpis?.tendance_ventes || 0).icon} {getTendanceIcon(projectKpis?.tendance_ventes || 0).label}
                  </div>
                </div>
              </div>

              <div className="kpis-hero-card gradient-info">
                <div className="kpis-hero-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <div className="kpis-hero-content">
                  <div className="kpis-hero-value">{formatNumber(projectKpis?.ca_mois, 'MAD')}</div>
                  <div className="kpis-hero-label">CA ce Mois</div>
                  <div className="kpis-hero-trend" style={{ color: getTendanceIcon(projectKpis?.tendance_ca || 0).color }}>
                    {getTendanceIcon(projectKpis?.tendance_ca || 0).icon} {getTendanceIcon(projectKpis?.tendance_ca || 0).label}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Métriques additionnelles pour décision */}
          <div className="kpis-decision-metrics">
            <div>
              <div>{formatNumber(projectKpis?.prix_moyen_lot, 'MAD')}</div>
              <div>Prix Moyen / Lot</div>
            </div>
            <div>
              <div>{formatNumber(projectKpis?.prix_moyen_m2, 'MAD')}</div>
              <div>Prix Moyen / m²</div>
            </div>
            <div>
              <div>{formatNumber(projectKpis?.total_deposits, 'MAD')}</div>
              <div>Total Acomptes</div>
            </div>
            <div>
              <div>{formatNumber(projectKpis?.ca_objectif, 'MAD')}</div>
              <div>CA Objectif</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Financière - Masquer si Indicateurs Clés de Décision est affiché */}
      {!(isManager() && propsProjectId && projectKpis) && (
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
      )}

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
              <h3>
                <span className="kpis-section-icon">🏷️</span>
                Par Type de Lot
              </h3>
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
              <h3>
                <span className="kpis-section-icon">📍</span>
                Par Emplacement
              </h3>
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
              <h3>
                <span className="kpis-section-icon">🏠</span>
                Par Type de Maison
              </h3>
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
                <h3>
                  <span className="kpis-section-icon">⚠️</span>
                  {isCommercial() ? 'Mes Alertes' : 'Alertes commerciales'}
                </h3>
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
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleConvertAlertToSale(alert)}
                        >
                          Convertir en vente
                        </button>
                        <button className="btn btn-sm btn-ghost">Relancer</button>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleReleaseAlert(alert)}
                        >
                          Libérer
                        </button>
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
              <h3>
                <span className="kpis-section-icon">📋</span>
                {isCommercial() ? 'Mes Lots & Opportunités' : 'Stock & Opportunités'}
              </h3>
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
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSellAvailableLot(lot);
                                    }}
                                  >
                                    Vendre
                                  </button>
                                </>
                              )}
                              {lot.status === 'reserved' && (
                                <>
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSellReservedLot(lot);
                                    }}
                                  >
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
                                          toast.success('Réservation prolongée avec succès');
                                          loadDashboardData();
                                        } catch (error) {
                                          toast.error(error.message || 'Erreur lors de la prolongation');
                                        }
                                      }
                                    }}
                                  >
                                    Prolonger
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReleaseLot(lot);
                                    }}
                                  >
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

        </div>

        {/* Sidebar Column */}
        <div className="dashboard-sidebar">
          {/* Clients Pipeline - Seulement pour manager et commercial */}
          {(isManager() || isCommercial()) && (
          <div className="section-card">
            <div className="section-header">
              <h3>
                <span className="kpis-section-icon">👥</span>
                {isCommercial() ? 'Mes Clients' : 'Pipeline clients'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate && onNavigate('clients')}>
                Voir tout
              </button>
            </div>

            {/* Recherche rapide de client */}
            <div style={{ marginBottom: 'var(--spacing-md)', padding: '0 var(--spacing-sm)' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Rechercher un client..."
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  className="form-input"
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) 2.5rem',
                    fontSize: '0.875rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1rem',
                  pointerEvents: 'none'
                }}>
                  🔍
                </span>
              </div>
            </div>

            <div className="client-list">
              {clientsPipeline
                .filter(client => {
                  if (!clientSearchQuery) return true;
                  const query = clientSearchQuery.toLowerCase();
                  return (
                    client.name?.toLowerCase().includes(query) ||
                    client.phone?.includes(query) ||
                    client.email?.toLowerCase().includes(query)
                  );
                })
                .slice(0, 8)
                .map((client) => (
                <div
                  key={client.id}
                  className="client-card"
                  onClick={() => onNavigate && onNavigate('clients', client.id)}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="client-avatar">
                    {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="client-info">
                    <div className="client-name">{client.name}</div>
                    <div className="client-details">
                      {client.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          📱 {client.phone}
                        </span>
                      )}
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

            {clientsPipeline.filter(client => {
              if (!clientSearchQuery) return true;
              const query = clientSearchQuery.toLowerCase();
              return (
                client.name?.toLowerCase().includes(query) ||
                client.phone?.includes(query) ||
                client.email?.toLowerCase().includes(query)
              );
            }).length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">Aucun client trouvé</div>
                {clientSearchQuery && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setClientSearchQuery('')}
                    style={{ marginTop: 'var(--spacing-sm)' }}
                  >
                    Effacer la recherche
                  </button>
                )}
              </div>
            )}

            {clientsPipeline.length === 0 && !clientSearchQuery && (
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

      {/* Modal de vente */}
      {showSaleModal && selectedLotForSale && (
        <div className="modal-overlay" onClick={() => setShowSaleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vendre le lot {selectedLotForSale.numero}</h2>
              <button className="modal-close" onClick={() => setShowSaleModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Client *</label>
                <select
                  value={saleData.client_id}
                  onChange={(e) => setSaleData({ ...saleData, client_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">Sélectionnez un client</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.phone ? `(${client.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Prix de vente *</label>
                <input
                  type="number"
                  value={saleData.price}
                  onChange={(e) => setSaleData({ ...saleData, price: e.target.value })}
                  className="form-input"
                  placeholder="Prix de vente"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={saleData.notes}
                  onChange={(e) => setSaleData({ ...saleData, notes: e.target.value })}
                  className="form-input"
                  placeholder="Notes additionnelles (optionnel)"
                  rows="3"
                />
              </div>

              <div className="lot-info-summary" style={{
                background: 'var(--bg-secondary)',
                padding: 'var(--spacing-md)',
                borderRadius: 'var(--radius-md)',
                marginTop: 'var(--spacing-md)'
              }}>
                <h4 style={{ marginBottom: 'var(--spacing-sm)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Informations du lot
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)', fontSize: '0.875rem' }}>
                  <div>
                    <strong>Numéro:</strong> {selectedLotForSale.numero}
                  </div>
                  <div>
                    <strong>Zone:</strong> {selectedLotForSale.zone || '-'}
                  </div>
                  <div>
                    <strong>Surface:</strong> {selectedLotForSale.surface ? `${Math.round(parseFloat(selectedLotForSale.surface))} m²` : '-'}
                  </div>
                  <div>
                    <strong>Prix catalogue:</strong> {formatPrice(selectedLotForSale.price)}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSaleModal(false)}>
                Annuler
              </button>
              <button className="btn btn-success" onClick={handleSubmitSale}>
                Confirmer la vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
