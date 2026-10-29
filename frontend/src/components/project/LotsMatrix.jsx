import { STATUS_COLORS } from '../../utils/constants';
import { EMPTY_FILTERS, NO_TYPE, NO_TYPE_LABEL, lotsCount, statusLabel } from './lotsFilters';

const isSelection = (filters, status, typeLot) =>
  filters.typeLot === typeLot
  && (status === null
    ? filters.statuses.length === 0
    : filters.statuses.length === 1 && filters.statuses[0] === status);

/**
 * Compteur de la grille : bouton qui applique `next` quand il y a des lots,
 * simple nombre grisé sinon (D2 : les zéros ne sont pas cliquables).
 */
function CountCell({ count, label, color, selected, onClick, className = '' }) {
  const style = color ? { '--cell-color': color } : undefined;
  if (!count) {
    return <td className={`lots-matrix-count lots-matrix-count--zero ${className}`}>0</td>;
  }
  return (
    <td className={`lots-matrix-count ${color ? 'lots-matrix-count--status' : ''} ${className}`} style={style}>
      <button
        type="button"
        className={`lots-matrix-btn${selected ? ' is-selected' : ''}`}
        aria-label={`${label} : ${lotsCount(count)}`}
        aria-pressed={selected}
        onClick={onClick}
      >
        {count}
      </button>
    </td>
  );
}

/** Grille type de lot × statut avec totaux ; un clic choisit les filtres de la liste (D2, D3). */
export default function LotsMatrix({ matrix, filters, onSelect }) {
  const select = (statuses, typeLot) => onSelect({ statuses, typeLot, search: filters.search });

  return (
    <div className="lots-matrix-scroll">
      <table className="lots-matrix" aria-label="Lots par type et statut">
        <thead>
          <tr>
            <th scope="col" className="lots-matrix-type">Type de lot</th>
            {matrix.statuses.map((status) => (
              <th scope="col" key={status} style={{ '--cell-color': STATUS_COLORS[status] }} className="lots-matrix-status">
                {statusLabel(status)}
              </th>
            ))}
            <th scope="col" className="lots-matrix-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const typeKey = row.type_lot ?? NO_TYPE;
            const typeLabel = row.type_lot ?? NO_TYPE_LABEL;
            return (
              <tr key={typeKey}>
                <th scope="row" className={`lots-matrix-type${row.type_lot === null ? ' lots-matrix-type--none' : ''}`}>
                  {typeLabel}
                </th>
                {matrix.statuses.map((status) => (
                  <CountCell
                    key={status}
                    count={row.counts[status]}
                    label={`${typeLabel} — ${statusLabel(status)}`}
                    color={STATUS_COLORS[status]}
                    selected={isSelection(filters, status, typeKey)}
                    onClick={() => select([status], typeKey)}
                  />
                ))}
                <CountCell
                  count={row.total}
                  label={`${typeLabel} — Total`}
                  selected={isSelection(filters, null, typeKey)}
                  onClick={() => select([], typeKey)}
                  className="lots-matrix-total"
                />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="lots-matrix-type">Total</th>
            {matrix.statuses.map((status) => (
              <CountCell
                key={status}
                count={matrix.totals[status]}
                label={`Total — ${statusLabel(status)}`}
                color={STATUS_COLORS[status]}
                selected={isSelection(filters, status, null)}
                onClick={() => select([status], null)}
              />
            ))}
            <CountCell
              count={matrix.grand_total}
              label="Total général"
              selected={false}
              onClick={() => onSelect(EMPTY_FILTERS)}
              className="lots-matrix-total"
            />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
