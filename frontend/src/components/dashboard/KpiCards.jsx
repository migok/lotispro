import { formatNumber } from '../../utils/formatters';
import {
  formatFlowUnavailableNotice,
  formatIsoDate,
  formatPercentNumber,
  formatVariation,
} from './period';

const FLOW_CARDS = [
  {
    key: 'lots_vendus',
    label: 'Lots vendus',
    tooltip: 'Réservations engagées sur la période',
    format: (v) => String(v ?? 0),
    needsHistory: true,
  },
  {
    key: 'ca',
    label: 'CA',
    tooltip: 'Prix total convenu des réservations engagées sur la période',
    format: (v) => formatNumber(v, 'MAD'),
    needsHistory: true,
  },
  {
    key: 'reservations_creees',
    label: 'Réservations créées',
    tooltip: 'Réservations créées sur la période, toutes étapes',
    format: (v) => String(v ?? 0),
    needsHistory: false,
  },
  {
    key: 'taux_conversion',
    label: 'Taux de conversion',
    tooltip: 'Lots vendus ÷ réservations créées sur la même période (peut dépasser 100 %)',
    format: (v) => `${formatPercentNumber(v ?? 0)} %`,
    needsHistory: true,
  },
  {
    key: 'encaissements',
    label: 'Encaissements',
    tooltip: "Sommes reçues sur la période (versements à l'engagement et échéances)",
    format: (v) => formatNumber(v, 'MAD'),
    needsHistory: false,
  },
];

const SKELETON_COUNT = FLOW_CARDS.length + 2;

function Label({ text, tooltip }) {
  return (
    <div className="kpis-stock-label">
      <span>{text}</span>
      {tooltip && <span className="kpis-info-icon kpis-info-icon-dark" title={tooltip}>ⓘ</span>}
    </div>
  );
}

/** Flow KPIs of the period with their variation, and lot state at the end of the period. */
export default function KpiCards({ stats, loading }) {
  if (loading) {
    return (
      <div className="period-kpis-grid" aria-busy="true">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className="kpis-stock-card period-kpi-card is-skeleton" aria-hidden="true">
            <span className="period-skeleton-line wide" />
            <span className="period-skeleton-line" />
            <span className="period-skeleton-line short" />
          </div>
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const flow = stats.flow || {};
  const variations = stats.variations || {};
  const historyStart = formatIsoDate(stats.history_start);
  const stateDate = formatIsoDate(stats.period?.date_to);
  const flowNotice = formatFlowUnavailableNotice(stats.history_start);
  const stateNotice = `Situation des lots disponible à partir du ${historyStart}`;

  return (
    <div className="period-kpis-grid">
      {FLOW_CARDS.map((card) => {
        const unavailable = card.needsHistory && stats.flow_kpis_available === false;
        const variation = formatVariation(variations[card.key]);
        return (
          <div key={card.key} className="kpis-stock-card period-kpi-card flow">
            <Label text={card.label} tooltip={card.tooltip} />
            {unavailable ? (
              <div className="period-kpi-notice">{flowNotice}</div>
            ) : (
              <>
                <div className="kpis-stock-value">{card.format(flow[card.key])}</div>
                <div className="period-kpi-variation">
                  <span className={`period-kpi-trend${variation.trend ? ` ${variation.trend}` : ''}`}>
                    {variation.text}
                  </span>
                  <span>vs période précédente</span>
                </div>
              </>
            )}
          </div>
        );
      })}

      {[
        { key: 'available', label: `Disponibles au ${stateDate}`, className: 'available' },
        { key: 'option', label: `En option au ${stateDate}`, className: 'reserved' },
      ].map((card) => (
        <div key={card.key} className={`kpis-stock-card period-kpi-card ${card.className}`}>
          <Label text={card.label} />
          {stats.state_kpis_available === false ? (
            <div className="period-kpi-notice">{stateNotice}</div>
          ) : (
            <div className="kpis-stock-value">{stats.state?.[card.key] ?? 0}</div>
          )}
        </div>
      ))}
    </div>
  );
}
