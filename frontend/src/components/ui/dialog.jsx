import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Dialog(props) { return <DialogPrimitive.Root {...props} />; }
export function DialogTrigger(props) { return <DialogPrimitive.Trigger {...props} />; }
export function DialogClose(props) { return <DialogPrimitive.Close {...props} />; }
export function DialogTitle({ className, ...props }) { return <DialogPrimitive.Title className={cn('ui-dialog-title', className)} {...props} />; }
export function DialogDescription({ className, ...props }) { return <DialogPrimitive.Description className={cn('ui-dialog-description', className)} {...props} />; }
export function DialogContent({ children, className, ...props }) {
  return <DialogPrimitive.Portal container={document.fullscreenElement || undefined}>
    <DialogPrimitive.Overlay className="ui-overlay" />
    <DialogPrimitive.Content className={cn('ui-dialog', className)} {...props}>
      {children}
      <DialogPrimitive.Close asChild><Button className="ui-dialog-close" variant="ghost" size="icon" aria-label="Fermer">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 3 10 10M13 3 3 13" /></svg>
      </Button></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}
export function DialogHeader({ className, ...props }) { return <div className={cn('ui-dialog-header', className)} {...props} />; }
export function DialogFooter({ className, ...props }) { return <div className={cn('ui-dialog-footer', className)} {...props} />; }
