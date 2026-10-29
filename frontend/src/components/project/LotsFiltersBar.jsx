import { STATUS_COLORS } from '../../utils/constants';
import { NO_TYPE, NO_TYPE_LABEL, countActiveFilters, filtersCount, statusLabel } from './lotsFilters';

/**
 * Barre de filtres de la liste des lots (E5) : statuts multiples, type, recherche de numéro.
 * Contrôlée : l'état vit dans `LotsTab` et est partagé avec la grille.
 */
export default function LotsFiltersBar({ filters, statuses, typeOptions, onChange, onReset }) {
  const activeCount = countActiveFilters(filters);

  const toggleStatus = (status) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  return (
    <div className="lots-filters" role="group" aria-label="Filtres de la liste des lots">
      <fieldset className="lots-filters-statuses">
        <legend className="lots-filters-legend">Statut</legend>
        {statuses.map((status) => (
          <label key={status} className="lots-filters-status" style={{ '--status-color': STATUS_COLORS[status] }}>
            <input
              type="checkbox"
              checked={filters.statuses.includes(status)}
              onChange={() => toggleStatus(status)}
            />
            <span className="status-dot" aria-hidden="true" />
            {statusLabel(status)}
          </label>
        ))}
      </fieldset>

      <label className="lots-filters-field">
        <span className="lots-filters-legend">Type de lot</span>
        <select
          className="form-input"
          value={filters.typeLot ?? ''}
          onChange={(e) => onChange({ ...filters, typeLot: e.target.value === '' ? null : e.target.value })}
        >
          <option value="">Tous les types</option>
          {typeOptions.map((type) => (
            <option key={type ?? NO_TYPE} value={type ?? NO_TYPE}>{type ?? NO_TYPE_LABEL}</option>
          ))}
        </select>
      </label>

      <label className="lots-filters-field">
        <span className="lots-filters-legend">Rechercher un numéro</span>
        <input
          type="search"
          className="form-input"
          value={filters.search}
          placeholder="Ex. LOT-12"
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>

      <div className="lots-filters-actions">
        {activeCount > 0 && <span className="lots-filters-badge">{filtersCount(activeCount)}</span>}
        <button type="button" className="btn btn-ghost btn-sm" disabled={activeCount === 0} onClick={onReset}>
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
