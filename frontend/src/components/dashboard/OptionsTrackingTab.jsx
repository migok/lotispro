import { DeadlineBadge } from '../ui/deadline-badge';
import { formatDate } from '../../utils/formatters';
export default function OptionsTrackingTab({ optionsTracking, optionsTrackingError, effectiveProjectId, onSelectLot, isManager }) {
  const expired = optionsTracking.filter(o => o.is_expired);
  const active = optionsTracking.filter(o => !o.is_expired);


  return (
    <div className="opt-tracking-section">
      {/* Résumé */}
      <div className="opt-summary-strip">
        <div className="opt-summary-tile opt-summary-tile--total">
          <span className="opt-summary-value">{optionsTracking.length}</span>
          <span className="opt-summary-label">Options actives</span>
        </div>
        <div className="opt-summary-tile opt-summary-tile--expired">
          <span className="opt-summary-value">{expired.length}</span>
          <span className="opt-summary-label">Expirées</span>
        </div>
        <div className="opt-summary-tile opt-summary-tile--warn">
          <span className="opt-summary-value">{active.filter(o => o.days_remaining <= 3).length}</span>
          <span className="opt-summary-label">Expirent dans 3j</span>
        </div>
        <div className="opt-summary-tile opt-summary-tile--ok">
          <span className="opt-summary-value">{active.filter(o => o.days_remaining > 3).length}</span>
          <span className="opt-summary-label">En cours</span>
        </div>
      </div>

      {optionsTrackingError ? (
        <div className="empty-state" style={{ padding: '48px 24px' }}>
          <div className="empty-state-title" style={{ color: 'var(--color-danger)' }}>Erreur de chargement</div>
          <div className="empty-state-description">Impossible de récupérer les options. Vérifiez la console pour plus de détails.</div>
        </div>
      ) : optionsTracking.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 24px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div className="empty-state-title" style={{ color: 'var(--color-success)' }}>Aucune option active</div>
          <div className="empty-state-description">Toutes les options ont été traitées.</div>
        </div>
      ) : (
        <div className="opt-table-wrap">
          <table className="opt-table">
            <thead>
              <tr>
                <th>Lot</th>
                {!effectiveProjectId && <th>Projet</th>}
                <th>Client</th>
                {isManager() && <th>Commercial</th>}
                <th>Statut</th>
                <th>Date option</th>
                <th>Expiration</th>
                <th>Urgence</th>
              </tr>
            </thead>
            <tbody>
              {optionsTracking.map((o) => {

                return (
                  <tr
                    key={o.lot_id}
                    className={`opt-row${o.is_expired ? ' opt-row--expired' : ''}`}
                  >
                    <td className="opt-cell-numero">{onSelectLot ? <button type="button" className="ui-lot-link" aria-label={`Ouvrir le lot ${o.lot_numero}`} onClick={() => onSelectLot({ id: o.lot_id })}>#{o.lot_numero}</button> : <span>#{o.lot_numero}</span>}</td>
                    {!effectiveProjectId && <td className="opt-cell-project">{o.project_name}</td>}
                    <td className="opt-cell-client">
                      <div className="opt-client-name">{o.client_name}</div>
                      {o.client_phone && <div className="opt-client-phone">{o.client_phone}</div>}
                    </td>
                    {isManager() && <td className="opt-cell-commercial">{o.reserved_by_name || '—'}</td>}
                    <td>
                      <span className={`status-badge ${o.lot_status}`} style={{ fontSize: 'var(--type-label)', padding: '3px 8px' }}>
                        {o.lot_status === 'option' ? 'Option' : 'Résa. à finaliser'}
                      </span>
                    </td>
                    <td className="opt-cell-date">{o.reservation_date ? formatDate(o.reservation_date, { dateStyle: 'short' }) : '—'}</td>
                    <td className="opt-cell-date">{formatDate(o.expiration_date, { dateStyle: 'short' })}</td>
                    <td><DeadlineBadge date={o.expiration_date} isExpired={o.is_expired} daysRemaining={o.days_remaining} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
