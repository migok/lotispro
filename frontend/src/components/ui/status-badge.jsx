import { STATUS_COLORS, STATUS_LABELS } from '@/utils/constants';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className, style, ...props }) {
  return <span {...props} className={cn('ui-status-badge', className)} data-status={status}
    style={{ ...style, '--badge-color': STATUS_COLORS[status] || 'var(--text-muted)' }}>
    <span aria-hidden="true" className="ui-status-dot" />
    {STATUS_LABELS[status] || 'Statut inconnu'}
  </span>;
}
