import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch, apiGet, apiPut, apiDelete, apiUploadFile, apiPatch } from '../utils/api';
import LotDetailModal from './LotDetailModal';
import Dashboard from './Dashboard';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  available: '#10b981',
  reserved: '#f59e0b',
  sold: '#ef4444',
  blocked: '#6b7280',
};

const SELECTION_STYLE = {
  color: '#3b82f6',
  weight: 3,
  fillColor: '#3b82f6',
  fillOpacity: 0.7,
};

// Fonction pour générer les onglets dynamiquement selon le rôle
const getTabs = (isManager) => [
  { id: 'carte', label: 'Carte', icon: '🗺️' },
  { id: 'dashboard', label: isManager ? 'Tableau de Bord' : 'Dashboard', icon: '📊' },
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
  const labelsLayerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [stats, setStats] = useState({ available: 0, reserved: 0, sold: 0, blocked: 0 });
  const [filterStatus, setFilterStatus] = useState(null);
  const [surfaceMin, setSurfaceMin] = useState('');
  const [surfaceMax, setSurfaceMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  // Metadata filters
  const [filterTypeLot, setFilterTypeLot] = useState(null);
  const [filterEmplacement, setFilterEmplacement] = useState(null);
  const [filterTypeMaison, setFilterTypeMaison] = useState(null);
  const [metadataOptions, setMetadataOptions] = useState({ type_lot: [], emplacement: [], type_maison: [] });

  // Modal state
  const [selectedLot, setSelectedLot] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Selection mode for bulk metadata edit (manager only)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLotIds, setSelectedLotIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const selectionModeRef = useRef(false);
  const selectedLotIdsRef = useRef(new Set());
  const selectedLotLayersRef = useRef(new Map()); // db_id -> { lyr, normalStyle }

  // Load project data
  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Initialize map when carte tab is active
  useEffect(() => {
    if (activeTab !== 'carte' || !project) return;

    const initializeMap = () => {
      if (!mapContainerRef.current) {
        // Le conteneur n'est pas encore prêt, réessayer
        setTimeout(initializeMap, 50);
        return;
      }

      if (!mapRef.current) {
        // Première initialisation de la carte
        const map = L.map(mapContainerRef.current, { minZoom: 2, maxZoom: 22 });
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 22,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        // Pane dédié aux labels de numéros de lots
        map.createPane('labelsPane');
        map.getPane('labelsPane').style.zIndex = 450;
        map.getPane('labelsPane').style.pointerEvents = 'none';
        map.getPane('labelsPane').style.display = 'none'; // caché par défaut

        map.on('zoomend', () => {
          const pane = map.getPane('labelsPane');
          if (pane) pane.style.display = map.getZoom() >= 19 ? '' : 'none';
        });

        loadLots();
      } else {
        // La carte existe déjà, on force le recalcul des dimensions
        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 100);
      }
    };

    // Petit délai pour laisser le DOM se mettre à jour
    setTimeout(initializeMap, 0);
  }, [activeTab, project]);

  // Sync selection refs (so Leaflet click closures always see current state)
  useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);
  useEffect(() => { selectedLotIdsRef.current = selectedLotIds; }, [selectedLotIds]);

  // Reload when filters change
  useEffect(() => {
    if (activeTab === 'carte' && mapRef.current) {
      loadLots();
    }
  }, [filterStatus, surfaceMin, surfaceMax, priceMin, priceMax, filterTypeLot, filterEmplacement, filterTypeMaison]);

  // Clean up map when leaving
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const loadProject = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/api/projects/${projectId}`);
      setProject(data);
    } catch (err) {
      setError('Erreur lors du chargement du projet');
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadLots = async () => {
    if (!mapRef.current) return;

    try {
      const res = await apiFetch(`/api/projects/${projectId}/lots.geojson`);
      const geojson = await res.json();

      // Calculate stats and extract metadata options
      const features = geojson.features || [];
      const newStats = { available: 0, reserved: 0, sold: 0, blocked: 0 };
      const typeLotSet = new Set();
      const emplacementSet = new Set();
      const typeMaisonSet = new Set();

      features.forEach((f) => {
        const status = f.properties?.status || 'available';
        if (newStats.hasOwnProperty(status)) {
          newStats[status]++;
        }
        // Collect unique metadata values
        if (f.properties?.type_lot) typeLotSet.add(f.properties.type_lot);
        if (f.properties?.emplacement) emplacementSet.add(f.properties.emplacement);
        if (f.properties?.type_maison) typeMaisonSet.add(f.properties.type_maison);
      });
      setStats(newStats);
      setMetadataOptions({
        type_lot: Array.from(typeLotSet).sort(),
        emplacement: Array.from(emplacementSet).sort(),
        type_maison: Array.from(typeMaisonSet).sort(),
      });

      // Update map
      if (geoRef.current) geoRef.current.remove();

      // Clear layer refs; will be repopulated below
      selectedLotLayersRef.current.clear();
      const styleMap = new Map(); // db_id -> computed normal style (for deselection restore)

      const layer = L.geoJSON(geojson, {
        style: (feature) => {
          const props = feature.properties || {};
          const dbId = props.db_id;
          const status = props.status ?? 'available';
          const area = props.Shape_Area;
          const lotPrice = props.price;

          // Compute normal style (based on filters)
          let normalStyle;
          if (filterStatus && status !== filterStatus) {
            normalStyle = { opacity: 0, fillOpacity: 0 };
          } else if (surfaceMin && area && area < parseFloat(surfaceMin)) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (surfaceMax && area && area > parseFloat(surfaceMax)) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (priceMin && lotPrice && lotPrice < parseFloat(priceMin)) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (priceMax && lotPrice && lotPrice > parseFloat(priceMax)) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (filterTypeLot && props.type_lot !== filterTypeLot) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (filterEmplacement && props.emplacement !== filterEmplacement) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else if (filterTypeMaison && props.type_maison !== filterTypeMaison) {
            normalStyle = { opacity: 0.2, fillOpacity: 0.1 };
          } else {
            normalStyle = {
              color: STATUS_COLORS[status] || '#999',
              weight: 2,
              fillColor: STATUS_COLORS[status] || '#999',
              fillOpacity: 0.5,
            };
          }

          // Store normal style for restore on deselect
          if (dbId != null) styleMap.set(dbId, normalStyle);

          // If lot is already selected, show selection highlight
          if (selectedLotIdsRef.current.has(dbId)) {
            return SELECTION_STYLE;
          }

          return normalStyle;
        },
        onEachFeature: (feature, lyr) => {
          const props = feature.properties || {};
          const lotId = props.lot_id ?? props.parcelid ?? 'N/A';
          const area = props.Shape_Area ? props.Shape_Area.toFixed(2) : null;
          const status = props.status ?? 'available';
          const dbId = props.db_id;

          // Store layer + normal style ref for selection mode interactions
          if (dbId != null) {
            selectedLotLayersRef.current.set(dbId, { lyr, normalStyle: styleMap.get(dbId) });
          }

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

          // Prix au m²
          if (props.price && area && parseFloat(area) > 0) {
            const prixM2 = (props.price / parseFloat(area)).toFixed(0);
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Prix/m²:</span>
                <span class="lot-tooltip-value">${Number(prixM2).toLocaleString('fr-FR')} MAD</span>
              </div>
            `;
          }

          // Metadata fields
          if (props.type_lot) {
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Type:</span>
                <span class="lot-tooltip-value">${props.type_lot}</span>
              </div>
            `;
          }
          if (props.emplacement) {
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Emplacement:</span>
                <span class="lot-tooltip-value">${props.emplacement}</span>
              </div>
            `;
          }
          if (props.type_maison) {
            tooltipContent += `
              <div class="lot-tooltip-row">
                <span class="lot-tooltip-label">Type maison:</span>
                <span class="lot-tooltip-value">${props.type_maison}</span>
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
            if (selectionModeRef.current) {
              // Selection mode: toggle lot selection
              if (dbId == null) return;
              const newSelected = new Set(selectedLotIdsRef.current);
              const entry = selectedLotLayersRef.current.get(dbId);
              if (newSelected.has(dbId)) {
                newSelected.delete(dbId);
                lyr.setStyle(entry?.normalStyle || { color: STATUS_COLORS[status] || '#999', weight: 2, fillColor: STATUS_COLORS[status] || '#999', fillOpacity: 0.5 });
              } else {
                newSelected.add(dbId);
                lyr.setStyle(SELECTION_STYLE);
              }
              selectedLotIdsRef.current = newSelected;
              setSelectedLotIds(new Set(newSelected));
            } else {
              // Normal mode: open detail modal
              setSelectedLot({
                id: props.db_id || null,
                lot_id: String(lotId),
                numero: String(lotId),
                status: status,
                reserved_by: props.reserved_by ?? null,
                reserved_by_user_id: props.reserved_by_user_id ?? null,
                reserved_until: props.reserved_until ?? null,
                surface: area ? parseFloat(area) : null,
                price: props.price || null,
                zone: props.zone || null,
                client_id: props.client_id || null,
                client_name: props.client_name || null,
                client_phone: props.client_phone || null,
                reservation_id: props.reservation_id || null,
                reservation_date: props.reservation_date || null,
                expiration_date: props.expiration_date || null,
                deposit: props.deposit || 0,
                days_in_status: props.days_in_status || 0,
                sold_by_name: props.sold_by_name || null,
                sale_date: props.sale_date || null,
                type_lot: props.type_lot || null,
                emplacement: props.emplacement || null,
                type_maison: props.type_maison || null,
              });
              setShowModal(true);
            }
          });
        },
      }).addTo(mapRef.current);

      geoRef.current = layer;

      // Labels numéros de lots — dans le pane dédié (visibilité gérée par zoomend)
      if (labelsLayerRef.current) labelsLayerRef.current.remove();
      const labelsLayer = L.layerGroup();
      labelsLayerRef.current = labelsLayer;
      layer.eachLayer((lyr) => {
        const props = lyr.feature?.properties || {};
        const lotId = props.lot_id ?? props.parcelid ?? null;
        if (lotId == null) return;
        const center = lyr.getBounds().getCenter();
        const marker = L.marker(center, {
          pane: 'labelsPane',
          icon: L.divIcon({
            className: 'lot-label-icon',
            html: `<span class="lot-label-text">${lotId}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          interactive: false,
        });
        labelsLayer.addLayer(marker);
      });
      labelsLayer.addTo(mapRef.current); // toujours sur la carte, visibilité via le pane

      try {
        mapRef.current.fitBounds(layer.getBounds());
      } catch (e) {
        // if bounds invalid, keep default view
      }
    } catch (error) {
      console.error('Erreur lors du chargement des lots:', error);
    }
  };

  const handleRefresh = async () => {
    if (activeTab === 'carte') {
      await loadLots();
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 150);
    }
    loadProject(true); // silent: pas de spinner, la carte reste affichée
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedLot(null);
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exit: clear selections and reload to restore styles
      setSelectionMode(false);
      setSelectedLotIds(new Set());
      selectedLotIdsRef.current = new Set();
      loadLots();
    } else {
      // Enter: close any open modal
      setShowModal(false);
      setSelectedLot(null);
      setSelectionMode(true);
    }
  };

  const clearSelection = () => {
    for (const [dbId, { lyr, normalStyle }] of selectedLotLayersRef.current) {
      if (selectedLotIdsRef.current.has(dbId)) {
        lyr.setStyle(normalStyle || { color: '#999', weight: 2, fillColor: '#999', fillOpacity: 0.5 });
      }
    }
    setSelectedLotIds(new Set());
    selectedLotIdsRef.current = new Set();
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
        {getTabs(isManager()).filter((tab) => {
          // Masquer l'onglet KPIs pour les managers (intégré dans Tableau de Bord) et commerciaux
          if (tab.id === 'kpis' && (isManager() || isCommercial())) return false;
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
            onNavigate={(page, clientId) => {
              if (page === 'map') setActiveTab('carte');
              if (page === 'clients' && clientId) navigate(`/clients/${clientId}`);
              else if (page === 'clients') navigate('/clients');
            }}
          />
        )}

        <div style={{ display: activeTab === 'carte' ? 'block' : 'none' }}>
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
            priceMin={priceMin}
            setPriceMin={setPriceMin}
            priceMax={priceMax}
            setPriceMax={setPriceMax}
            filterTypeLot={filterTypeLot}
            setFilterTypeLot={setFilterTypeLot}
            filterEmplacement={filterEmplacement}
            setFilterEmplacement={setFilterEmplacement}
            filterTypeMaison={filterTypeMaison}
            setFilterTypeMaison={setFilterTypeMaison}
            metadataOptions={metadataOptions}
            showModal={showModal}
            selectedLot={selectedLot}
            onCloseModal={closeModal}
            onRefresh={handleRefresh}
            isManager={isManager()}
            selectionMode={selectionMode}
            selectedCount={selectedLotIds.size}
            onToggleSelectionMode={toggleSelectionMode}
            onClearSelection={clearSelection}
            onOpenBulkModal={() => setShowBulkModal(true)}
          />
        </div>

        {activeTab === 'kpis' && <KPIsTab project={project} />}

        {activeTab === 'performance' && <PerformanceTab project={project} />}

        {activeTab === 'historique' && <HistoriqueTab projectId={projectId} userId={user?.id} isCommercial={isCommercial()} />}

        {activeTab === 'parametres' && (
          <ParametresTab project={project} onUpdate={loadProject} />
        )}
      </div>

      {/* Lot Detail Modal - only render outside CarteTab when not in carte tab */}
      {activeTab !== 'carte' && showModal && selectedLot && (
        <LotDetailModal
          lot={selectedLot}
          onClose={closeModal}
          onRefresh={handleRefresh}
        />
      )}

      {/* Bulk Metadata Modal */}
      {showBulkModal && (
        <BulkMetadataModal
          projectId={projectId}
          selectedCount={selectedLotIds.size}
          selectedLotIds={Array.from(selectedLotIds)}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false);
            setSelectionMode(false);
            setSelectedLotIds(new Set());
            selectedLotIdsRef.current = new Set();
            loadLots();
          }}
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
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  mapRef,
  filterTypeLot,
  setFilterTypeLot,
  filterEmplacement,
  setFilterEmplacement,
  filterTypeMaison,
  setFilterTypeMaison,
  metadataOptions,
  showModal,
  selectedLot,
  onCloseModal,
  onRefresh,
  isManager,
  selectionMode,
  selectedCount,
  onToggleSelectionMode,
  onClearSelection,
  onOpenBulkModal,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const carteTabRef = useRef(null);

  // Force la carte à se redimensionner au montage du composant
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef?.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  // Redimensionner la carte quand on toggle les filtres
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef?.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [showFilters]);

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

  const hasActiveFilters = filterStatus || surfaceMin || surfaceMax || priceMin || priceMax || filterTypeLot || filterEmplacement || filterTypeMaison;

  const clearAllFilters = () => {
    setFilterStatus(null);
    setSurfaceMin('');
    setSurfaceMax('');
    setPriceMin('');
    setPriceMax('');
    setFilterTypeLot(null);
    setFilterEmplacement(null);
    setFilterTypeMaison(null);
  };

  return (
    <div ref={carteTabRef} className={`carte-tab ${isFullscreen ? 'carte-fullscreen' : ''}`}>
      {/* Filters V2 */}
      <div className="map-filters-v2">
        {/* Header Row */}
        <div className="filters-header">
          <div className="filters-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filtres
            {hasActiveFilters && (
              <span className="filters-active-badge">Actifs</span>
            )}
          </div>
          <div className="filters-actions">
            {isManager && (
              <button
                className={`btn-selection-mode ${selectionMode ? 'active' : ''}`}
                onClick={onToggleSelectionMode}
                title={selectionMode ? 'Quitter la sélection multiple' : 'Activer la sélection multiple (manager)'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M17 17l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {selectionMode ? `Sélection (${selectedCount})` : 'Sélection'}
              </button>
            )}
            {hasActiveFilters && (
              <button className="btn-clear-filters" onClick={clearAllFilters}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Tout effacer
              </button>
            )}
            <button
              className="btn-fullscreen"
              onClick={() => setShowFilters(!showFilters)}
              title={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            >
              {showFilters ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              )}
            </button>
            <button
              className={`btn-fullscreen ${isFullscreen ? 'active' : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Status Filter Buttons */}
        {showFilters && (
          <>
            <div className="filters-status-row">
              {['available', 'reserved', 'sold', 'blocked'].map(status => (
                <button
                  key={status}
                  className={`btn-status-filter ${filterStatus === status ? 'active' : ''} ${status}`}
                  onClick={() => setFilterStatus(filterStatus === status ? null : status)}
                >
                  <span className="status-dot"></span>
                  {status === 'available' ? 'Disponible' :
                   status === 'reserved' ? 'Réservé' :
                   status === 'sold' ? 'Vendu' : 'Bloqué'}
                </button>
              ))}
            </div>

            {/* All Filters in One Row */}
            <div className="filters-unified-row">
          <div className="filter-inline-group">
            <label className="filter-inline-label">Surface</label>
            <div className="filter-inline-inputs">
              <input
                type="number"
                className="filter-input-sm"
                placeholder="Min"
                value={surfaceMin}
                onChange={(e) => setSurfaceMin(e.target.value)}
              />
              <span className="filter-sep">-</span>
              <input
                type="number"
                className="filter-input-sm"
                placeholder="Max"
                value={surfaceMax}
                onChange={(e) => setSurfaceMax(e.target.value)}
              />
              <span className="filter-unit">m²</span>
            </div>
          </div>

          <div className="filter-inline-group">
            <label className="filter-inline-label">Prix</label>
            <div className="filter-inline-inputs">
              <input
                type="number"
                className="filter-input-sm"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
              <span className="filter-sep">-</span>
              <input
                type="number"
                className="filter-input-sm"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
              <span className="filter-unit">MAD</span>
            </div>
          </div>

          {metadataOptions.type_lot.length > 0 && (
            <div className="filter-inline-group">
              <label className="filter-inline-label">Type</label>
              <select
                className="filter-select-sm"
                value={filterTypeLot || ''}
                onChange={(e) => setFilterTypeLot(e.target.value || null)}
              >
                <option value="">Tous</option>
                {metadataOptions.type_lot.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {metadataOptions.emplacement.length > 0 && (
            <div className="filter-inline-group">
              <label className="filter-inline-label">Emplacement</label>
              <select
                className="filter-select-sm"
                value={filterEmplacement || ''}
                onChange={(e) => setFilterEmplacement(e.target.value || null)}
              >
                <option value="">Tous</option>
                {metadataOptions.emplacement.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {metadataOptions.type_maison.length > 0 && (
            <div className="filter-inline-group">
              <label className="filter-inline-label">Maison</label>
              <select
                className="filter-select-sm"
                value={filterTypeMaison || ''}
                onChange={(e) => setFilterTypeMaison(e.target.value || null)}
              >
                <option value="">Tous</option>
                {metadataOptions.type_maison.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Selection Mode Action Bar */}
      {selectionMode && (
        <div className="selection-action-bar">
          <div className="selection-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {selectedCount === 0
              ? 'Cliquez sur des lots pour les sélectionner'
              : `${selectedCount} lot${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''}`}
          </div>
          <div className="selection-actions">
            {selectedCount > 0 && (
              <>
                <button className="btn-selection-clear" onClick={onClearSelection}>
                  Désélectionner tout
                </button>
                <button className="btn-selection-edit" onClick={onOpenBulkModal}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Modifier les métadonnées
                </button>
              </>
            )}
          </div>
        </div>
      )}

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

      {/* Modal inside CarteTab for fullscreen support */}
      {showModal && selectedLot && (
        <LotDetailModal
          lot={selectedLot}
          onClose={onCloseModal}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

// KPIs Tab Component - Modern Design
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
      <div className="kpis-loading">
        <div className="loading-spinner"></div>
        <p>Chargement des KPIs...</p>
      </div>
    );
  }

  const tendanceVentes = getTendanceIcon(kpis?.tendance_ventes || 0);
  const tendanceCa = getTendanceIcon(kpis?.tendance_ca || 0);
  const totalLots = kpis?.total_lots || 1;

  return (
    <div className="kpis-tab-v2">
      {/* Hero KPIs - CA Section */}
      <div className="kpis-hero">
        <div className="kpis-hero-grid">
          <div className="kpis-hero-card gradient-success">
            <div className="kpis-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div className="kpis-hero-content">
              <div className="kpis-hero-value">{formatMoney(kpis?.ca_realise)}</div>
              <div className="kpis-hero-label">CA R&eacute;alis&eacute;</div>
              {kpis?.ca_objectif > 0 && (
                <div className="kpis-hero-progress">
                  <div className="kpis-hero-progress-bar">
                    <div
                      className="kpis-hero-progress-fill"
                      style={{ width: `${Math.min(kpis?.progression_ca || 0, 100)}%` }}
                    />
                  </div>
                  <span>{kpis?.progression_ca || 0}% de l'objectif</span>
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
              <div className="kpis-hero-value">{formatMoney(kpis?.ca_potentiel)}</div>
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
              <div className="kpis-hero-value">{kpis?.ventes_mois || 0}</div>
              <div className="kpis-hero-label">Ventes ce Mois</div>
              <div className="kpis-hero-trend" style={{ color: tendanceVentes.color === '#10b981' ? '#a7f3d0' : tendanceVentes.color === '#ef4444' ? '#fca5a5' : 'rgba(255,255,255,0.7)' }}>
                {tendanceVentes.icon} {tendanceVentes.label}
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
              <div className="kpis-hero-value">{formatMoney(kpis?.ca_mois)}</div>
              <div className="kpis-hero-label">CA ce Mois</div>
              <div className="kpis-hero-trend" style={{ color: tendanceCa.color === '#10b981' ? '#a7f3d0' : tendanceCa.color === '#ef4444' ? '#fca5a5' : 'rgba(255,255,255,0.7)' }}>
                {tendanceCa.icon} {tendanceCa.label}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock de Lots - Visual Cards */}
      <div className="kpis-section-v2">
        <div className="kpis-section-header">
          <h3>
            <span className="kpis-section-icon">📦</span>
            Stock de Lots
          </h3>
          <span className="kpis-section-badge">{kpis?.total_lots || 0} lots</span>
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
                  strokeDasharray={`${((kpis?.available_lots || 0) / totalLots) * 100}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{Math.round(((kpis?.available_lots || 0) / totalLots) * 100)}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{kpis?.available_lots || 0}</div>
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
                  strokeDasharray={`${((kpis?.reserved_lots || 0) / totalLots) * 100}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{Math.round(((kpis?.reserved_lots || 0) / totalLots) * 100)}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{kpis?.reserved_lots || 0}</div>
              <div className="kpis-stock-label">R&eacute;serv&eacute;s</div>
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
                  strokeDasharray={`${((kpis?.sold_lots || 0) / totalLots) * 100}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{Math.round(((kpis?.sold_lots || 0) / totalLots) * 100)}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{kpis?.sold_lots || 0}</div>
              <div className="kpis-stock-label">Vendus</div>
            </div>
          </div>

          <div className="kpis-stock-card blocked">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle blocked"
                  strokeDasharray={`${((kpis?.blocked_lots || 0) / totalLots) * 100}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{Math.round(((kpis?.blocked_lots || 0) / totalLots) * 100)}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{kpis?.blocked_lots || 0}</div>
              <div className="kpis-stock-label">Bloqu&eacute;s</div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial & Surface Stats */}
      <div className="kpis-dual-section">
        {/* Indicateurs Financiers */}
        <div className="kpis-section-v2">
          <div className="kpis-section-header">
            <h3>
              <span className="kpis-section-icon">💰</span>
              Indicateurs Financiers
            </h3>
          </div>

          <div className="kpis-metrics-list">
            <div className="kpis-metric-item">
              <div className="kpis-metric-icon primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">CA Objectif</div>
                <div className="kpis-metric-value">{formatMoney(kpis?.ca_objectif)}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon success">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Prix Moyen / Lot</div>
                <div className="kpis-metric-value">{formatMoney(kpis?.prix_moyen_lot)}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M9 21V9"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Prix Moyen / m²</div>
                <div className="kpis-metric-value">{formatMoney(kpis?.prix_moyen_m2)}</div>
              </div>
            </div>

            <div className="kpis-metric-item">
              <div className="kpis-metric-icon info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2"/>
                  <path d="M1 10h22"/>
                </svg>
              </div>
              <div className="kpis-metric-content">
                <div className="kpis-metric-label">Total Acomptes</div>
                <div className="kpis-metric-value">{formatMoney(kpis?.total_deposits)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Surfaces */}
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
                <div className="kpis-metric-value">{formatSurface(kpis?.surface_totale)}</div>
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
                <div className="kpis-metric-value">{formatSurface(kpis?.surface_disponible)}</div>
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
                <div className="kpis-metric-label">R&eacute;serv&eacute;e</div>
                <div className="kpis-metric-value">{formatSurface(kpis?.surface_reservee)}</div>
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
                <div className="kpis-metric-value">{formatSurface(kpis?.surface_vendue)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Rates */}
      <div className="kpis-section-v2">
        <div className="kpis-section-header">
          <h3>
            <span className="kpis-section-icon">📈</span>
            Taux de Performance
          </h3>
        </div>

        <div className="kpis-rates-grid">
          <div className="kpis-rate-card">
            <div className="kpis-rate-header">
              <span>Taux de Vente</span>
              <span className="kpis-rate-value" style={{ color: (kpis?.taux_vente || 0) >= 50 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                {kpis?.taux_vente || 0}%
              </span>
            </div>
            <div className="kpis-rate-bar">
              <div
                className="kpis-rate-fill"
                style={{
                  width: `${Math.min(kpis?.taux_vente || 0, 100)}%`,
                  background: (kpis?.taux_vente || 0) >= 50 ? 'var(--color-success)' : 'var(--color-warning)'
                }}
              />
            </div>
          </div>

          <div className="kpis-rate-card">
            <div className="kpis-rate-header">
              <span>Taux de R&eacute;servation</span>
              <span className="kpis-rate-value" style={{ color: 'var(--color-warning)' }}>
                {kpis?.taux_reservation || 0}%
              </span>
            </div>
            <div className="kpis-rate-bar">
              <div
                className="kpis-rate-fill"
                style={{
                  width: `${Math.min(kpis?.taux_reservation || 0, 100)}%`,
                  background: 'var(--color-warning)'
                }}
              />
            </div>
          </div>

          <div className="kpis-rate-card">
            <div className="kpis-rate-header">
              <span>Taux de Conversion</span>
              <span className="kpis-rate-value" style={{ color: (kpis?.taux_conversion || 0) >= 50 ? 'var(--color-success)' : 'var(--color-primary)' }}>
                {kpis?.taux_conversion || 0}%
              </span>
            </div>
            <div className="kpis-rate-bar">
              <div
                className="kpis-rate-fill"
                style={{
                  width: `${Math.min(kpis?.taux_conversion || 0, 100)}%`,
                  background: (kpis?.taux_conversion || 0) >= 50 ? 'var(--color-success)' : 'var(--color-primary)'
                }}
              />
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

// Circular Progress Component
function CircularProgress({ value, size = 80, strokeWidth = 6, color = 'var(--color-primary)' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="circular-progress">
      <circle
        className="circular-progress-bg"
        stroke="var(--bg-tertiary)"
        strokeWidth={strokeWidth}
        fill="none"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="circular-progress-value"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: offset,
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.8s ease-out'
        }}
      />
    </svg>
  );
}

// Performance Tab Component
function PerformanceTab({ project }) {
  const [commercials, setCommercials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommercial, setSelectedCommercial] = useState(null);

  useEffect(() => {
    loadPerformance();
  }, [project.id]);

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/projects/${project.id}/performance`);
      setCommercials(data || []);
    } catch (err) {
      console.error(err);
      setCommercials([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculer le r&eacute;sum&eacute; &agrave; partir des donn&eacute;es des commerciaux
  const summary = {
    total_ventes: commercials.reduce((sum, c) => sum + (c.total_sales || 0), 0),
    total_ca: commercials.reduce((sum, c) => sum + (c.ca_total || 0), 0),
    ca_moyen: commercials.length > 0
      ? Math.round(commercials.reduce((sum, c) => sum + (c.ca_total || 0), 0) / commercials.length)
      : 0,
  };

  // Calculer le CA moyen pour le score de performance
  const caAverage = commercials.length > 0 ? summary.total_ca / commercials.length : 0;

  // Fonction pour calculer le score de performance bas&eacute; sur le CA
  const getPerformanceScore = (commercial) => {
    if (caAverage === 0) return 0;
    return Math.round((commercial.ca_total / caAverage) * 100);
  };

  // Trier les commerciaux par CA pour le classement
  const sortedCommercials = [...commercials].sort((a, b) => (b.ca_total || 0) - (a.ca_total || 0));
  const maxCA = sortedCommercials.length > 0 ? (sortedCommercials[0].ca_total || 1) : 1;

  const handleSelectCommercial = (commercial) => {
    if (selectedCommercial?.user_id === commercial.user_id) {
      setSelectedCommercial(null);
    } else {
      setSelectedCommercial(commercial);
    }
  };

  const getRankBadge = (index) => {
    if (index === 0) return { icon: '🥇', color: '#FFD700', label: '1er' };
    if (index === 1) return { icon: '🥈', color: '#C0C0C0', label: '2e' };
    if (index === 2) return { icon: '🥉', color: '#CD7F32', label: '3e' };
    return { icon: null, color: 'var(--text-muted)', label: `${index + 1}e` };
  };

  const getPerformanceColor = (score) => {
    if (score >= 100) return 'var(--color-success)'; // Au-dessus ou &eacute;gal &agrave; la moyenne
    if (score >= 70) return 'var(--color-warning)'; // En dessous mais acceptable
    return 'var(--color-danger)'; // Bien en dessous de la moyenne
  };

  if (loading) {
    return (
      <div className="perf-loading">
        <div className="loading-spinner"></div>
        <p>Chargement des performances...</p>
      </div>
    );
  }

  return (
    <div className="performance-tab-v2">
      {/* Summary Header */}
      {commercials.length > 0 && (
        <div className="perf-summary-header">
          <div className="perf-summary-grid">
            <div className="perf-summary-card gradient-primary">
              <div className="perf-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20V10M18 20V4M6 20v-4"/>
                </svg>
              </div>
              <div className="perf-summary-content">
                <div className="perf-summary-value">{summary.total_ventes}</div>
                <div className="perf-summary-label">Ventes Totales</div>
              </div>
            </div>

            <div className="perf-summary-card gradient-success">
              <div className="perf-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <div className="perf-summary-content">
                <div className="perf-summary-value">{formatNumberPerf(summary.total_ca, '')}</div>
                <div className="perf-summary-label">CA Total (MAD)</div>
              </div>
            </div>

            <div className="perf-summary-card gradient-warning">
              <div className="perf-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div className="perf-summary-content">
                <div className="perf-summary-value">{formatNumberPerf(summary.ca_moyen, '')}</div>
                <div className="perf-summary-label">CA Moyen / Commercial</div>
              </div>
            </div>

            <div className="perf-summary-card gradient-info">
              <div className="perf-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div className="perf-summary-content">
                <div className="perf-summary-value">{commercials.length}</div>
                <div className="perf-summary-label">Commerciaux</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="perf-section">
        <div className="perf-section-header">
          <h3>
            <span className="perf-section-icon">🏆</span>
            Classement des Commerciaux
          </h3>
          {commercials.length > 0 && (
            <span className="perf-section-badge">{commercials.length} actifs</span>
          )}
        </div>

        {sortedCommercials.length > 0 ? (
          <div className="perf-leaderboard">
            {sortedCommercials.map((commercial, index) => {
              const rank = getRankBadge(index);
              const isSelected = selectedCommercial?.user_id === commercial.user_id;
              const caPercent = ((commercial.ca_total || 0) / maxCA) * 100;

              return (
                <div
                  key={commercial.user_id}
                  className={`perf-commercial-card ${isSelected ? 'selected' : ''} ${index < 3 ? 'top-three' : ''}`}
                  onClick={() => handleSelectCommercial(commercial)}
                >
                  {/* Rank Badge */}
                  <div className="perf-rank" style={{ color: rank.color }}>
                    {rank.icon ? (
                      <span className="perf-rank-icon">{rank.icon}</span>
                    ) : (
                      <span className="perf-rank-number">{rank.label}</span>
                    )}
                  </div>

                  {/* Avatar & Info */}
                  <div className="perf-commercial-main">
                    <div className="perf-avatar" style={{
                      background: index === 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' :
                                 index === 1 ? 'linear-gradient(135deg, #C0C0C0, #A0A0A0)' :
                                 index === 2 ? 'linear-gradient(135deg, #CD7F32, #8B4513)' :
                                 'var(--color-primary)'
                    }}>
                      {commercial.user_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                    </div>
                    <div className="perf-commercial-info">
                      <div className="perf-commercial-name">{commercial.user_name}</div>
                      <div className="perf-commercial-stats-mini">
                        <span className="perf-stat-mini success">
                          <strong>{commercial.total_sales || 0}</strong> ventes
                        </span>
                        <span className="perf-stat-mini warning">
                          <strong>{commercial.total_reservations || 0}</strong> r&eacute;serv.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CA Bar */}
                  <div className="perf-ca-section">
                    <div className="perf-ca-value">{formatNumberPerf(commercial.ca_total, 'MAD')}</div>
                    <div className="perf-ca-bar">
                      <div
                        className="perf-ca-fill"
                        style={{
                          width: `${caPercent}%`,
                          background: index === 0 ? 'linear-gradient(90deg, #FFD700, #FFA500)' :
                                     'var(--color-primary)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Performance Score Circle */}
                  <div className="perf-transformation">
                    <div className="perf-circle-container">
                      <CircularProgress
                        value={Math.min(getPerformanceScore(commercial), 100)}
                        size={56}
                        strokeWidth={5}
                        color={getPerformanceColor(getPerformanceScore(commercial))}
                      />
                      <div className="perf-circle-value">
                        {getPerformanceScore(commercial)}%
                      </div>
                    </div>
                  </div>

                  {/* Expand Arrow */}
                  <div className={`perf-expand-icon ${isSelected ? 'expanded' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded Details Panel */}
                  {isSelected && (
                    <div className="perf-details-panel">
                      <div className="perf-details-grid">
                        <div className="perf-detail-card">
                          <div className="perf-detail-icon success">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </div>
                          <div className="perf-detail-content">
                            <div className="perf-detail-value">{commercial.total_sales || 0}</div>
                            <div className="perf-detail-label">Lots Vendus</div>
                          </div>
                        </div>

                        <div className="perf-detail-card">
                          <div className="perf-detail-icon warning">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                          </div>
                          <div className="perf-detail-content">
                            <div className="perf-detail-value">{commercial.total_reservations || 0}</div>
                            <div className="perf-detail-label">R&eacute;servations</div>
                          </div>
                        </div>

                        <div className="perf-detail-card">
                          <div className="perf-detail-icon primary">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                          </div>
                          <div className="perf-detail-content">
                            <div className="perf-detail-value">
                              {formatNumberPerf(commercial.total_sales > 0 ? commercial.ca_total / commercial.total_sales : 0, '')}
                            </div>
                            <div className="perf-detail-label">CA Moyen/Vente</div>
                          </div>
                        </div>

                        <div className="perf-detail-card">
                          <div className="perf-detail-icon info">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                            </svg>
                          </div>
                          <div className="perf-detail-content">
                            <div className="perf-detail-value">{commercial.converted_reservations || 0}</div>
                            <div className="perf-detail-label">Conversions</div>
                          </div>
                        </div>
                      </div>

                      {/* Performance Progress */}
                      <div className="perf-progress-section">
                        <div className="perf-progress-header">
                          <span>
                            Score de Performance (vs moyenne)
                            <span className="kpis-info-icon kpis-info-icon-dark" title="Score calculé par rapport à la moyenne des commerciaux (100% = moyenne). Au-dessus de 100% : performance supérieure à la moyenne">ⓘ</span>
                          </span>
                          <span className="perf-progress-value" style={{ color: getPerformanceColor(getPerformanceScore(commercial)) }}>
                            {getPerformanceScore(commercial)}%
                          </span>
                        </div>
                        <div className="perf-progress-bar">
                          <div
                            className="perf-progress-fill"
                            style={{
                              width: `${Math.min(getPerformanceScore(commercial), 100)}%`,
                              background: `linear-gradient(90deg, ${getPerformanceColor(getPerformanceScore(commercial))}, ${getPerformanceColor(getPerformanceScore(commercial))}88)`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="perf-empty-state">
            <div className="perf-empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h4>Aucun commercial assign&eacute;</h4>
            <p>Assignez des commerciaux &agrave; ce projet pour suivre leurs performances.</p>
          </div>
        )}
      </div>
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
      const params = new URLSearchParams();
      if (isCommercial && userId) {
        params.append('user_id', userId);
      }
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

  const getActionConfig = (action) => {
    const configs = {
      create: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        ),
        color: 'var(--color-success)',
        bg: 'rgba(16, 185, 129, 0.15)',
        label: 'Création'
      },
      update: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        ),
        color: 'var(--color-primary)',
        bg: 'rgba(59, 130, 246, 0.15)',
        label: 'Modification'
      },
      delete: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        ),
        color: 'var(--color-danger)',
        bg: 'rgba(239, 68, 68, 0.15)',
        label: 'Suppression'
      },
      reserve: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        ),
        color: 'var(--color-warning)',
        bg: 'rgba(245, 158, 11, 0.15)',
        label: 'Réservation'
      },
      sell: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        ),
        color: 'var(--color-success)',
        bg: 'rgba(16, 185, 129, 0.15)',
        label: 'Vente'
      },
      cancel: {
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        ),
        color: 'var(--color-danger)',
        bg: 'rgba(239, 68, 68, 0.15)',
        label: 'Annulation'
      },
    };
    return configs[action] || {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      ),
      color: 'var(--text-secondary)',
      bg: 'var(--bg-tertiary)',
      label: 'Action'
    };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Aujourd'hui à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Hier à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${date.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  };

  // Grouper par date
  const groupedHistory = history.reduce((groups, entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {});

  if (loading) {
    return (
      <div className="history-loading">
        <div className="loading-spinner"></div>
        <p>Chargement de l'historique...</p>
      </div>
    );
  }

  return (
    <div className="historique-tab-v2">
      {/* Header */}
      <div className="history-header">
        <div className="history-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {isCommercial ? 'Mon Historique' : 'Historique du Projet'}
        </div>
        <div className="history-count">
          {history.length} événement{history.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <div className="history-filter-group">
          <label className="history-filter-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Du
          </label>
          <input
            type="date"
            className="history-filter-input"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>
        <div className="history-filter-group">
          <label className="history-filter-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Au
          </label>
          <input
            type="date"
            className="history-filter-input"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>
        {(dateDebut || dateFin) && (
          <button className="history-filter-clear" onClick={resetFilters}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Effacer
          </button>
        )}
      </div>

      {/* Timeline */}
      {history.length > 0 ? (
        <div className="history-timeline">
          {Object.entries(groupedHistory).map(([date, entries]) => (
            <div key={date} className="history-day-group">
              <div className="history-day-header">
                <div className="history-day-line"></div>
                <span className="history-day-label">{date}</span>
                <div className="history-day-line"></div>
              </div>
              <div className="history-entries">
                {entries.map((entry, index) => {
                  const config = getActionConfig(entry.action);
                  return (
                    <div key={entry.id} className="history-entry">
                      <div className="history-entry-timeline">
                        <div
                          className="history-entry-icon"
                          style={{ background: config.bg, color: config.color }}
                        >
                          {config.icon}
                        </div>
                        {index < entries.length - 1 && <div className="history-entry-connector"></div>}
                      </div>
                      <div className="history-entry-content">
                        <div className="history-entry-header">
                          <span
                            className="history-entry-type"
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                          <span className="history-entry-time">
                            {new Date(entry.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="history-entry-description">
                          {entry.description}
                        </div>
                        <div className="history-entry-user">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          {entry.user_name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <div className="history-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="history-empty-title">Aucun historique</div>
          <div className="history-empty-text">
            {dateDebut || dateFin
              ? 'Aucun événement pour cette période'
              : 'Les actions sur ce projet apparaîtront ici'}
          </div>
        </div>
      )}
    </div>
  );
}

// Parametres Tab Component
function ParametresTab({ project, onUpdate }) {
  const [formData, setFormData] = useState({
    name: project.name || '',
    description: project.description || '',
    visibility: project.visibility || 'private',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // CSV Import state
  const [csvFile, setCsvFile] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const csvInputRef = useRef(null);

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

  const handleCsvSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setCsvResult(null);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;

    setCsvLoading(true);
    setCsvResult(null);

    try {
      const result = await apiUploadFile(`/api/projects/${project.id}/import-csv`, csvFile);

      // Determine if it's a success or partial success
      const hasUpdates = (result.updated || 0) > 0;
      const hasErrors = (result.errors && result.errors.length > 0) || (result.not_found || 0) > 0;

      setCsvResult({
        success: true,
        hasUpdates,
        hasErrors,
        ...result,
      });
      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = '';

      // Only refresh if there were updates
      if (hasUpdates) {
        onUpdate();
      }
    } catch (err) {
      setCsvResult({
        success: false,
        message: err.message || 'Erreur lors de l\'import',
      });
    } finally {
      setCsvLoading(false);
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

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>
      </div>

      {/* CSV Import Section */}
      <div className="section-card" style={{ marginTop: 'var(--spacing-lg)' }}>
        <h3>Import CSV Métadonnées</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
          Importez un fichier CSV pour mettre à jour les métadonnées des lots.
          Le fichier doit contenir une colonne <strong>parcelid</strong> correspondant au numéro du lot.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
          Colonnes supportées: <code>parcelid</code>, <code>type de lots</code>, <code>emplacement</code>, <code>type maison</code>, <code>prix</code>
        </p>

        <div className="flex gap-md items-center" style={{ flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".csv"
            ref={csvInputRef}
            onChange={handleCsvSelect}
            className="form-input"
            style={{ maxWidth: 300 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleCsvImport}
            disabled={!csvFile || csvLoading}
          >
            {csvLoading ? 'Import en cours...' : 'Importer CSV'}
          </button>
        </div>

        {csvFile && (
          <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>
            Fichier sélectionné: <strong>{csvFile.name}</strong>
          </p>
        )}

        {csvResult && (
          <div
            className={`alert ${!csvResult.success ? 'alert-error' : csvResult.hasUpdates && !csvResult.hasErrors ? 'alert-success' : 'alert-warning'}`}
            style={{ marginTop: 'var(--spacing-md)' }}
          >
            {csvResult.success ? (
              <>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {csvResult.hasUpdates && !csvResult.hasErrors ? (
                    <>✅ Import réussi!</>
                  ) : csvResult.hasUpdates && csvResult.hasErrors ? (
                    <>⚠️ Import partiel</>
                  ) : (
                    <>❌ Aucune mise à jour</>
                  )}
                </strong>
                <ul style={{ margin: 'var(--spacing-sm) 0 0 var(--spacing-md)', padding: 0, listStyle: 'none' }}>
                  <li style={{ color: csvResult.updated > 0 ? 'var(--success)' : 'inherit' }}>
                    ✓ Lots mis à jour: <strong>{csvResult.updated || 0}</strong>
                  </li>
                  {(csvResult.skipped || 0) > 0 && (
                    <li style={{ color: 'var(--text-secondary)' }}>
                      ○ Lots ignorés: {csvResult.skipped}
                    </li>
                  )}
                  {(csvResult.not_found || 0) > 0 && (
                    <li style={{ color: 'var(--warning)' }}>
                      ⚠ Lots non trouvés: {csvResult.not_found}
                    </li>
                  )}
                </ul>
                {csvResult.errors && csvResult.errors.length > 0 && (
                  <details style={{ marginTop: 'var(--spacing-sm)' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--warning)' }}>
                      Voir les détails ({csvResult.errors.length} avertissement{csvResult.errors.length > 1 ? 's' : ''})
                    </summary>
                    <ul style={{ fontSize: '0.8rem', marginTop: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
                      {csvResult.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {csvResult.errors.length > 10 && (
                        <li>... et {csvResult.errors.length - 10} autres</li>
                      )}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                ❌ Erreur: {csvResult.message}
              </strong>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bulk Metadata Modal ────────────────────────────────────────────────────
function BulkMetadataModal({ projectId, selectedCount, selectedLotIds, onClose, onSuccess }) {
  const [form, setForm] = useState({
    type_lot: '',
    emplacement: '',
    type_maison: '',
    price: '',
    surface: '',
    zone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Build payload with only non-empty fields
    const payload = { lot_ids: selectedLotIds };
    if (form.type_lot.trim()) payload.type_lot = form.type_lot.trim();
    if (form.emplacement.trim()) payload.emplacement = form.emplacement.trim();
    if (form.type_maison.trim()) payload.type_maison = form.type_maison.trim();
    if (form.price !== '') payload.price = parseFloat(form.price);
    if (form.surface !== '') payload.surface = parseFloat(form.surface);
    if (form.zone.trim()) payload.zone = form.zone.trim();

    if (Object.keys(payload).length === 1) {
      setError('Veuillez renseigner au moins un champ à modifier.');
      return;
    }

    setSaving(true);
    try {
      const result = await apiPatch(`/api/projects/${projectId}/lots/bulk-metadata`, payload);
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Modifier les métadonnées
            <span style={{ fontSize: '0.75rem', fontWeight: 500, background: '#3b82f6', color: '#fff', borderRadius: '999px', padding: '2px 10px', marginLeft: 8 }}>
              {selectedCount} lot{selectedCount > 1 ? 's' : ''}
            </span>
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 16, background: 'var(--color-bg-secondary)', padding: '8px 12px', borderRadius: 8 }}>
              Seuls les champs renseignés seront modifiés. Les champs vides seront ignorés.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Type de lot</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Résidentiel, Commercial…"
                  value={form.type_lot}
                  onChange={handleChange('type_lot')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Emplacement</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: 2 façade, 3 façade…"
                  value={form.emplacement}
                  onChange={handleChange('emplacement')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type de maison</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Villa, Appartement…"
                  value={form.type_maison}
                  onChange={handleChange('type_maison')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Zone</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: A, B, Zone Nord…"
                  value={form.zone}
                  onChange={handleChange('zone')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Prix (MAD)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="ex: 450000"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={handleChange('price')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Surface (m²)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="ex: 120"
                  min="0"
                  step="0.01"
                  value={form.surface}
                  onChange={handleChange('surface')}
                />
              </div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Mise à jour…'
                : `Appliquer aux ${selectedCount} lot${selectedCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
