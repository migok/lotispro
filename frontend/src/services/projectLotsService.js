import { apiFetch, apiGet, buildApiError } from '../utils/api';
import { lotFromFeature } from '../utils/lotFromFeature';

/**
 * Lots d'un projet pour l'onglet « Lots » (E5) : grille type de lot × statut
 * et liste complète (même flux GeoJSON que la carte).
 */

/** Grille `{ statuses, rows: [{ type_lot, counts, total }], totals, grand_total }`. */
export const fetchLotsMatrix = (projectId) =>
  apiGet(`/api/projects/${projectId}/lots-matrix`);

/** Tous les lots du projet, au format attendu par `LotDetailModal`. Rejette avec le message de l'API. */
export const fetchProjectLots = async (projectId) => {
  const res = await apiFetch(`/api/projects/${projectId}/lots.geojson`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw buildApiError(body, res.status);
  return (body?.features ?? []).map((feature) => lotFromFeature(feature, projectId));
};
