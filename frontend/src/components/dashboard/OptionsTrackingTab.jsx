export default function OptionsTrackingTab({ optionsTracking, optionsTrackingError, effectiveProjectId, onSelectLot, isManager }) {
  const expired = optionsTracking.filter(o => o.is_expired);
  const active = optionsTracking.filter(o => !o.is_expired);

  const fmtDays = (days) => {
    if (days < 0) return { label: `+${Math.abs(Math.ceil(days))}j dépassé`, cls: 'opt-badge--expired' };
    if (days <= 1) return { label: `J-${Math.ceil(days)} critique`, cls: 'opt-badge--critical' };
    if (days <= 3) return { label: `J-${Math.ceil(days)}`, cls: 'opt-badge--warn' };
    return { label: `J-${Math.ceil(days)}`, cls: 'opt-badge--ok' };
  };

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
                const { label, cls } = fmtDays(o.days_remaining);
                return (
                  <tr
                    key={o.lot_id}
                    className={`opt-row${o.is_expired ? ' opt-row--expired' : ''}`}
                    onClick={() => onSelectLot && onSelectLot({ id: o.lot_id })}
                    style={{ cursor: onSelectLot ? 'pointer' : 'default' }}
                  >
                    <td className="opt-cell-numero">#{o.lot_numero}</td>
                    {!effectiveProjectId && <td className="opt-cell-project">{o.project_name}</td>}
                    <td className="opt-cell-client">
                      <div className="opt-client-name">{o.client_name}</div>
                      {o.client_phone && <div className="opt-client-phone">{o.client_phone}</div>}
                    </td>
                    {isManager() && <td className="opt-cell-commercial">{o.reserved_by_name || '—'}</td>}
                    <td>
                      <span className={`status-badge ${o.lot_status}`} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                        {o.lot_status === 'option' ? 'Option' : 'Résa. à finaliser'}
                      </span>
                    </td>
                    <td className="opt-cell-date">{o.reservation_date ? new Date(o.reservation_date).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="opt-cell-date">{new Date(o.expiration_date).toLocaleDateString('fr-FR')}</td>
                    <td><span className={`opt-badge ${cls}`}>{label}</span></td>
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
