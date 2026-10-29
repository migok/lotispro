import { STATUS_LABELS } from '../../utils/constants';
import { ALL_STATUSES } from '../../utils/lotWorkflow';

/**
 * Filtres de la liste de l'onglet « Lots » (E5).
 * `typeLot: null` = tous les types ; `NO_TYPE` = lots sans type (« Non renseigné »).
 */

export const NO_TYPE = '__none__';

export const NO_TYPE_LABEL = 'Non renseigné';

export const statusLabel = (status) => STATUS_LABELS[status] ?? status;

/** « 0 lot », « 1 lot », « 2 lots ». */
export const lotsCount = (n) => `${n} ${n > 1 ? 'lots' : 'lot'}`;

export const EMPTY_FILTERS = { statuses: [], typeLot: null, search: '' };

/** Type de lot tel que la grille le regroupe : sans espaces autour, blanc → null. */
export const normalizeTypeLot = (value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const compareNumeros = (a, b) => String(a.numero ?? '').localeCompare(String(b.numero ?? ''), 'fr', { numeric: true });

/** Lots qui passent les filtres, triés par numéro en ordre naturel (LOT-2 avant LOT-10). */
export const applyLotsFilters = (lots, filters) => {
  const search = filters.search.trim().toLowerCase();
  const wantedType = filters.typeLot === NO_TYPE ? null : filters.typeLot;

  return lots
    .filter((lot) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(lot.status)) return false;
      if (filters.typeLot !== null && normalizeTypeLot(lot.type_lot) !== wantedType) return false;
      if (search && !String(lot.numero ?? '').toLowerCase().includes(search)) return false;
      return true;
    })
    .sort(compareNumeros);
};

/** Nombre de dimensions actives (statut, type, recherche) : 0 à 3. */
export const countActiveFilters = (filters) =>
  (filters.statuses.length > 0 ? 1 : 0)
  + (filters.typeLot !== null ? 1 : 0)
  + (filters.search.trim() ? 1 : 0);

/** « 1 filtre », « 2 filtres » (D6). */
export const filtersCount = (n) => `${n} ${n > 1 ? 'filtres' : 'filtre'}`;

export const filtersStorageKey = (projectId) => `lotsFilters:${projectId}`;

/**
 * Filtres enregistrés pour ce projet dans `sessionStorage`, assainis :
 * JSON invalide, forme inattendue ou stockage inaccessible → filtres vides.
 */
export const loadFilters = (projectId) => {
  const empty = { ...EMPTY_FILTERS, statuses: [] };
  try {
    const raw = sessionStorage.getItem(filtersStorageKey(projectId));
    if (raw === null) return empty;
    const stored = JSON.parse(raw);
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return empty;
    return {
      statuses: Array.isArray(stored.statuses)
        ? [...new Set(stored.statuses.filter((s) => typeof s === 'string' && ALL_STATUSES.includes(s)))]
        : [],
      typeLot: typeof stored.typeLot === 'string' ? stored.typeLot : null,
      search: typeof stored.search === 'string' ? stored.search : '',
    };
  } catch {
    return empty;
  }
};

/** Enregistre les filtres du projet ; un stockage refusé ou plein est ignoré. */
export const saveFilters = (projectId, filters) => {
  try {
    sessionStorage.setItem(filtersStorageKey(projectId), JSON.stringify(filters));
  } catch {
    // Persistence is a convenience: the filters still work for this visit.
  }
};
