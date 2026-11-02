import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { cn } from '@/lib/utils';

export function Sheet(props) { return <Dialog {...props} />; }
export function SheetTrigger(props) { return <DialogTrigger {...props} />; }
export function SheetContent({ className, ...props }) { return <DialogContent className={cn('ui-sheet', className)} {...props} />; }
export function SheetTitle(props) { return <DialogTitle {...props} />; }
export function SheetDescription(props) { return <DialogDescription {...props} />; }
