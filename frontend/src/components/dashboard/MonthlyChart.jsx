import { useState } from 'react';
import { formatPrice } from '../../utils/formatters';
import { bucketLabel, formatFlowUnavailableNotice } from './period';

const TITLE = 'Évolution sur la période';
// Beyond this many buckets (e.g. 31 days) only every n-th label is printed.
const MAX_LABELS = 16;
const SKELETON_BARS = [45, 70, 30, 85, 55, 65, 40, 75, 50, 60, 35, 80];

function Header({ children }) {
  return (
    <div className="kpis-section-header">
      <h3>
        <span className="kpis-section-icon">📈</span>
        {TITLE}
      </h3>
      {children}
    </div>
  );
}

/**
 * Bar chart of the period series (`performance.series`): « Vendus » = lots sold,
 * « Réservés » = reservations created, « Montant » mode = CA. One bar group per
 * day, ISO week or month depending on the period length.
 *
 * When `flowKpisAvailable === false` (period starting before `historyStart`),
 * sales and CA are unknown, as on the KPI cards: a notice replaces them, only
 * the « Réservés » bars are drawn and « Montant » mode shows no bars.
 */
export default function MonthlyChart({ performance, loading, flowKpisAvailable, historyStart }) {
  const [hovered, setHovered] = useState(null);
  const [chartMode, setChartMode] = useState('nombre'); // 'nombre' | 'montant'

  if (loading) {
    return (
      <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }} aria-busy="true">
        <Header />
        <div className="monthly-chart-body period-chart-skeleton" aria-hidden="true">
          {SKELETON_BARS.map((h, i) => (
            <span key={i} className="period-skeleton-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    );
  }
  if (!performance) return null;

  const salesAvailable = flowKpisAvailable !== false;
  const notice = salesAvailable ? null : (
    <p className="period-chart-notice">{formatFlowUnavailableNotice(historyStart)}</p>
  );
  const series = performance.series || [];
  const hasData = series.some(
    (b) => b.reservations_creees || (salesAvailable && (b.lots_vendus || b.ca)),
  );
  if (!hasData) {
    return (
      <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <Header />
        {notice}
        <p className="period-chart-empty">Aucune donnée sur la période</p>
      </div>
    );
  }

  // Without sales history, « Montant » mode has nothing to draw: the notice stands alone.
  const showBars = salesAvailable || chartMode === 'nombre';
  const maxVal = chartMode === 'nombre'
    ? Math.max(1, ...series.flatMap((b) => (salesAvailable
      ? [b.lots_vendus, b.reservations_creees]
      : [b.reservations_creees])))
    : Math.max(1, ...series.map((b) => b.ca));
  const totalSold = series.reduce((s, b) => s + b.lots_vendus, 0);
  const totalReserved = series.reduce((s, b) => s + b.reservations_creees, 0);
  const totalCA = series.reduce((s, b) => s + b.ca, 0);
  const dense = series.length > MAX_LABELS;
  const labelStep = Math.ceil(series.length / MAX_LABELS);
  const fmtGridVal = (val) => {
    if (chartMode === 'nombre') return Math.round(val);
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${Math.round(val / 1000)}k`;
    return Math.round(val).toString();
  };

  return (
    <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <Header>
        <div className="chart-header-right">
          <div className="chart-mode-toggle">
            <button
              type="button"
              className={`chart-mode-btn${chartMode === 'nombre' ? ' active' : ''}`}
              onClick={() => setChartMode('nombre')}
            >
              # Nombre
            </button>
            <button
              type="button"
              className={`chart-mode-btn${chartMode === 'montant' ? ' active' : ''}`}
              onClick={() => setChartMode('montant')}
            >
              ₊ Montant
            </button>
          </div>
          <div className="monthly-kpi-row">
            {salesAvailable && (
              <>
                <div className="monthly-kpi">
                  <span className="monthly-kpi-num num">{totalSold}</span>
                  <span className="monthly-kpi-label">Vendus</span>
                </div>
                <div className="monthly-kpi-sep"/>
              </>
            )}
            <div className="monthly-kpi">
              <span className="monthly-kpi-num num">{totalReserved}</span>
              <span className="monthly-kpi-label">Réservés</span>
            </div>
            {salesAvailable && (
              <>
                <div className="monthly-kpi-sep"/>
                <div className="monthly-kpi accent">
                  <span className="monthly-kpi-num num">{formatPrice(totalCA)}</span>
                  <span className="monthly-kpi-label">CA total</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Header>

      {notice}
      {showBars && (
        <div className="monthly-chart-body" style={{ padding: '0 var(--spacing-lg) var(--spacing-sm)' }}>
          <div className={`monthly-chart-bars${dense ? ' is-dense' : ''}`}>
            {series.map((bucket, idx) => {
              const barH = chartMode === 'nombre'
                ? (bucket.lots_vendus / maxVal) * 100
                : (bucket.ca / maxVal) * 100;
              const resH = chartMode === 'nombre' ? (bucket.reservations_creees / maxVal) * 100 : 0;
              const isHovered = hovered === idx;
              const label = bucketLabel(bucket.key);
              return (
                <div
                  key={bucket.key}
                  className={`chart-month-group${isHovered ? ' hovered' : ''}`}
                  onMouseEnter={() => setHovered(idx)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="chart-bars-group">
                    {chartMode === 'nombre' ? (
                      <>
                        {salesAvailable && <div className="chart-bar sold" style={{ height: `${barH}%` }}/>}
                        <div className="chart-bar reserved" style={{ height: `${resH}%` }}/>
                      </>
                    ) : (
                      <div className="chart-bar amount" style={{ height: `${barH}%` }}/>
                    )}
                  </div>
                  <div className="chart-month-label">{idx % labelStep === 0 || isHovered ? label : ''}</div>
                  {!dense && salesAvailable && chartMode === 'nombre' && bucket.ca > 0 && (
                    <div className="chart-month-amount num">{formatPrice(bucket.ca)}</div>
                  )}
                  {isHovered && (
                    <div className="chart-tooltip">
                      <div className="chart-tooltip-period">{label}</div>
                      {chartMode === 'nombre' ? (
                        <>
                          {salesAvailable && (
                            <div className="chart-tooltip-row">
                              <span className="chart-tooltip-dot sold"/>
                              <span>{bucket.lots_vendus} vendu{bucket.lots_vendus > 1 ? 's' : ''}</span>
                            </div>
                          )}
                          <div className="chart-tooltip-row">
                            <span className="chart-tooltip-dot reserved"/>
                            <span>{bucket.reservations_creees} réservé{bucket.reservations_creees > 1 ? 's' : ''}</span>
                          </div>
                          {salesAvailable && bucket.ca > 0 && (
                            <div className="chart-tooltip-ca">{formatPrice(bucket.ca)}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="chart-tooltip-row">
                            <span className="chart-tooltip-dot" style={{ background: 'var(--color-primary)' }}/>
                            <span>CA</span>
                          </div>
                          <div className="chart-tooltip-ca">{formatPrice(bucket.ca)}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="chart-grid-lines">
            {[100, 75, 50, 25].map((p) => (
              <div key={p} className="chart-grid-line" style={{ bottom: `${p}%` }}>
                <span className="chart-grid-label">{fmtGridVal(maxVal * p / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showBars && (
        <div className="chart-legend" style={{ padding: '0 var(--spacing-lg) var(--spacing-md)' }}>
          {salesAvailable && <span className="legend-item"><span className="legend-dot sold"/>Vendus</span>}
          <span className="legend-item"><span className="legend-dot reserved"/>Réservés</span>
        </div>
      )}
    </div>
  );
}
