import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }) {
  return <div {...props} className={cn('ui-skeleton', className)} data-slot="skeleton" aria-hidden="true" />;
}
export function LoadingSkeleton({ label = 'Chargement en cours', rows = 3, className }) {
  return <div role="status" aria-busy="true" className={cn('ui-loading-skeleton', className)}>
    <span className="ui-sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} />)}
  </div>;
}
