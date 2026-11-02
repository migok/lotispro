import { Tooltip } from '../ui/tooltip';
export default function LotStockSection({ stats, isCommercial }) {
  return (
    <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <div className="kpis-section-header">
        <h3>
          <svg className="kpis-section-icon-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6l8-4 8 4v8l-8 4-8-4V6z"/>
            <path d="M10 2v16M2 6l8 4 8-4"/>
          </svg>
          Stock de Lots
        </h3>
        <span className="kpis-section-badge">{stats?.counts?.total || 0} lots</span>
      </div>

      <div className="kpis-stock-grid">
        <div className="kpis-stock-card available">
          <div className="kpis-stock-visual">
            <svg viewBox="0 0 36 36" className="kpis-circular-chart">
              <path
                className="kpis-circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="kpis-circle available"
                strokeDasharray={`${stats?.percentages?.available || 0}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="kpis-stock-percent">{stats?.percentages?.available || 0}%</div>
          </div>
          <div className="kpis-stock-info">
            <div className="kpis-stock-value">{stats?.counts?.available || 0}</div>
            <div className="kpis-stock-label">
              Disponibles
              <Tooltip content="Lots prêts à la vente"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Lots prêts à la vente">ⓘ</button></Tooltip>
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
                strokeDasharray={`${stats?.percentages?.en_cours || 0}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="kpis-stock-percent">{stats?.percentages?.en_cours || 0}%</div>
          </div>
          <div className="kpis-stock-info">
            <div className="kpis-stock-value">{stats?.counts?.en_cours || 0}</div>
            <div className="kpis-stock-label">
              {isCommercial() ? 'Pipeline actif' : 'En cours'}
              <Tooltip content="Lots avec option/réservation active"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Lots avec option/réservation active">ⓘ</button></Tooltip>
            </div>
          </div>
        </div>

        <div className="kpis-stock-card sold">
          <div className="kpis-stock-visual">
            <svg viewBox="0 0 36 36" className="kpis-circular-chart">
              <path
                className="kpis-circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="kpis-circle sold"
                strokeDasharray={`${stats?.percentages?.chez_proprietaire || 0}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="kpis-stock-percent">{stats?.percentages?.chez_proprietaire || 0}%</div>
          </div>
          <div className="kpis-stock-info">
            <div className="kpis-stock-value">{stats?.counts?.chez_proprietaire || 0}</div>
            <div className="kpis-stock-label">
              {isCommercial() ? 'Mes ventes' : 'Chez propriétaire'}
              <Tooltip content="Lots transférés chez le propriétaire"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Lots transférés chez le propriétaire">ⓘ</button></Tooltip>
            </div>
          </div>
        </div>

        {(stats?.counts?.blocked > 0 || !isCommercial()) && (
          <div className="kpis-stock-card blocked">
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="kpis-circle blocked"
                  strokeDasharray={`${stats?.percentages?.blocked || 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="kpis-stock-percent">{stats?.percentages?.blocked || 0}%</div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value">{stats?.counts?.blocked || 0}</div>
              <div className="kpis-stock-label">
                Bloqués
                <Tooltip content="Lots temporairement indisponibles"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Lots temporairement indisponibles">ⓘ</button></Tooltip>
              </div>
            </div>
          </div>
        )}

        {(stats?.lots_liberes > 0 || !isCommercial()) && (
          <div className="kpis-stock-card" style={{ '--stock-accent': 'var(--text-muted)', '--stock-circle': '#a78bfa' }}>
            <div className="kpis-stock-visual">
              <svg viewBox="0 0 36 36" className="kpis-circular-chart">
                <path
                  className="kpis-circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  style={{ stroke: '#a78bfa' }}
                  strokeDasharray={`${stats?.counts?.total ? Math.round((stats.lots_liberes / stats.counts.total) * 100) : 0}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" strokeWidth="2.8" strokeLinecap="round"
                />
              </svg>
              <div className="kpis-stock-percent" style={{ color: '#a78bfa' }}>
                {stats?.counts?.total ? Math.round((stats.lots_liberes / stats.counts.total) * 100) : 0}%
              </div>
            </div>
            <div className="kpis-stock-info">
              <div className="kpis-stock-value" style={{ color: '#a78bfa' }}>{stats?.lots_liberes || 0}</div>
              <div className="kpis-stock-label">
                Libérés
                <Tooltip content="Réservations annulées ou expirées — lots remis en disponible"><button type="button" className="kpis-info-icon kpis-info-icon-dark" aria-label="Réservations annulées ou expirées — lots remis en disponible">ⓘ</button></Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
