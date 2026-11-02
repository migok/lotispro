import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variants = cva('ui-button', {
  variants: {
    variant: { default: 'ui-button--primary', secondary: 'ui-button--secondary', outline: 'ui-button--outline', ghost: 'ui-button--ghost', danger: 'ui-button--danger' },
    size: { default: '', sm: 'ui-button--sm', icon: 'ui-button--icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export function Button({ className, variant, size, asChild = false, loading = false, disabled = false, children, type = 'button', ...props }) {
  const Component = asChild ? Slot : 'button';
  const inactive = disabled || loading;
  return <Component {...props} type={asChild ? undefined : type} className={cn(variants({ variant, size }), className)}
    disabled={asChild ? undefined : inactive} aria-disabled={asChild && inactive ? true : undefined}
    tabIndex={asChild && inactive ? -1 : props.tabIndex} aria-busy={loading || undefined}
    onClickCapture={asChild && inactive ? (event) => { event.preventDefault(); event.stopPropagation(); } : props.onClickCapture}>
    {children}
  </Component>;
}
