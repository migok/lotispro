import { STATUS_COLORS } from '../../utils/constants';
import { formatMad, formatSurface } from '../../utils/formatters';
import { normalizeTypeLot, statusLabel } from './lotsFilters';

/** Liste des lots filtrés ; une ligne (clic, Entrée ou Espace) ouvre le détail du lot. */
export default function LotsList({ lots, onOpenLot }) {
  if (lots.length === 0) {
    return <p className="lots-list-empty">Aucun lot ne correspond aux filtres.</p>;
  }

  const handleKeyDown = (event, lot) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenLot(lot);
    }
  };

  return (
    <div className="lots-list-scroll">
      <table className="lots-table lots-list" aria-label="Liste des lots">
        <thead>
          <tr>
            <th scope="col">Numéro</th>
            <th scope="col">Type</th>
            <th scope="col">Statut</th>
            <th scope="col">Surface (m²)</th>
            <th scope="col">Prix</th>
            <th scope="col">Client</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr
              key={lot.id ?? lot.numero}
              className="lots-list-row"
              tabIndex={0}
              onClick={() => onOpenLot(lot)}
              onKeyDown={(event) => handleKeyDown(event, lot)}
            >
              <td className="lots-list-numero">{lot.numero}</td>
              <td>{normalizeTypeLot(lot.type_lot) ?? '—'}</td>
              <td>
                <span className="lots-list-status" style={{ '--status-color': STATUS_COLORS[lot.status] }}>
                  <span className="status-dot" aria-hidden="true" />
                  {statusLabel(lot.status)}
                </span>
              </td>
              <td>{formatSurface(lot.surface) || '—'}</td>
              <td>{lot.price ? formatMad(lot.price) : '—'}</td>
              <td>{lot.client_name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
