import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch, apiGet, apiPut, apiDelete } from '../utils/api';
import LotDetailModal from './LotDetailModal';
import Dashboard from './Dashboard';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://127.0.0.1:8000';

const STATUS_COLORS = {
  available: '#10b981',
  reserved: '#f59e0b',
  sold: '#ef4444',
  blocked: '#6b7280',
};

const TABS = [
  { id: 'carte', label: 'Carte', icon: '🗺️' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'kpis', label: 'KPIs', icon: '📈' },
  { id: 'performance', label: 'Performance', icon: '👔' },
  { id: 'historique', label: 'Historique', icon: '📋' },
  { id: 'parametres', label: 'Paramètres', icon: '⚙️' },
];

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, isManager, isCommercial } = useAuth();

  const [activeTab, setActiveTab] = useState('carte');
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Map state
  const mapRef = useRef(null);
  const geoRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [stats, setStats] = useState({ available: 0, reserved: 0, sold: 0, blocked: 0 });
  const [filterStatus, setFilterStatus] = useState(null);
  const [surfaceMin, setSurfaceMin] = useState('');
  const [surfaceMax, setSurfaceMax] = useState('');

  // Modal state
  const [selectedLot, setSelectedLot] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Load project data
  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Initialize map when carte tab is active
  useEffect(() => {
    if (activeTab === 'carte' && mapContainerRef.current && !mapRef.current && project) {
      const map = L.map(mapContainerRef.current, { minZoom: 2, maxZoom: 22 });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      loadLots();
    }
  }, [activeTab, project]);

  // Reload when filters change
  useEffect(() => {
    if (activeTab === 'carte' && mapRef.current) {
      loadLots();
    }
  }, [filterStatus, surfaceMin, surfaceMax]);

  // Clean up map when leaving
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const loadProject = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/projects/${projectId}`);
      setProject(data);
    } catch (err) {
      setError('Erreur lors du chargement du projet');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLots = async () => {
    if (!mapRef.current) return;

    try {
      const res = await apiFetch(`/api/projects/${projectId}/lots.geojson`);
      const geojson = await res.json();

      // Calculate stats
      const features = geojson.features || [];
      const newStats = { available: 0, reserved: 0, sold: 0, blocked: 0 };
      features.forEach((f) => {
        const status = f.properties?.status || 'available';
        if (newStats.hasOwnProperty(status)) {
          newStats[status]++;
        }
      });
      setStats(newStats);

      // Update map
      if (geoRef.current) geoRef.current.remove();

      const layer = L.geoJSON(geojson, {
        style: (feature) => {
          const status = feature.properties?.status ?? 'available';
          const area = feature.properties?.Shape_Area;

          // Apply filters
          if (filterStatus && status !== filterStatus) {
            return { opacity: 0, fillOpacity: 0 };
          }
          if (surfaceMin && area && area < parseFloat(surfaceMin)) {
            return { opacity: 0.2, fillOpacity: 0.1 };
          }
          if (surfaceMax && area && area > parseFloat(surfaceMax)) {
            return { opacity: 0.2, fillOpacity: 0.1 };
          }

          return {
            color: STATUS_COLORS[status] || '#999',
            weight: 2,
            fillColor: STATUS_COLORS[status] || '#999',
            fillOpacity: 0.5,
          };
        },
        onEachFeature: (feature, lyr) => {
          const props = feature.properties || {};
          const lotId = props.lot_id ?? props.parcelid ?? 'N/A';
          const area = props.Shape_Area ? props.Shape_Area.toFixed(2) : null;
          const status = props.status ?? 'available';

          // Créer le contenu du tooltip
          const formatPrice = (price) => {
            if (!price) return 'Non défini';
            return price.toLocaleString('fr-FR') + ' MAD';
          };

          const getStatusLabel = (s) => {
            const labels = {
              available: 'Disponible',
              reserved: 'Réservé',
              sold: 'Vendu',
              blocked: 'Bloqué'
            };
            return labels[s] || s;
          };

          let tooltipContent = `
            <div class="lot-tooltip">
              <div class="lot-tooltip-header">
                <strong>Lot ${lotId}</strong>
                <span class="lot-tooltip-status ${status}">${getStatusLabel(status)}</span>
              </div>
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Prix:</span>
                <span class="lot-tooltip-value">${formatPrice(props.price)}</span>
              </div>
          `;

          if (area) {
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Surface:</span>
                <span class="lot-tooltip-value">${area} m²</span>
              </div>
            `;
          }

          // Si vendu, afficher le commercial qui a vendu
          if (status === 'sold' && props.sold_by_name) {
            tooltipContent += `
              <div class="lot-tooltip-row lot-tooltip-commercial">
                <span class="lot-tooltip-label">Vendu par:</span>
                <span class="lot-tooltip-value">${props.sold_by_name}</span>
              </div>
            `;
          }

          // Si réservé, afficher le client
          if (status === 'reserved' && props.client_name) {
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Client:</span>
                <span class="lot-tooltip-value">${props.client_name}</span>
              </div>
            `;
          }

          tooltipContent += '</div>';

          // Ajouter le tooltip au survol
          lyr.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'top',
            className: 'lot-tooltip-container',
            opacity: 1,
            offset: [0, -10]
          });

          // Gestionnaire de clic
          lyr.on('click', () => {
            setSelectedLot({
              id: props.db_id || null,
              lot_id: String(lotId),
              numero: String(lotId),
              status: status,
              reserved_by: props.reserved_by ?? null,
              reserved_until: props.reserved_until ?? null,
              surface: area ? parseFloat(area) : null,
              price: props.price || null,
              zone: props.zone || null,
              client_name: props.client_name || null,
              client_phone: props.client_phone || null,
              reservation_id: props.reservation_id || null,
              reservation_date: props.reservation_date || null,
              expiration_date: props.expiration_date || null,
              deposit: props.deposit || 0,
              days_in_status: props.days_in_status || 0,
              sold_by_name: props.sold_by_name || null,
              sale_date: props.sale_date || null,
            });
            setShowModal(true);
          });
        },
      }).addTo(mapRef.current);

      geoRef.current = layer;

      try {
        mapRef.current.fitBounds(layer.getBounds());
      } catch (e) {
        // if bounds invalid, keep default view
      }
    } catch (error) {
      console.error('Erreur lors du chargement des lots:', error);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'carte') {
      loadLots();
    }
    loadProject();
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedLot(null);
  };

  if (loading) {
    return (
      <div className="project-detail-page">
        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-detail-page">
        <div className="alert alert-error">
          {error || 'Projet introuvable'}
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/projects')}>
          ← Retour aux projets
        </button>
      </div>
    );
  }

  return (
    <div className="project-detail-page">
      {/* Header */}
      <div className="project-detail-header">
        <button className="btn btn-ghost" onClick={() => navigate('/projects')}>
          ← Retour
        </button>
        <div>
          <h1 className="page-title">{project.name}</h1>
          {project.description && (
            <p className="page-subtitle">{project.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.filter((tab) => {
          // Masquer l'onglet Performance pour les non-managers
          if (tab.id === 'performance' && !isManager()) return false;
          // Masquer l'onglet Paramètres pour les commerciaux
          if (tab.id === 'parametres' && isCommercial()) return false;
          return true;
        }).map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'dashboard' && (
          <Dashboard
            projectId={parseInt(projectId)}
            onNavigate={(page) => {
              if (page === 'map') setActiveTab('carte');
            }}
          />
        )}

        {activeTab === 'carte' && (
          <CarteTab
            mapContainerRef={mapContainerRef}
            mapRef={mapRef}
            stats={stats}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            surfaceMin={surfaceMin}
            setSurfaceMin={setSurfaceMin}
            surfaceMax={surfaceMax}
            setSurfaceMax={setSurfaceMax}
          />
        )}

        {activeTab === 'kpis' && <KPIsTab project={project} />}

        {activeTab === 'performance' && <PerformanceTab project={project} />}

        {activeTab === 'historique' && <HistoriqueTab projectId={projectId} userId={user?.id} isCommercial={isCommercial()} />}

        {activeTab === 'parametres' && (
          <ParametresTab project={project} onUpdate={loadProject} />
        )}
      </div>

      {/* Lot Detail Modal */}
      {showModal && selectedLot && (
        <LotDetailModal
          lot={selectedLot}
          onClose={closeModal}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}

// Carte Tab Component
function CarteTab({
  mapContainerRef,
  stats,
  filterStatus,
  setFilterStatus,
  surfaceMin,
  setSurfaceMin,
  surfaceMax,
  setSurfaceMax,
  mapRef,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const carteTabRef = useRef(null);

  // Gestion du plein écran natif du navigateur
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Entrer en plein écran
        if (carteTabRef.current?.requestFullscreen) {
          await carteTabRef.current.requestFullscreen();
        } else if (carteTabRef.current?.webkitRequestFullscreen) {
          await carteTabRef.current.webkitRequestFullscreen();
        } else if (carteTabRef.current?.msRequestFullscreen) {
          await carteTabRef.current.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        // Sortir du plein écran
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Erreur fullscreen:', err);
      // Fallback: utiliser le mode CSS fullscreen
      setIsFullscreen(!isFullscreen);
    }

    // Redimensionner la carte après le changement
    setTimeout(() => {
      if (mapRef?.current) {
        mapRef.current.invalidateSize();
      }
    }, 100);
  };

  // Écouter les changements de fullscreen (ex: touche Échap)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        if (mapRef?.current) {
          mapRef.current.invalidateSize();
        }
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [mapRef]);

  // Double-clic sur la carte pour passer en plein écran
  useEffect(() => {
    if (!mapRef?.current) return;

    const handleMapDblClick = () => {
      if (!isFullscreen) {
        toggleFullscreen();
      }
    };

    mapRef.current.on('dblclick', handleMapDblClick);

    return () => {
      if (mapRef?.current) {
        mapRef.current.off('dblclick', handleMapDblClick);
      }
    };
  }, [mapRef?.current, isFullscreen]);

  return (
    <div ref={carteTabRef} className={`carte-tab ${isFullscreen ? 'carte-fullscreen' : ''}`}>
      {/* Filters */}
      <div className="section-card carte-filters" style={{ marginBottom: 'var(--spacing-md)' }}>
        <div className="flex gap-md items-center" style={{ flexWrap: 'wrap' }}>
          <button
            className={`btn ${filterStatus === null ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus(null)}
          >
            Tous ({stats.available + stats.reserved + stats.sold + stats.blocked})
          </button>
          <button
            className={`btn ${filterStatus === 'available' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus('available')}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_COLORS.available,
                marginRight: 6,
              }}
            ></span>
            Disponible ({stats.available})
          </button>
          <button
            className={`btn ${filterStatus === 'reserved' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus('reserved')}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_COLORS.reserved,
                marginRight: 6,
              }}
            ></span>
            Réservé ({stats.reserved})
          </button>
          <button
            className={`btn ${filterStatus === 'sold' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus('sold')}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_COLORS.sold,
                marginRight: 6,
              }}
            ></span>
            Vendu ({stats.sold})
          </button>
          <button
            className={`btn ${filterStatus === 'blocked' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus('blocked')}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_COLORS.blocked,
                marginRight: 6,
              }}
            ></span>
            Bloqué ({stats.blocked})
          </button>

          <div className="flex gap-sm items-center" style={{ marginLeft: 'auto' }}>
            <span className="text-muted">Surface:</span>
            <input
              type="number"
              className="form-input"
              style={{ width: 100 }}
              placeholder="Min m²"
              value={surfaceMin}
              onChange={(e) => setSurfaceMin(e.target.value)}
            />
            <span className="text-muted">-</span>
            <input
              type="number"
              className="form-input"
              style={{ width: 100 }}
              placeholder="Max m²"
              value={surfaceMax}
              onChange={(e) => setSurfaceMax(e.target.value)}
            />
            <button
              className={`btn ${isFullscreen ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
              style={{ marginLeft: 'var(--spacing-md)', fontSize: '1.2rem' }}
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div
        className="section-card carte-map-container"
        style={{
          padding: 0,
          overflow: 'hidden',
          height: isFullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 300px)',
          minHeight: 500
        }}
      >
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

// KPIs Tab Component
function KPIsTab({ project }) {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKPIs();
  }, [project.id]);

  const loadKPIs = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/projects/${project.id}/kpis`);
      setKpis(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString('fr-FR');
  };

  const formatSurface = (num) => {
    if (num === null || num === undefined || num === 0) return '0 m²';
    return `${formatNumber(Math.round(num))} m²`;
  };

  const formatMoney = (num) => {
    if (num === null || num === undefined || num === 0) return '0 MAD';
    const absNum = Math.abs(num);
    if (absNum >= 1000000) {
      const formatted = (num / 1000000).toFixed(1).replace(/\.0$/, '');
      return `${formatted}M MAD`;
    }
    if (absNum >= 1000) {
      const formatted = (num / 1000).toFixed(1).replace(/\.0$/, '');
      return `${formatted}K MAD`;
    }
    return `${Math.round(num)} MAD`;
  };

  const getTendanceIcon = (value) => {
    if (value > 0) return { icon: '↑', color: '#10b981', label: `+${value}%` };
    if (value < 0) return { icon: '↓', color: '#ef4444', label: `${value}%` };
    return { icon: '→', color: '#6b7280', label: '0%' };
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const tendanceVentes = getTendanceIcon(kpis?.tendance_ventes || 0);
  const tendanceCa = getTendanceIcon(kpis?.tendance_ca || 0);

  return (
    <div className="kpis-tab">
      {/* Section Stock */}
      <div className="kpi-section">
        <h3 className="kpi-section-title">Stock de Lots</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon">📦</div>
            <div className="kpi-value">{kpis?.total_lots || 0}</div>
            <div className="kpi-label">Total Lots</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon available">✓</div>
            <div className="kpi-value">{kpis?.lots_disponibles || 0}</div>
            <div className="kpi-label">Disponibles</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon reserved">📋</div>
            <div className="kpi-value">{kpis?.lots_reserves || 0}</div>
            <div className="kpi-label">Réservés</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon sold">✅</div>
            <div className="kpi-value">{kpis?.lots_vendus || 0}</div>
            <div className="kpi-label">Vendus</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon blocked">🚫</div>
            <div className="kpi-value">{kpis?.lots_bloques || 0}</div>
            <div className="kpi-label">Bloqués</div>
          </div>
        </div>
      </div>

      {/* Section Financiers */}
      <div className="kpi-section">
        <h3 className="kpi-section-title">Indicateurs Financiers</h3>
        <div className="kpi-grid">
          <div className="kpi-card kpi-card-highlight">
            <div className="kpi-icon money">💰</div>
            <div className="kpi-value">{formatMoney(kpis?.ca_realise)}</div>
            <div className="kpi-label">CA Réalisé</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">🎯</div>
            <div className="kpi-value">{formatMoney(kpis?.ca_objectif)}</div>
            <div className="kpi-label">CA Objectif</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">📊</div>
            <div className="kpi-value" style={{ color: kpis?.progression_ca >= 100 ? '#10b981' : '#f59e0b' }}>
              {kpis?.progression_ca || 0}%
            </div>
            <div className="kpi-label">Progression CA</div>
            <div className="kpi-progress-bar">
              <div
                className="kpi-progress-fill"
                style={{
                  width: `${Math.min(kpis?.progression_ca || 0, 100)}%`,
                  background: kpis?.progression_ca >= 100 ? '#10b981' : '#3b82f6'
                }}
              />
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">💎</div>
            <div className="kpi-value">{formatMoney(kpis?.ca_potentiel)}</div>
            <div className="kpi-label">CA Potentiel</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">💵</div>
            <div className="kpi-value">{formatMoney(kpis?.prix_moyen_lot)}</div>
            <div className="kpi-label">Prix Moyen / Lot</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">📐</div>
            <div className="kpi-value">{formatMoney(kpis?.prix_moyen_m2)}</div>
            <div className="kpi-label">Prix Moyen / m²</div>
          </div>
        </div>
      </div>

      {/* Section Surfaces */}
      <div className="kpi-section">
        <h3 className="kpi-section-title">Surfaces</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon">🗺️</div>
            <div className="kpi-value">{formatSurface(kpis?.surface_totale)}</div>
            <div className="kpi-label">Surface Totale</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon available">📏</div>
            <div className="kpi-value">{formatSurface(kpis?.surface_disponible)}</div>
            <div className="kpi-label">Surface Disponible</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon reserved">📐</div>
            <div className="kpi-value">{formatSurface(kpis?.surface_reservee)}</div>
            <div className="kpi-label">Surface Réservée</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon sold">✅</div>
            <div className="kpi-value">{formatSurface(kpis?.surface_vendue)}</div>
            <div className="kpi-label">Surface Vendue</div>
          </div>
        </div>
      </div>

      {/* Section Performance */}
      <div className="kpi-section">
        <h3 className="kpi-section-title">Performance</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon">📈</div>
            <div className="kpi-value">{kpis?.taux_vente || 0}%</div>
            <div className="kpi-label">Taux de Vente</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon reserved">📋</div>
            <div className="kpi-value">{kpis?.taux_reservation || 0}%</div>
            <div className="kpi-label">Taux de Réservation</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">🔄</div>
            <div className="kpi-value">{kpis?.taux_conversion || 0}%</div>
            <div className="kpi-label">Taux de Conversion</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">💳</div>
            <div className="kpi-value">{formatMoney(kpis?.total_deposits)}</div>
            <div className="kpi-label">Total Acomptes</div>
          </div>
        </div>
      </div>

      {/* Section Ce Mois */}
      <div className="kpi-section">
        <h3 className="kpi-section-title">Ce Mois</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon">📅</div>
            <div className="kpi-value">{kpis?.ventes_mois || 0}</div>
            <div className="kpi-label">Ventes ce Mois</div>
            <div className="kpi-tendance" style={{ color: tendanceVentes.color }}>
              {tendanceVentes.icon} {tendanceVentes.label} vs mois précédent
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon money">💰</div>
            <div className="kpi-value">{formatMoney(kpis?.ca_mois)}</div>
            <div className="kpi-label">CA ce Mois</div>
            <div className="kpi-tendance" style={{ color: tendanceCa.color }}>
              {tendanceCa.icon} {tendanceCa.label} vs mois précédent
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Format number with K/M suffix for Performance Tab
const formatNumberPerf = (num, suffix = '') => {
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

// Performance Tab Component
function PerformanceTab({ project }) {
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCommercial, setSelectedCommercial] = useState(null);

  useEffect(() => {
    loadPerformance();
  }, [project.id]);

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/projects/${project.id}/performance`);
      setPerformance(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCommercial = (commercial) => {
    if (selectedCommercial?.user_id === commercial.user_id) {
      setSelectedCommercial(null);
    } else {
      setSelectedCommercial(commercial);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="performance-tab">
      <div className="section-card">
        <h3>Commerciaux Assign&eacute;s</h3>
        {performance?.commercials && performance.commercials.length > 0 ? (
          <div className="commercials-grid">
            {performance.commercials.map((commercial) => (
              <div
                key={commercial.user_id}
                className={`commercial-card ${selectedCommercial?.user_id === commercial.user_id ? 'selected' : ''}`}
                onClick={() => handleSelectCommercial(commercial)}
                style={{ cursor: 'pointer' }}
              >
                <div className="commercial-header">
                  <div className="user-avatar" style={{ width: '48px', height: '48px', fontSize: '1rem' }}>
                    {commercial.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="commercial-info">
                    <div className="user-name" style={{ fontSize: '1rem', fontWeight: 600 }}>{commercial.name}</div>
                    <div className="user-email" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {commercial.email}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: '1.2rem' }}>
                    {selectedCommercial?.user_id === commercial.user_id ? '▼' : '▶'}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="commercial-quick-stats" style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  marginTop: 'var(--spacing-md)',
                  paddingTop: 'var(--spacing-md)',
                  borderTop: '1px solid var(--bg-tertiary)'
                }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>
                      {commercial.total_sales || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Ventes</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>
                      {commercial.total_reservations || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>R&eacute;servations</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
                      {formatNumberPerf(commercial.ca_total || commercial.ca_realise, 'MAD')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>CA</div>
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedCommercial?.user_id === commercial.user_id && (
                  <div className="commercial-details" style={{
                    marginTop: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <h4 style={{ margin: '0 0 var(--spacing-md) 0', fontSize: '0.9rem' }}>D&eacute;tails Performance</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                      <div className="detail-item">
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Taux de Transformation</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                          <span className={`status-badge ${(commercial.taux_transformation || 0) >= 50 ? 'sold' : (commercial.taux_transformation || 0) >= 25 ? 'reserved' : 'available'}`}>
                            {commercial.taux_transformation || 0}%
                          </span>
                        </div>
                      </div>

                      <div className="detail-item">
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CA Moyen / Vente</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                          {formatNumberPerf(commercial.ca_moyen, 'MAD')}
                        </div>
                      </div>

                      <div className="detail-item">
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Lots Vendus</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }}>
                          {commercial.total_sales || commercial.ventes_count || 0}
                        </div>
                      </div>

                      <div className="detail-item">
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>R&eacute;servations Actives</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--warning)' }}>
                          {commercial.total_reservations || 0}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar for transformation rate */}
                    <div style={{ marginTop: 'var(--spacing-md)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xs)' }}>
                        Progression des ventes
                      </div>
                      <div className="kpi-progress-bar" style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                        <div
                          style={{
                            width: `${Math.min(commercial.taux_transformation || 0, 100)}%`,
                            height: '100%',
                            background: (commercial.taux_transformation || 0) >= 50 ? 'var(--success)' : 'var(--primary)',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">👔</div>
            <div className="empty-state-title">Aucun commercial assign&eacute;</div>
            <div className="empty-state-description">
              Assignez des commerciaux &agrave; ce projet pour voir leurs performances.
            </div>
          </div>
        )}
      </div>

      {/* Global Performance Summary */}
      {performance?.summary && (
        <div className="section-card" style={{ marginTop: 'var(--spacing-md)' }}>
          <h3>R&eacute;sum&eacute; Global</h3>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kpi-card">
              <div className="kpi-icon">📈</div>
              <div className="kpi-value">{performance.summary.total_ventes || 0}</div>
              <div className="kpi-label">Total Ventes</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon money">💰</div>
              <div className="kpi-value">{formatNumberPerf(performance.summary.total_ca, 'MAD')}</div>
              <div className="kpi-label">CA Total</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🔄</div>
              <div className="kpi-value">{performance.summary.taux_moyen || 0}%</div>
              <div className="kpi-label">Taux Moyen</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">👔</div>
              <div className="kpi-value">{performance.commercials?.length || 0}</div>
              <div className="kpi-label">Commerciaux</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Historique Tab Component
function HistoriqueTab({ projectId, userId, isCommercial }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtres de dates
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  useEffect(() => {
    loadHistory();
  }, [projectId, userId, isCommercial, dateDebut, dateFin]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // Construire les query params
      const params = new URLSearchParams();
      // Pour les commerciaux, filtrer par leur propre ID
      if (isCommercial && userId) {
        params.append('user_id', userId);
      }
      // Filtres de dates
      if (dateDebut) {
        params.append('date_from', dateDebut);
      }
      if (dateFin) {
        params.append('date_to', dateFin);
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';

      const data = await apiGet(`/api/projects/${projectId}/history${queryString}`);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setDateDebut('');
    setDateFin('');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="historique-tab">
      <div className="section-card">
        <div className="section-header" style={{ marginBottom: 'var(--spacing-md)' }}>
          <h3 style={{ margin: 0 }}>{isCommercial ? 'Mon Historique' : 'Historique du Projet'}</h3>
        </div>

        {/* Filtres de dates */}
        <div className="filters-container" style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          alignItems: 'center',
          marginBottom: 'var(--spacing-lg)',
          padding: 'var(--spacing-md)',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Du:</label>
            <input
              type="date"
              className="form-input"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              style={{ width: 'auto' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Au:</label>
            <input
              type="date"
              className="form-input"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              style={{ width: 'auto' }}
            />
          </div>
          {(dateDebut || dateFin) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={resetFilters}
            >
              Réinitialiser
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div className="history-list">
            {history.map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="history-icon">{getActionIcon(entry.action)}</div>
                <div className="history-content">
                  <div className="history-action">{entry.description}</div>
                  <div className="history-meta">
                    {entry.user_name} • {new Date(entry.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-description">
              {dateDebut || dateFin
                ? 'Aucun historique pour cette période'
                : 'Aucun historique disponible'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getActionIcon(action) {
  const icons = {
    create: '➕',
    update: '✏️',
    delete: '🗑️',
    reserve: '📋',
    sell: '✅',
    cancel: '❌',
  };
  return icons[action] || '📌';
}

// Parametres Tab Component
function ParametresTab({ project, onUpdate }) {
  const [formData, setFormData] = useState({
    name: project.name || '',
    description: project.description || '',
    visibility: project.visibility || 'private',
    ca_objectif: project.ca_objectif || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        visibility: formData.visibility,
        ca_objectif: formData.ca_objectif ? parseFloat(formData.ca_objectif) : null,
      };

      await apiPut(`/api/projects/${project.id}`, payload);
      setSuccess('Projet mis à jour avec succès');
      onUpdate();
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="parametres-tab">
      <div className="section-card">
        <h3>Paramètres du Projet</h3>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Nom du projet <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              className="form-input"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              name="description"
              className="form-input"
              value={formData.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Visibilité</label>
            <select
              name="visibility"
              className="form-input"
              value={formData.visibility}
              onChange={handleChange}
            >
              <option value="private">🔒 Privé</option>
              <option value="public">🌐 Public</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Objectif de CA (MAD)</label>
            <input
              type="number"
              name="ca_objectif"
              className="form-input"
              value={formData.ca_objectif}
              onChange={handleChange}
              min="0"
              step="1000"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>
      </div>
    </div>
  );
}
