import { cn } from '@/lib/utils';

export function EmptyState({ title = 'Aucun résultat', description, action, className, ...props }) {
  return <div className={cn('ui-empty-state', className)} {...props}>
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action}
  </div>;
}
