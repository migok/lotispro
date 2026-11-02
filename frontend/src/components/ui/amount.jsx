import { formatAmount } from '../../utils/formatters';
import { cn } from '../../lib/utils';
import { Tooltip } from './tooltip';

export function Amount({ value, compact = true, className, label }) {
  const exact = formatAmount(value);
  return <Tooltip content={exact}><button type="button" className={cn('ui-amount-trigger ui-amount', className)} aria-label={label ? `${label} : ${exact}` : exact}>{formatAmount(value, { compact })}</button></Tooltip>;
}
