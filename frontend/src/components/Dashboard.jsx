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
  const [lots, setLots] = useState([]);        // lots filtrés par user (pour la table)
  const [allLots, setAllLots] = useState([]);  // tous les lots du projet (pour le graphe catégorie)
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

  // Répartition par catégorie
  const [catRepTab, setCatRepTab] = useState('type_lot'); // 'type_lot' | 'emplacement' | 'type_maison' | 'zone'

  // Graphe mensuel
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const [chartMode, setChartMode] = useState('nombre'); // 'nombre' | 'montant'

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

      // Tous les lots du projet sans filtre user (pour le graphe de répartition par catégorie)
      const allLotsParams = new URLSearchParams();
      if (effectiveProjectId) allLotsParams.append('project_id', effectiveProjectId);
      const allLotsQueryString = allLotsParams.toString() ? `?${allLotsParams.toString()}` : '';

      const baseRequests = [
        apiGet(`/api/dashboard/stats${queryString}`),
        apiGet(`/api/dashboard/lots${queryString}`),
        apiGet(`/api/dashboard/alerts?${alertsParams.toString()}`),
        apiGet(`/api/dashboard/performance?${perfParams.toString()}`),
        apiGet(`/api/dashboard/clients-pipeline${queryString}`),
        apiGet(`/api/dashboard/lots${allLotsQueryString}`),
      ];

      const monthlyParams = new URLSearchParams(params);
      monthlyParams.set('months_back', '6');

      const [statsData, lotsData, alertsData, perfData, clientsData, allLotsData, monthlyData] = await Promise.all([
        ...baseRequests,
        apiGet(`/api/dashboard/monthly-breakdown?${monthlyParams.toString()}`),
      ]);

      setStats(statsData);
      setLots(lotsData);
      setAllLots(allLotsData);
      setAlerts(alertsData);
      setPerformance(perfData);
      setClientsPipeline(clientsData);
      setMonthlyBreakdown(monthlyData || []);
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
          <span className="kpis-section-badge">
            {formatNumber(stats?.ca_total, 'MAD')} total
            <span className="kpis-info-icon" title="Valeur totale du portefeuille — somme des prix de tous les lots (vendus, réservés, disponibles, bloqués)">ⓘ</span>
          </span>
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

      {/* ── BRIQUE 1 : Répartition par catégorie ─────────────────────── */}
      {(() => {
        const CAT_TABS = [
          {
            key: 'type_lot', label: 'Type de Lot', ex: 'Résidentiel, Commercial…',
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
          },
          {
            key: 'emplacement', label: 'Emplacement', ex: '2 façades, 3 façades…',
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2C5.8 2 4 3.8 4 6c0 3.3 4 8 4 8s4-4.7 4-8c0-2.2-1.8-4-4-4z"/><circle cx="8" cy="6" r="1.5"/></svg>,
          },
          {
            key: 'type_maison', label: 'Type de Maison', ex: 'Villa, Appartement…',
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7L8 2l6 5"/><path d="M3 7v6h4v-3h2v3h4V7"/></svg>,
          },
          {
            key: 'zone', label: 'Zone', ex: 'A, B, C…',
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h7l3 3v9H3V2z"/><path d="M10 2v3h3"/></svg>,
          },
        ];

        // Mode : vue commerciale (filtre user actif) ou vue globale
        const hasUserFilter = isCommercial() || !!selectedUserId;
        // IDs des lots appartenant au commercial/user filtré
        const myLotIds = hasUserFilter ? new Set(lots.map(l => l.id)) : null;
        // Base = TOUS les lots du projet (pas filtrés par user)
        const chartLots = allLots.length > 0 ? allLots : lots;

        // Agrégation sur tous les lots du projet
        const groups = {};
        chartLots.forEach(lot => {
          const key = lot[catRepTab] || 'Non défini';
          if (!groups[key]) {
            groups[key] = {
              name: key,
              // Compteurs globaux (toujours présents)
              sold: 0, reserved: 0, available: 0, blocked: 0,
              amount_sold: 0, amount_reserved: 0, amount_available: 0, amount_blocked: 0,
              // Compteurs "mon portefeuille" (vue commerciale)
              mine_sold: 0, mine_reserved: 0,
              amount_mine_sold: 0, amount_mine_reserved: 0,
              // Lots des autres commerciaux
              others: 0, amount_others: 0,
              amount_total: 0,
            };
          }
          const price = parseFloat(lot.price) || 0;
          groups[key].amount_total += price;

          if (hasUserFilter) {
            const isMine = myLotIds.has(lot.id);
            if (isMine && lot.status === 'sold') {
              groups[key].mine_sold++;
              groups[key].amount_mine_sold += price;
              groups[key].sold++;
              groups[key].amount_sold += price;
            } else if (isMine && lot.status === 'reserved') {
              groups[key].mine_reserved++;
              groups[key].amount_mine_reserved += price;
              groups[key].reserved++;
              groups[key].amount_reserved += price;
            } else if (lot.status === 'available') {
              groups[key].available++;
              groups[key].amount_available += price;
            } else {
              // Vendu/réservé par un autre commercial
              groups[key].others++;
              groups[key].amount_others += price;
            }
          } else {
            // Vue manager : tous les statuts normalement
            groups[key][lot.status] = (groups[key][lot.status] || 0) + 1;
            groups[key][`amount_${lot.status}`] = (groups[key][`amount_${lot.status}`] || 0) + price;
          }
        });

        const catStats = Object.values(groups).sort((a, b) => b.amount_total - a.amount_total);
        const grandTotal = catStats.reduce((s, g) => s + g.amount_total, 0) || 1;
        const grandSold = catStats.reduce((s, g) => s + g.sold, 0);
        const grandReserved = catStats.reduce((s, g) => s + g.reserved, 0);
        const grandAvailable = catStats.reduce((s, g) => s + g.available, 0);
        const grandBlocked = catStats.reduce((s, g) => s + g.blocked, 0);
        const amountSold = catStats.reduce((s, g) => s + g.amount_sold, 0);
        const amountReserved = catStats.reduce((s, g) => s + g.amount_reserved, 0);
        const amountAvailable = catStats.reduce((s, g) => s + g.amount_available, 0);
        const amountBlocked = catStats.reduce((s, g) => s + g.amount_blocked, 0);
        const grandOthers = catStats.reduce((s, g) => s + g.others, 0);
        const amountOthers = catStats.reduce((s, g) => s + g.amount_others, 0);

        return (
          <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
            {/* En-tête */}
            <div className="kpis-section-header">
              <h3>
                <span className="kpis-section-icon">◈</span>
                Répartition par catégorie
              </h3>
              <span className="kpis-section-badge num" title="Valeur catalogue de tous les lots (vendus + réservés + disponibles + bloqués)">
                Portefeuille {formatPrice(grandTotal)}
              </span>
            </div>

            {/* Onglets catégorie — pills avec icônes */}
            <div className="rep-pills">
              {CAT_TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`rep-pill${catRepTab === tab.key ? ' active' : ''}`}
                  onClick={() => setCatRepTab(tab.key)}
                  title={tab.ex}
                >
                  {tab.icon}
                  {tab.label}
                  {catRepTab === tab.key && <span className="rep-pill-dot"/>}
                </button>
              ))}
            </div>

            {/* Résumé rapide */}
            <div className="rep-summary-row">
              {grandSold > 0 && (
                <span className="rep-summary-pill sold" title={hasUserFilter ? 'Mes ventes' : `${grandSold} lot${grandSold > 1 ? 's' : ''} vendus`}>
                  <span className="rep-dot sold"/>
                  {hasUserFilter ? 'Mes ventes' : `${grandSold} vendu${grandSold > 1 ? 's' : ''}`}
                  <span className="rep-summary-amount">{formatPrice(amountSold)}</span>
                </span>
              )}
              {grandReserved > 0 && (
                <span className="rep-summary-pill reserved" title={hasUserFilter ? 'Mes réservations actives' : `${grandReserved} lot${grandReserved > 1 ? 's' : ''} réservés`}>
                  <span className="rep-dot reserved"/>
                  {hasUserFilter ? 'Mes réservations' : `${grandReserved} réservé${grandReserved > 1 ? 's' : ''}`}
                  <span className="rep-summary-amount">{formatPrice(amountReserved)}</span>
                </span>
              )}
              {grandAvailable > 0 && (
                <span className="rep-summary-pill available" title={`${grandAvailable} lot${grandAvailable > 1 ? 's' : ''} disponibles`}>
                  <span className="rep-dot available"/>
                  {grandAvailable} disponible{grandAvailable > 1 ? 's' : ''}
                  {amountAvailable > 0 && <span className="rep-summary-amount">{formatPrice(amountAvailable)}</span>}
                </span>
              )}
              {grandBlocked > 0 && !hasUserFilter && (
                <span className="rep-summary-pill blocked">
                  <span className="rep-dot blocked"/>
                  {grandBlocked} bloqué{grandBlocked > 1 ? 's' : ''}
                  {amountBlocked > 0 && <span className="rep-summary-amount">{formatPrice(amountBlocked)}</span>}
                </span>
              )}
              {hasUserFilter && grandOthers > 0 && (
                <span className="rep-summary-pill others" title="Lots vendus ou réservés par d'autres commerciaux">
                  <span className="rep-dot others"/>
                  {grandOthers} autre{grandOthers > 1 ? 's' : ''}
                  {amountOthers > 0 && <span className="rep-summary-amount">{formatPrice(amountOthers)}</span>}
                </span>
              )}
            </div>

            {/* Corps : liste des catégories */}
            <div className="rep-body">
              {catStats.length > 0 ? catStats.map(group => {
                const totalCount = group.sold + group.reserved + group.available + group.blocked + group.others;
                // % du groupe dans le portefeuille total (en valeur)
                const displayPct = Math.round((group.amount_total / grandTotal) * 100);
                // Barre toujours 100% — segments montrent la composition interne
                // Pour la vue commerciale : part du commercial dans CE groupe
                const mineCount = group.mine_sold + group.mine_reserved;
                const minePct = totalCount > 0 ? Math.round((mineCount / totalCount) * 100) : 0;

                return (
                  <div key={group.name} className="rep-row">
                    {/* Nom + méta alignés */}
                    <div className="rep-row-header">
                      <span className="rep-row-name">{group.name}</span>
                      <div className="rep-row-meta">
                        <span className="rep-row-count num">{totalCount} lot{totalCount > 1 ? 's' : ''}</span>
                        {hasUserFilter ? (
                          <span className="rep-row-pct num" title={`${mineCount} lot${mineCount > 1 ? 's' : ''} vendus ou réservés par moi sur ${totalCount} dans cette catégorie`}>
                            {minePct}% capturé{minePct > 0 && mineCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="rep-row-pct num">{displayPct}%</span>
                        )}
                        <span className="rep-row-amount num">{formatPrice(group.amount_total)}</span>
                      </div>
                    </div>
                    {/* Barre segmentée 100% — segments proportionnels aux montants */}
                    <div className="rep-row-bar-wrap">
                      <div className="rep-row-bar-inner" style={{ width: '100%' }}>
                        {hasUserFilter ? (
                          <>
                            {group.amount_mine_sold > 0 && <div className="rep-row-seg sold" style={{ flex: group.amount_mine_sold }} title={`Mes ventes: ${formatPrice(group.amount_mine_sold)}`}/>}
                            {group.amount_mine_reserved > 0 && <div className="rep-row-seg reserved" style={{ flex: group.amount_mine_reserved }} title={`Mes réservations: ${formatPrice(group.amount_mine_reserved)}`}/>}
                            {group.amount_available > 0 && <div className="rep-row-seg available" style={{ flex: group.amount_available }} title={`Disponibles: ${formatPrice(group.amount_available)}`}/>}
                            {group.amount_others > 0 && <div className="rep-row-seg others" style={{ flex: group.amount_others }} title={`Autres commerciaux: ${formatPrice(group.amount_others)}`}/>}
                          </>
                        ) : (
                          <>
                            {group.amount_sold > 0 && <div className="rep-row-seg sold" style={{ flex: group.amount_sold }}/>}
                            {group.amount_reserved > 0 && <div className="rep-row-seg reserved" style={{ flex: group.amount_reserved }}/>}
                            {group.amount_available > 0 && <div className="rep-row-seg available" style={{ flex: group.amount_available }}/>}
                            {group.amount_blocked > 0 && <div className="rep-row-seg blocked" style={{ flex: group.amount_blocked }}/>}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Badges de détail par statut */}
                    <div className="rep-row-badges">
                      {hasUserFilter ? (
                        <>
                          {group.mine_sold > 0 && (
                            <span className="rep-badge sold">
                              <span className="rep-dot sold"/>
                              {group.mine_sold} vendu{group.mine_sold > 1 ? 's' : ''} (moi)
                              <span className="rep-badge-amount">{formatPrice(group.amount_mine_sold)}</span>
                            </span>
                          )}
                          {group.mine_reserved > 0 && (
                            <span className="rep-badge reserved">
                              <span className="rep-dot reserved"/>
                              {group.mine_reserved} réservé{group.mine_reserved > 1 ? 's' : ''} (moi)
                              <span className="rep-badge-amount">{formatPrice(group.amount_mine_reserved)}</span>
                            </span>
                          )}
                          {group.available > 0 && (
                            <span className="rep-badge available">
                              <span className="rep-dot available"/>
                              {group.available} disponible{group.available > 1 ? 's' : ''}
                            </span>
                          )}
                          {group.others > 0 && (
                            <span className="rep-badge others">
                              <span className="rep-dot others"/>
                              {group.others} autre{group.others > 1 ? 's' : ''} commerc.
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {group.sold > 0 && (
                            <span className="rep-badge sold">
                              <span className="rep-dot sold"/>
                              {group.sold} vendu{group.sold > 1 ? 's' : ''}
                              <span className="rep-badge-amount">{formatPrice(group.amount_sold)}</span>
                            </span>
                          )}
                          {group.reserved > 0 && (
                            <span className="rep-badge reserved">
                              <span className="rep-dot reserved"/>
                              {group.reserved} réservé{group.reserved > 1 ? 's' : ''}
                              <span className="rep-badge-amount">{formatPrice(group.amount_reserved)}</span>
                            </span>
                          )}
                          {group.available > 0 && (
                            <span className="rep-badge available">
                              <span className="rep-dot available"/>
                              {group.available} disponible{group.available > 1 ? 's' : ''}
                              {group.amount_available > 0 && <span className="rep-badge-amount">{formatPrice(group.amount_available)}</span>}
                            </span>
                          )}
                          {group.blocked > 0 && (
                            <span className="rep-badge blocked">
                              <span className="rep-dot blocked"/>
                              {group.blocked} bloqué{group.blocked > 1 ? 's' : ''}
                              {group.amount_blocked > 0 && <span className="rep-badge-amount">{formatPrice(group.amount_blocked)}</span>}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                  <div className="empty-state-title">Aucune donnée</div>
                  <div className="empty-state-description">
                    Les lots n&apos;ont pas encore de {CAT_TABS.find(t => t.key === catRepTab)?.label.toLowerCase()} renseigné.
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      })()}

      {/* ── BRIQUE 2 : Évolution mensuelle ────────────────────────────── */}
      {monthlyBreakdown.length > 0 && (() => {
        const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const getMonthLabel = (period) => {
          const parts = period.split('-');
          return parts.length >= 2 ? (MONTH_NAMES[parseInt(parts[1], 10) - 1] || period) : period;
        };
        const maxVal = chartMode === 'nombre'
          ? Math.max(1, ...monthlyBreakdown.flatMap(d => [d.sold, d.reserved]))
          : Math.max(1, ...monthlyBreakdown.map(d => d.total_amount));
        const totalSold = monthlyBreakdown.reduce((s, d) => s + d.sold, 0);
        const totalReserved = monthlyBreakdown.reduce((s, d) => s + d.reserved, 0);
        const totalCA = monthlyBreakdown.reduce((s, d) => s + d.total_amount, 0);
        const fmtGridVal = (val) => {
          if (chartMode === 'nombre') return Math.round(val);
          if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
          if (val >= 1000) return `${Math.round(val / 1000)}k`;
          return Math.round(val).toString();
        };

        return (
          <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
            {/* En-tête */}
            <div className="kpis-section-header">
              <h3>
                <span className="kpis-section-icon">📈</span>
                Évolution mensuelle
              </h3>
              <div className="chart-header-right">
                <div className="chart-mode-toggle">
                  <button
                    className={`chart-mode-btn${chartMode === 'nombre' ? ' active' : ''}`}
                    onClick={() => setChartMode('nombre')}
                  >
                    # Nombre
                  </button>
                  <button
                    className={`chart-mode-btn${chartMode === 'montant' ? ' active' : ''}`}
                    onClick={() => setChartMode('montant')}
                  >
                    ₊ Montant
                  </button>
                </div>
                <div className="monthly-kpi-row">
                  <div className="monthly-kpi">
                    <span className="monthly-kpi-num num">{totalSold}</span>
                    <span className="monthly-kpi-label">Vendus</span>
                  </div>
                  <div className="monthly-kpi-sep"/>
                  <div className="monthly-kpi">
                    <span className="monthly-kpi-num num">{totalReserved}</span>
                    <span className="monthly-kpi-label">Réservés</span>
                  </div>
                  <div className="monthly-kpi-sep"/>
                  <div className="monthly-kpi accent">
                    <span className="monthly-kpi-num num">{formatPrice(totalCA)}</span>
                    <span className="monthly-kpi-label">CA total</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Graphe barres */}
            <div className="monthly-chart-body" style={{ padding: '0 var(--spacing-lg) var(--spacing-sm)' }}>
              <div className="monthly-chart-bars">
                {monthlyBreakdown.map((month, idx) => {
                  const barH = chartMode === 'nombre'
                    ? (month.sold / maxVal) * 100
                    : (month.total_amount / maxVal) * 100;
                  const resH = chartMode === 'nombre' ? (month.reserved / maxVal) * 100 : 0;
                  const isHovered = hoveredMonth === idx;
                  return (
                    <div
                      key={month.period}
                      className={`chart-month-group${isHovered ? ' hovered' : ''}`}
                      onMouseEnter={() => setHoveredMonth(idx)}
                      onMouseLeave={() => setHoveredMonth(null)}
                    >
                      <div className="chart-bars-group">
                        {chartMode === 'nombre' ? (
                          <>
                            <div className="chart-bar sold"     style={{ height: `${barH}%` }}/>
                            <div className="chart-bar reserved" style={{ height: `${resH}%` }}/>
                          </>
                        ) : (
                          <div className="chart-bar amount" style={{ height: `${barH}%` }}/>
                        )}
                      </div>
                      <div className="chart-month-label">{getMonthLabel(month.period)}</div>
                      {chartMode === 'nombre' && month.total_amount > 0 && (
                        <div className="chart-month-amount num">{formatPrice(month.total_amount)}</div>
                      )}
                      {isHovered && (
                        <div className="chart-tooltip">
                          <div className="chart-tooltip-period">{getMonthLabel(month.period)}</div>
                          {chartMode === 'nombre' ? (
                            <>
                              <div className="chart-tooltip-row">
                                <span className="chart-tooltip-dot sold"/>
                                <span>{month.sold} vendu{month.sold > 1 ? 's' : ''}</span>
                              </div>
                              <div className="chart-tooltip-row">
                                <span className="chart-tooltip-dot reserved"/>
                                <span>{month.reserved} réservé{month.reserved > 1 ? 's' : ''}</span>
                              </div>
                              {month.total_amount > 0 && (
                                <div className="chart-tooltip-ca">{formatPrice(month.total_amount)}</div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="chart-tooltip-row">
                                <span className="chart-tooltip-dot" style={{ background: 'var(--color-primary)' }}/>
                                <span>CA mensuel</span>
                              </div>
                              <div className="chart-tooltip-ca">{formatPrice(month.total_amount)}</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="chart-grid-lines">
                {[100, 75, 50, 25].map(p => (
                  <div key={p} className="chart-grid-line" style={{ bottom: `${p}%` }}>
                    <span className="chart-grid-label">{fmtGridVal(maxVal * p / 100)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Légende */}
            <div className="chart-legend" style={{ padding: '0 var(--spacing-lg) var(--spacing-md)' }}>
              <span className="legend-item"><span className="legend-dot sold"/>Vendus</span>
              <span className="legend-item"><span className="legend-dot reserved"/>Réservés</span>
            </div>
          </div>
        );
      })()}

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
