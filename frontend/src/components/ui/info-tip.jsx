import { cn } from '../../lib/utils';
import { Tooltip } from './tooltip';
export function InfoTip({ text, className }) {
  return <Tooltip content={text}><button type="button" className={cn('kpis-info-icon', className)} aria-label={text}>ⓘ</button></Tooltip>;
}
