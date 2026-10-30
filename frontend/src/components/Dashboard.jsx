import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/authHooks';
import { useToast } from '../contexts/toastHooks';
import { apiGet, apiPost } from '../utils/api';
import { ACTIVE_LOT_STATUSES } from '../utils/constants';
import PeriodPicker from './dashboard/PeriodPicker';
import KpiCards from './dashboard/KpiCards';
import MonthlyChart from './dashboard/MonthlyChart';
import CumulativeKpis from './dashboard/CumulativeKpis';
import LotStockSection from './dashboard/LotStockSection';
import CategoryBreakdown from './dashboard/CategoryBreakdown';
import OptionsTrackingTab from './dashboard/OptionsTrackingTab';
import OverviewPanels from './dashboard/OverviewPanels';
import usePeriodData from './dashboard/usePeriodData';
import { exportDashboard } from './dashboard/exportDashboard';
import { loadPeriod, savePeriod } from './dashboard/period';

export default function Dashboard({ onSelectLot, onNavigate, projectId: propsProjectId }) {
  const { user, isManager, isCommercial } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [lots, setLots] = useState([]);        // lots filtrés par user (pour la table)
  const [allLots, setAllLots] = useState([]);  // tous les lots du projet (pour le graphe catégorie)
  const [alerts, setAlerts] = useState({ reservations: [], summary: {} });
  const [notaireAlerts, setNotaireAlerts] = useState([]);
  const [clientsPipeline, setClientsPipeline] = useState([]);
  const [latePayments, setLatePayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // KPIs du projet (uniquement pour managers avec projectId)
  const [projectKpis, setProjectKpis] = useState(null);

  // Filtres
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([...ACTIVE_LOT_STATUSES, 'blocked']);

  // Onglet principal
  const [activeMainTab, setActiveMainTab] = useState('overview'); // 'overview' | 'options'

  // Suivi des options
  const [optionsTracking, setOptionsTracking] = useState([]);
  const [optionsTrackingError, setOptionsTrackingError] = useState(false);

  // Utiliser le projectId passé en props ou celui sélectionné
  const effectiveProjectId = propsProjectId || selectedProjectId;

  // Période (E6) : KPIs de flux et graphe, rechargés sans le spinner pleine page
  const [period, setPeriod] = useState(() => loadPeriod(new Date()));
  const handlePeriodChange = (next) => {
    setPeriod(next);
    savePeriod(next);
  };
  // Pour les commerciaux, toujours filtrer par leur propre ID
  const periodUserId = isCommercial() ? user?.id : selectedUserId;
  const {
    stats: periodStats,
    performance: periodPerformance,
    loading: periodLoading,
    error: periodError,
  } = usePeriodData({
    projectId: effectiveProjectId,
    userId: periodUserId,
    period,
  });

  // Export Excel (E6-T3) : mêmes projet, commercial et période que les KPIs
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDashboard({ projectId: effectiveProjectId, userId: periodUserId, period });
    } catch (err) {
      toast.error(err?.message ? `Échec de l'export : ${err.message}` : "Échec de l'export");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!propsProjectId) {
      loadProjects();
    }
    if (isManager()) {
      loadUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isManager (from AuthProvider) is recreated every render and the role is constant for the session; reload only when projectId changes
  }, [propsProjectId]);

  // Charger les KPIs du projet pour les managers
  useEffect(() => {
    if (isManager() && propsProjectId) {
      loadProjectKpis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isManager is recreated every render and loadProjectKpis is not memoized; reload only when project/selected user change
  }, [propsProjectId, selectedUserId]);

  useEffect(() => {
    loadDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDashboardData is recreated every render; reload only when project/selected user change
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

      // Tous les lots du projet sans filtre user (pour le graphe de répartition par catégorie)
      const allLotsParams = new URLSearchParams();
      if (effectiveProjectId) allLotsParams.append('project_id', effectiveProjectId);
      const allLotsQueryString = allLotsParams.toString() ? `?${allLotsParams.toString()}` : '';

      const [statsData, lotsData, alertsData, clientsData, allLotsData] = await Promise.all([
        apiGet(`/api/dashboard/stats${queryString}`),
        apiGet(`/api/dashboard/lots${queryString}`),
        apiGet(`/api/dashboard/alerts?${alertsParams.toString()}`),
        apiGet(`/api/dashboard/clients-pipeline${queryString}`),
        apiGet(`/api/dashboard/lots${allLotsQueryString}`),
      ]);

      setStats(statsData);
      setLots(lotsData);
      setAllLots(allLotsData);
      setAlerts(alertsData);
      setClientsPipeline(clientsData);

      // Late payments (non-blocking — load separately)
      try {
        const lateData = await apiGet(`/api/dashboard/late-payments${queryString}`);
        setLatePayments(lateData || []);
      } catch {
        setLatePayments([]);
      }

      // Notaire-pending alerts (non-blocking)
      try {
        const notaireData = await apiGet(`/api/dashboard/notaire-alerts${queryString}`);
        setNotaireAlerts(notaireData || []);
      } catch {
        setNotaireAlerts([]);
      }

      // Options tracking (non-blocking)
      try {
        const optUrl = `/api/dashboard/options-tracking${queryString}`;
        const optData = await apiGet(optUrl);
        setOptionsTracking(optData || []);
        setOptionsTrackingError(false);
      } catch {
        setOptionsTracking([]);
        setOptionsTrackingError(true);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
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

      {/* Période (E6) : sélecteur, KPIs de flux et graphe */}
      <PeriodPicker value={period} onChange={handlePeriodChange}>
        {effectiveProjectId && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExport}
            disabled={exporting}
            aria-busy={exporting || undefined}
          >
            {exporting ? 'Export…' : 'Exporter'}
          </button>
        )}
      </PeriodPicker>
      {periodError && (
        <div className="period-error" role="alert">{periodError}</div>
      )}
      <KpiCards stats={periodStats} loading={periodLoading} />
      <MonthlyChart
        performance={periodPerformance}
        loading={periodLoading}
        flowKpisAvailable={periodStats?.flow_kpis_available}
        historyStart={periodStats?.history_start}
      />

      {/* KPIs cumulés (managers avec projet) / performance financière */}
      <CumulativeKpis stats={stats} projectKpis={projectKpis} projectId={propsProjectId} isManager={isManager} isCommercial={isCommercial} />

      {/* Stock de Lots - Modern Cards */}
      <LotStockSection stats={stats} isCommercial={isCommercial} />

      {/* ── BRIQUE 1 : Répartition par catégorie ─────────────────────── */}
      <CategoryBreakdown allLots={allLots} lots={lots} selectedUserId={selectedUserId} isCommercial={isCommercial} />
      {/* ── Onglets principaux ── */}
      {(isManager() || isCommercial()) && (
        <div className="dash-main-tabs">
          <button
            className={`dash-main-tab${activeMainTab === 'overview' ? ' active' : ''}`}
            onClick={() => setActiveMainTab('overview')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            Vue générale
          </button>
          <button
            className={`dash-main-tab${activeMainTab === 'options' ? ' active' : ''}`}
            onClick={() => setActiveMainTab('options')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Suivi des options
            {optionsTracking.length > 0 && (
              <span className={`dash-main-tab-badge${optionsTracking.some(o => o.is_expired) ? ' danger' : ' warn'}`}>
                {optionsTracking.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Onglet : Suivi des options ── */}
      {activeMainTab === 'options' && (isManager() || isCommercial()) && (
        <OptionsTrackingTab optionsTracking={optionsTracking} optionsTrackingError={optionsTrackingError} effectiveProjectId={effectiveProjectId} onSelectLot={onSelectLot} isManager={isManager} />
      )}

      {activeMainTab === 'overview' && (
        <OverviewPanels
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          alerts={alerts}
          notaireAlerts={notaireAlerts}
          latePayments={latePayments}
          lots={lots}
          clientsPipeline={clientsPipeline}
          onSelectLot={onSelectLot}
          onNavigate={onNavigate}
          onReleaseAlert={handleReleaseAlert}
          onReload={loadDashboardData}
          isManager={isManager}
          isCommercial={isCommercial}
        />
      )}
    </div>
  );
}