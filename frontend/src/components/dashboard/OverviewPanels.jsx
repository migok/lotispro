import { useState } from 'react';
import { useToast } from '../../contexts/toastHooks';
import { apiPost } from '../../utils/api';
import { formatPrice, formatDate, formatNumber } from '../../utils/formatters';
import { ACTIVE_LOT_STATUSES, STATUS_LABELS, PIPELINE_LABELS } from '../../utils/constants';

// Calculate days remaining until expiration
const getDaysRemaining = (expirationDate) => {
  if (!expirationDate) return null;
  const now = new Date();
  const expDate = new Date(expirationDate);
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function OverviewPanels({ selectedStatuses, setSelectedStatuses, alerts, notaireAlerts, latePayments, lots, clientsPipeline, onSelectLot, onNavigate, onReleaseAlert, onReload, isManager, isCommercial }) {
  const toast = useToast();
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  return (
    <div className="dashboard-grid">
      {/* Main Column */}
      <div className="dashboard-main">
        {/* Alerts Section - Seulement pour manager et commercial */}
        {(isManager() || isCommercial()) && alerts.summary.total_at_risk > 0 && (
          <div className="section-card">
            <div className="section-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {isCommercial() ? 'Mes Alertes' : 'Alertes commerciales'}
              </h3>
              <span className="text-warning font-semibold">
                {alerts.summary.total_at_risk} réservation(s) expirant dans 3 jours ou moins
              </span>
            </div>

            <div className="stats-grid mb-lg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat-item stat-item-danger">
                <div className="stat-value text-danger num">{alerts.summary.expired_count || 0}</div>
                <div className="stat-label">Expirées</div>
              </div>
              <div className="stat-item stat-item-warning">
                <div className="stat-value text-warning num">{alerts.summary.expiring_soon_count || 0}</div>
                <div className="stat-label">Expirent bientôt</div>
              </div>
              <div className="stat-item">
                <div className="stat-value num">{formatNumber(alerts.summary.value_at_risk, 'MAD')}</div>
                <div className="stat-label">Valeur à risque</div>
              </div>
            </div>

            <div className="alerts-container">
              {alerts.reservations.slice(0, 5).map((alert) => (
                <div key={alert.id} className={`alert-card ${alert.risk_type}`}>
                  <div className="alert-icon">
                    {alert.risk_type === 'expired' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
                        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    )}
                  </div>
                  <div className="alert-content">
                    <div className="alert-title">
                      Lot {alert.lot_numero}
                      <span className="alert-client-name"> — {alert.client_name}</span>
                    </div>
                    <div className="alert-details">
                      {alert.risk_type === 'expired' ? (
                        <span className="text-danger">Expirée depuis {Math.abs(Math.round(alert.days_remaining))} jour(s)</span>
                      ) : (
                        <span>Expire dans <strong>{Math.round(alert.days_remaining)}</strong> jour(s)</span>
                      )}
                      <span className="alert-sep">·</span>
                      <span className="num">{formatPrice(alert.lot_price)}</span>
                      {alert.deposit > 0 && (
                        <>
                          <span className="alert-sep">·</span>
                          <span>Acompte prévu : <span className="num">{formatPrice(alert.deposit)}</span></span>
                        </>
                      )}
                    </div>
                    <div className="alert-actions">
                      <button className="btn btn-sm btn-ghost alert-btn-relance">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        Relancer
                      </button>
                      <button
                        className="btn btn-sm btn-ghost alert-btn-liberer"
                        onClick={() => onReleaseAlert(alert)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                        Libérer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notaire Pending Alerts Section */}
        {(isManager() || isCommercial()) && notaireAlerts.length > 0 && (
          <div className="section-card">
            <div className="section-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                  <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
                  <path d="M1.5 6.5h13M5 1v3M11 1v3" />
                </svg>
                <span style={{ color: 'var(--color-primary)' }}>Passage chez le notaire</span>
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {notaireAlerts.length} lot{notaireAlerts.length > 1 ? 's' : ''} en attente de rendez-vous
              </span>
            </div>
            <div className="alerts-container">
              {notaireAlerts.map(item => (
                <div key={item.lot_id} className="alert-card expiring_soon">
                  <div className="alert-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div className="alert-content">
                    <div className="alert-title">
                      Lot {item.lot_numero}
                      {item.lot_zone && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · Zone {item.lot_zone}</span>}
                      <span className="alert-client-name"> — {item.client_name}</span>
                    </div>
                    <div className="alert-details">
                      <span>Client souhaite passer chez le notaire</span>
                      {item.lot_price && (
                        <>
                          <span className="alert-sep">·</span>
                          <span className="num">{item.lot_price.toLocaleString('fr-FR')} MAD</span>
                        </>
                      )}
                      {item.client_phone && (
                        <>
                          <span className="alert-sep">·</span>
                          <span>{item.client_phone}</span>
                        </>
                      )}
                      {item.notary_name && (
                        <>
                          <span className="alert-sep">·</span>
                          <span>Notaire : {item.notary_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Late Payments Section */}
        {(isManager() || isCommercial()) && latePayments.length > 0 && (
          <div className="section-card">
            <div className="section-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-blocked)' }}>
                  <path d="M8 2L1 13h14L8 2z" /><path d="M8 6v4M8 11.5v.5" />
                </svg>
                <span style={{ color: 'var(--color-blocked)' }}>
                  {isCommercial() ? 'Mes paiements en retard' : 'Clients en retard de paiement'}
                </span>
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {latePayments.length} échéance{latePayments.length > 1 ? 's' : ''} impayée{latePayments.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Client', 'Lot', 'Projet', 'Type', 'Montant', 'Échéance', 'Retard'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latePayments.map(p => (
                    <tr key={p.installment_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.client_name}</div>
                        {p.client_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.client_phone}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 600 }}>
                        {p.lot_numero}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {p.project_name}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${p.payment_type === 'deposit' ? 'badge-gold' : 'badge-gray'}`} style={{ fontSize: '0.7rem' }}>
                          {p.payment_type === 'deposit' ? `Acompte ${p.installment_number}` : `Solde ${p.installment_number}`}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(p.amount)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {formatDate(p.due_date)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-blocked)', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                          {p.days_late}j
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Lots Table */}
        <div className="section-card lots-opps-card">
          <div className="section-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
              {isCommercial() ? 'Mes Lots & Opportunités' : 'Stock & Opportunités'}
            </h3>
            <div className="section-actions">
              <div className="lots-status-filters">
                {[...ACTIVE_LOT_STATUSES, 'blocked']
                  .map((key) => ({ key, cls: `filter-${key}`, label: STATUS_LABELS[key] }))
                  .map(({ key, label, cls }) => (
                  <button
                    key={key}
                    className={`lots-filter-pill ${cls} ${selectedStatuses.includes(key) ? 'active' : ''}`}
                    onClick={() => setSelectedStatuses(prev =>
                      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
                    )}
                  >
                    <span className="filter-dot" />
                    {label}
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} onClick={() => onNavigate && onNavigate('map')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                  <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
                </svg>
                Carte
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="lots-table lots-table-v2">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Statut</th>
                  <th style={{ minWidth: '80px' }}>Expir.</th>
                  <th style={{ minWidth: '80px' }}>1er vers.</th>
                  <th style={{ minWidth: '110px' }}>Acompte</th>
                  <th style={{ minWidth: '110px' }}>Solde</th>
                  <th>Prix</th>
                  <th>Client</th>
                  {(isManager() || isCommercial()) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {lots.filter(lot => {
                  if (selectedStatuses.length === 0) return true;
                  return selectedStatuses.includes(lot.status);
                }).slice(0, 20).map((lot) => {
                  const hasExpiry = ['option','reservation_a_finaliser'].includes(lot.status);
                  const daysRemaining = hasExpiry ? getDaysRemaining(lot.expiration_date) : null;
                  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;
                  const isExpired = daysRemaining !== null && daysRemaining <= 0;
                  const displayStatus = lot.status;
                  // Payment data
                  const depositPct = lot.deposit_paid_pct ?? null;
                  const balancePct = lot.balance_paid_pct ?? null;
                  const firstDepositDays = lot.first_deposit_days ?? null;

                  return (
                  <tr key={lot.id} className="lots-table-row" onClick={() => onSelectLot && onSelectLot(lot)} style={{ cursor: 'pointer' }}>
                    {/* Lot + zone + surface en sous-texte */}
                    <td>
                      <span className="lot-numero">{lot.numero}</span>
                      {(lot.zone || lot.surface) && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                          {[lot.zone, lot.surface ? `${Math.round(parseFloat(lot.surface))} m²` : null].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    {/* Statut */}
                    <td>
                      <span className={`status-badge ${displayStatus}`}>
                        <span className="status-dot"></span>
                        {STATUS_LABELS[displayStatus] || displayStatus}
                      </span>
                    </td>
                    {/* Expiration */}
                    <td>
                      {daysRemaining !== null ? (
                        <span className={`expiry-chip ${isExpired ? 'expiry-expired' : isExpiringSoon ? 'expiry-soon' : 'expiry-ok'}`}>
                          {isExpired ? `−${Math.abs(daysRemaining)}j` : `${daysRemaining}j`}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* 1er versement */}
                    <td>
                      {firstDepositDays !== null ? (
                        <span className={`expiry-chip ${firstDepositDays < 0 ? 'expiry-expired' : firstDepositDays <= 7 ? 'expiry-soon' : 'expiry-ok'}`}>
                          {firstDepositDays < 0 ? `−${Math.abs(firstDepositDays)}j` : `${firstDepositDays}j`}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* Acompte */}
                    <td>
                      {depositPct !== null ? (
                        <div className="pay-progress">
                          <div className="pay-progress-bar">
                            <div className={`pay-progress-fill ${depositPct >= 100 ? 'fill-complete' : depositPct > 0 ? 'fill-partial' : 'fill-zero'}`} style={{ width: `${Math.min(depositPct, 100)}%` }} />
                          </div>
                          <span className="pay-progress-label num">{depositPct}%</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* Solde */}
                    <td>
                      {balancePct !== null ? (
                        <div className="pay-progress">
                          <div className="pay-progress-bar">
                            <div className={`pay-progress-fill ${balancePct >= 100 ? 'fill-complete' : balancePct > 0 ? 'fill-partial' : 'fill-zero'}`} style={{ width: `${Math.min(balancePct, 100)}%` }} />
                          </div>
                          <span className="pay-progress-label num">{balancePct}%</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* Prix */}
                    <td>
                      <span className="lot-price-cell num">{formatPrice(lot.sale_price || lot.price)}</span>
                    </td>
                    {/* Client */}
                    <td>
                      {lot.client_name ? (
                        <span className="lot-client-name">{lot.client_name}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {(isManager() || isCommercial()) && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {['option','reservation_a_finaliser'].includes(lot.status) && (
                          <div style={{ display: 'flex', gap: '0.375rem' }}>
                            <button
                              className="btn-lot-action btn-lot-extend"
                              title="Prolonger l'option"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const days = prompt('Jours à ajouter :', '7');
                                if (days && !isNaN(parseInt(days)) && parseInt(days) > 0) {
                                  try {
                                    await apiPost(`/api/lots/${lot.id}/transitions/extend-option?additional_days=${parseInt(days)}`, {});
                                    toast.success('Option prolongée');
                                    onReload();
                                  } catch (error) {
                                    toast.error(error.message || 'Erreur lors de la prolongation');
                                  }
                                }
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              Prolonger
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )})}
              </tbody>
            </table>
          </div>

          {lots.filter(lot => {
            if (selectedStatuses.length === 0) return true;
            return selectedStatuses.includes(lot.status);
          }).length === 0 && (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.75rem' }}>
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
              <div className="empty-state-title">Aucun lot</div>
              <div className="empty-state-description">Aucun lot ne correspond aux filtres sélectionnés.</div>
            </div>
          )}
        </div>

      </div>

      {/* Sidebar Column */}
      <div className="dashboard-sidebar">
        {/* Clients Pipeline - Seulement pour manager et commercial */}
        {(isManager() || isCommercial()) && (
        <div className="section-card dc-clients-card">
          <div className="section-header dc-clients-header">
            <h3>
              <svg className="dc-clients-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="6" r="3"/><path d="M1 17c0-3.3 2.9-6 6.5-6"/><circle cx="14" cy="7" r="2.5"/><path d="M19 17c0-2.8-2.2-5-5-5s-5 2.2-5 5"/>
              </svg>
              {isCommercial() ? 'Mes Clients' : 'Pipeline clients'}
            </h3>
            <button className="dc-voir-tout-btn" onClick={() => onNavigate && onNavigate('clients')}>
              Voir tout
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 3 9 7 5 11"/>
              </svg>
            </button>
          </div>

          {/* Search bar */}
          <div className="search-bar dc-client-search">
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
            </svg>
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
            />
            {clientSearchQuery && (
              <button className="dc-search-clear" onClick={() => setClientSearchQuery('')}>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>
                </svg>
              </button>
            )}
          </div>

          <div className="client-list">
            {clientsPipeline
              .filter(client => {
                if (!clientSearchQuery) return true;
                const query = clientSearchQuery.toLowerCase();
                return (
                  client.name?.toLowerCase().includes(query) ||
                  client.phone?.includes(query) ||
                  client.email?.toLowerCase().includes(query)
                );
              })
              .slice(0, 8)
              .map((client) => (
              <div
                key={client.id}
                className={`client-card dc-client-row dc-client--${client.pipeline_status || 'prospect'}`}
                onClick={() => onNavigate && onNavigate('clients', client.id)}
              >
                <div className="client-avatar dc-client-avatar">
                  {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                </div>
                <div className="client-info">
                  <div className="client-name">{client.name}</div>
                  <div className="client-details">
                    {client.phone && (
                      <span className="dc-contact-item">
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.5 8.5v1.3a.9.9 0 01-1 .9 8.7 8.7 0 01-3.8-1.4 8.6 8.6 0 01-2.6-2.6A8.7 8.7 0 011.7 2.6.9.9 0 012.6 1.6H4a.9.9 0 01.9.78c.057.43.163.85.315 1.25a.9.9 0 01-.2.95L4.4 5.15a7.2 7.2 0 002.6 2.6l.57-.57a.9.9 0 01.95-.2c.4.153.82.258 1.25.315A.9.9 0 0110.5 8.5z"/>
                        </svg>
                        {client.phone}
                      </span>
                    )}
                    {client.active_reservations > 0 && (
                      <span className="dc-stat-item">{client.active_reservations} réserv.</span>
                    )}
                    {client.total_sales > 0 && (
                      <span className="dc-stat-item">{client.total_sales} achat(s)</span>
                    )}
                    {client.total_deposit > 0 && (
                      <span className="dc-stat-item dc-stat-price">{formatPrice(client.total_deposit)}</span>
                    )}
                  </div>
                </div>
                <span className={`pipeline-badge ${client.pipeline_status}`}>
                  {PIPELINE_LABELS[client.pipeline_status] || client.pipeline_status}
                </span>
              </div>
            ))}
          </div>

          {clientsPipeline.filter(client => {
            if (!clientSearchQuery) return true;
            const query = clientSearchQuery.toLowerCase();
            return (
              client.name?.toLowerCase().includes(query) ||
              client.phone?.includes(query) ||
              client.email?.toLowerCase().includes(query)
            );
          }).length === 0 && (
            <div className="empty-state">
              <svg width="28" height="28" viewBox="0 0 15 15" fill="none" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L13 13"/>
              </svg>
              <div className="empty-state-title">Aucun client trouvé</div>
              {clientSearchQuery && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setClientSearchQuery('')}
                  style={{ marginTop: 'var(--spacing-sm)' }}
                >
                  Effacer la recherche
                </button>
              )}
            </div>
          )}

          {clientsPipeline.length === 0 && !clientSearchQuery && (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                <circle cx="7.5" cy="6" r="3"/><path d="M1 17c0-3.3 2.9-6 6.5-6"/><circle cx="14" cy="7" r="2.5"/><path d="M19 17c0-2.8-2.2-5-5-5s-5 2.2-5 5"/>
              </svg>
              <div className="empty-state-title">Aucun client</div>
              <button className="btn btn-primary btn-sm" onClick={() => onNavigate && onNavigate('clients')}>
                Ajouter un client
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
