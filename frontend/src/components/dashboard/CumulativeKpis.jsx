import { Tooltip } from '../ui/tooltip';
import { formatAmount } from '../../utils/formatters';
import { formatNumber } from '../../utils/formatters';

export default function CumulativeKpis({ stats, projectKpis, projectId: propsProjectId, isManager, isCommercial }) {
  return (
    <>
      {/* KPIs cumulés - Uniquement pour les managers avec un projet sélectionné */}
      {isManager() && propsProjectId && projectKpis && (
        <div className="manager-kpis-summary" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="kpis-section-header" style={{ marginBottom: 'var(--spacing-md)' }}>
            <h3>
              <svg className="kpis-section-icon-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="8"/>
                <circle cx="10" cy="10" r="3.5"/>
                <line x1="10" y1="2" x2="10" y2="5.5"/>
                <line x1="10" y1="14.5" x2="10" y2="18"/>
                <line x1="2" y1="10" x2="5.5" y2="10"/>
                <line x1="14.5" y1="10" x2="18" y2="10"/>
              </svg>
              Indicateurs clés — à ce jour
            </h3>
            {projectKpis?.ca_objectif > 0 && (
              <span className="kpis-section-badge" style={{
                background: (projectKpis?.progression_ca || 0) >= 75
                  ? 'color-mix(in srgb, #10b981 18%, var(--bg-surface))'
                  : (projectKpis?.progression_ca || 0) >= 50
                    ? 'color-mix(in srgb, #f59e0b 18%, var(--bg-surface))'
                    : 'color-mix(in srgb, #ef4444 18%, var(--bg-surface))',
                color: (projectKpis?.progression_ca || 0) >= 75 ? '#10b981' : (projectKpis?.progression_ca || 0) >= 50 ? '#f59e0b' : '#ef4444',
                border: `1px solid ${(projectKpis?.progression_ca || 0) >= 75 ? 'rgba(16,185,129,.3)' : (projectKpis?.progression_ca || 0) >= 50 ? 'rgba(245,158,11,.3)' : 'rgba(239,68,68,.3)'}`,
              }}>
                {projectKpis?.progression_ca || 0}% de l'objectif
              </span>
            )}
          </div>

          {/* Hero KPIs Cards */}
          <div className="kpis-hero">
            <div className="kpis-hero-grid kpis-hero-grid-2">
              <div className="kpis-hero-card gradient-success" style={{ '--card-accent': '#10b981' }}>
                <div className="kpis-hero-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div className="kpis-hero-content">
                  <div className="kpis-hero-value"><Tooltip content={formatAmount(projectKpis?.ca_realise)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.ca_realise)}> {formatNumber(projectKpis?.ca_realise, 'MAD')}</span></Tooltip></div>
                  <div className="kpis-hero-label">CA réalisé <Tooltip content="Ventes finalisées + acomptes des réservations validées"><button type="button" className="kpis-info-icon" aria-label="Ventes finalisées + acomptes des réservations validées">ⓘ</button></Tooltip></div>
                  {projectKpis?.ca_objectif > 0 && (
                    <div className="kpis-hero-progress">
                      <div className="kpis-hero-progress-bar">
                        <div
                          className="kpis-hero-progress-fill"
                          style={{ width: `${Math.min(projectKpis?.progression_ca || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="kpis-hero-card gradient-primary" style={{ '--card-accent': '#d4973a' }}>
                <div className="kpis-hero-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4M12 8h.01"/>
                  </svg>
                </div>
                <div className="kpis-hero-content">
                  <div className="kpis-hero-value"><Tooltip content={formatAmount(projectKpis?.ca_potentiel)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.ca_potentiel)}> {formatNumber(projectKpis?.ca_potentiel, 'MAD')}</span></Tooltip></div>
                  <div className="kpis-hero-label">CA Potentiel <Tooltip content="Valeur totale des lots avec réservation active — non encore convertis en vente"><button type="button" className="kpis-info-icon" aria-label="Valeur totale des lots avec réservation active — non encore convertis en vente">ⓘ</button></Tooltip></div>
                  <div className="kpis-hero-subtitle">Lots réservés</div>
                </div>
              </div>
            </div>
          </div>

          {/* Métriques additionnelles pour décision */}
          <div className="kpis-decision-metrics">
            <div>
              <div><Tooltip content={formatAmount(projectKpis?.prix_moyen_lot)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.prix_moyen_lot)}> {formatNumber(projectKpis?.prix_moyen_lot, 'MAD')}</span></Tooltip></div>
              <div>Prix moyen / lot <Tooltip content="Prix moyen de vente par lot sur ce projet"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Prix moyen de vente par lot sur ce projet">ⓘ</button></Tooltip></div>
            </div>
            <div>
              <div><Tooltip content={formatAmount(projectKpis?.prix_moyen_m2)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.prix_moyen_m2)}> {formatNumber(projectKpis?.prix_moyen_m2, 'MAD')}</span></Tooltip></div>
              <div>Prix Moyen / m² <Tooltip content="Prix moyen au m² calculé sur les ventes réalisées"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Prix moyen au m² calculé sur les ventes réalisées">ⓘ</button></Tooltip></div>
            </div>
            <div>
              <div><Tooltip content={formatAmount(projectKpis?.total_deposits)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.total_deposits)}> {formatNumber(projectKpis?.total_deposits, 'MAD')}</span></Tooltip></div>
              <div>Total Acomptes <Tooltip content="Somme des acomptes perçus sur les réservations validées (non encore vendues)"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Somme des acomptes perçus sur les réservations validées (non encore vendues)">ⓘ</button></Tooltip></div>
            </div>
            <div>
              <div><Tooltip content={formatAmount(projectKpis?.ca_objectif)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(projectKpis?.ca_objectif)}> {formatNumber(projectKpis?.ca_objectif, 'MAD')}</span></Tooltip></div>
              <div>CA Objectif <Tooltip content="Objectif de chiffre d'affaires défini pour ce projet — sert à calculer le taux de progression"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Objectif de chiffre d'affaires défini pour ce projet — sert à calculer le taux de progression">ⓘ</button></Tooltip></div>
            </div>
          </div>
        </div>
      )}

      {/* Performance financière - Masquer si les indicateurs clés sont affichés */}
      {!(isManager() && propsProjectId && projectKpis) && (
      <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="kpis-section-header">
          <h3>
            <svg className="kpis-section-icon-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v2M10 16v2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M2 10h2M16 10h2M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/>
              <circle cx="10" cy="10" r="4"/>
            </svg>
            {isCommercial() ? 'Ma performance — à ce jour' : 'Performance financière — à ce jour'}
          </h3>
          <span className="kpis-section-badge">
            <Tooltip content={formatAmount(stats?.ca_total)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(stats?.ca_total)}> {formatNumber(stats?.ca_total, 'MAD')}</span></Tooltip> total
            <Tooltip content="Valeur totale du portefeuille — somme des prix de tous les lots (vendus, réservés, disponibles, bloqués)"><button type="button" className="kpis-info-icon" aria-label="Valeur totale du portefeuille — somme des prix de tous les lots (vendus, réservés, disponibles, bloqués)">ⓘ</button></Tooltip>
          </span>
        </div>

        <div className="kpis-stock-grid">
          <div className="kpis-stock-card sold">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle sold"
                  strokeDasharray={`${stats?.ca_total ? ((stats?.ca_realise || 0) / stats.ca_total * 100).toFixed(2) : 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.ca_total ? ((stats?.ca_realise || 0) / stats.ca_total * 100).toFixed(2) : '0.00'}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value"><Tooltip content={formatAmount(stats?.ca_realise)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(stats?.ca_realise)}> {formatNumber(stats?.ca_realise, 'MAD')}</span></Tooltip></div>
              <div className="kpis-stock-label">
                {isCommercial() ? 'Mon CA réalisé' : 'CA réalisé'}
                <Tooltip content="Somme des lots vendus"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Somme des lots vendus">ⓘ</button></Tooltip>
              </div>
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
                  strokeDasharray={`${stats?.ca_total ? ((stats?.ca_potentiel || 0) / stats.ca_total * 100).toFixed(2) : 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.ca_total ? ((stats?.ca_potentiel || 0) / stats.ca_total * 100).toFixed(2) : '0.00'}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value"><Tooltip content={formatAmount(stats?.ca_potentiel)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(stats?.ca_potentiel)}> {formatNumber(stats?.ca_potentiel, 'MAD')}</span></Tooltip></div>
              <div className="kpis-stock-label">
                CA Potentiel
                <Tooltip content="Valeur des lots réservés"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Valeur des lots réservés">ⓘ</button></Tooltip>
              </div>
            </div>
          </div>

          <div className="kpis-stock-card available">
            <div className="kpis-stock-visual">
              <div className="kpis-financial-icon">📈</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{isCommercial() ? (stats?.taux_transformation || 0) : (stats?.taux_vente || 0)}%</div>
              <div className="kpis-stock-label">
                {isCommercial() ? 'Taux transformation' : 'Taux de vente'}
                <span className="kpis-info-icon kpis-info-icon-dark" title={isCommercial() ? 'Réservations converties en ventes' : 'Lots vendus / Total lots'}>ⓘ</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
