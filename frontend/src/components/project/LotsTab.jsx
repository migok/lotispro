import { useEffect, useMemo, useState } from 'react';
import LotDetailModal from '../LotDetailModal';
import { fetchLotsMatrix, fetchProjectLots } from '../../services/projectLotsService';
import LotsFiltersBar from './LotsFiltersBar';
import LotsMatrix from './LotsMatrix';
import LotsList from './LotsList';
import {
  EMPTY_FILTERS, NO_TYPE, NO_TYPE_LABEL, applyLotsFilters, loadFilters, lotsCount, saveFilters, statusLabel,
} from './lotsFilters';

const LOAD_ERROR = 'Impossible de charger les lots du projet.';

/** « Villa · Disponible », « Option », « Tous les lots »… */
const describeFilters = (filters) => {
  const parts = [];
  if (filters.typeLot !== null) parts.push(filters.typeLot === NO_TYPE ? NO_TYPE_LABEL : filters.typeLot);
  if (filters.statuses.length > 0) parts.push(filters.statuses.map(statusLabel).join(', '));
  return parts.length > 0 ? parts.join(' · ') : 'Tous les lots';
};

/**
 * Onglet « Lots » de la page projet (E5) : grille type × statut (toujours tout le projet)
 * et liste filtrée côté client ; le détail d'un lot s'ouvre par-dessus la liste, qui reste montée.
 */
export default function LotsTab({ projectId, enabledOptional }) {
  // The parent keys this tab by project, so the persisted filters are read once per project.
  const [filters, setFilters] = useState(() => loadFilters(projectId));
  const [matrix, setMatrix] = useState(null);
  const [lots, setLots] = useState(null);
  const [error, setError] = useState('');
  const [selectedLot, setSelectedLot] = useState(null);
  // Bumped by the modal after a transition (D5): grid and list reload, filters stay.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLotsMatrix(projectId), fetchProjectLots(projectId)])
      .then(([nextMatrix, nextLots]) => {
        if (cancelled) return;
        setMatrix(nextMatrix);
        setLots(nextLots);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || LOAD_ERROR);
      });
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const updateFilters = (next) => {
    setFilters(next);
    saveFilters(projectId, next);
  };

  const visibleLots = useMemo(() => (lots ? applyLotsFilters(lots, filters) : []), [lots, filters]);

  // Types of the grid rows; a persisted type the grid no longer has stays selectable so the select never lies.
  const typeOptions = useMemo(() => {
    const types = matrix ? matrix.rows.map((row) => row.type_lot) : [];
    if (filters.typeLot !== null && filters.typeLot !== NO_TYPE && !types.includes(filters.typeLot)) {
      types.push(filters.typeLot);
    }
    return types;
  }, [matrix, filters.typeLot]);

  const loaded = matrix !== null && lots !== null;

  return (
    <div className="lots-tab">
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {!loaded && !error && (
        <div className="lots-tab-loading"><div className="loading-spinner" /></div>
      )}

      {loaded && matrix.grand_total === 0 && (
        <p className="lots-tab-empty">Aucun lot dans ce projet.</p>
      )}

      {loaded && matrix.grand_total > 0 && (
        <>
          <section className="lots-tab-section">
            <LotsFiltersBar
              filters={filters}
              statuses={matrix.statuses}
              typeOptions={typeOptions}
              onChange={updateFilters}
              onReset={() => updateFilters({ ...EMPTY_FILTERS, statuses: [] })}
            />
            <LotsMatrix matrix={matrix} filters={filters} onSelect={updateFilters} />
          </section>

          <section className="lots-tab-section">
            <h2 className="lots-tab-title">
              {describeFilters(filters)} — {lotsCount(visibleLots.length)}
            </h2>
            <LotsList lots={visibleLots} onOpenLot={setSelectedLot} />
          </section>
        </>
      )}

      {selectedLot && (
        <LotDetailModal
          lot={selectedLot}
          onClose={() => setSelectedLot(null)}
          onRefresh={refresh}
          enabledOptionalStatuses={enabledOptional}
        />
      )}
    </div>
  );
}
