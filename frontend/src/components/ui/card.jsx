import { cn } from '@/lib/utils';

export function Card({ as = 'section', className, ...props }) {
  const Component = as;
  return <Component className={cn('ui-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }) {
  return <header className={cn('ui-card-header', className)} {...props} />;
}
export function CardTitle({ as = 'h2', className, ...props }) {
  const Component = as;
  return <Component className={cn('ui-card-title', className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn('ui-card-content', className)} {...props} />;
}
export function CardFooter({ className, ...props }) {
  return <footer className={cn('ui-card-footer', className)} {...props} />;
}
