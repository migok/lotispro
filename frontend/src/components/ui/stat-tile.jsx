import { formatAmount } from '@/utils/formatters';
import { Card } from './card';
import { Skeleton } from './skeleton';
import { Tooltip } from './tooltip';

export function StatTile({ label, value, currency = false, compact = true, description, baseline, loading = false }) {
  const exact = currency ? formatAmount(value) : value == null ? '—' : String(value);
  const display = currency ? formatAmount(value, { compact }) : exact;
  return <Card className="ui-stat-tile" aria-busy={loading || undefined}>
    <div className="ui-stat-label">{label}</div>
    {loading ? <Skeleton className="ui-stat-placeholder" /> :
      <Tooltip content={<>{exact}{description && <><br />{description}</>}</>}>
        <button type="button" className="ui-stat-value" aria-label={`${label} : ${exact}`}>{display}</button>
      </Tooltip>}
    {baseline && <div className="ui-stat-baseline">{baseline}</div>}
  </Card>;
}
