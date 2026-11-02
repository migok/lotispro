import { useEffect, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/** Informational triggers open on hover, focus and tap; never rely on a native title. */
export function Tooltip({ content, children, delayDuration = 200 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [open]);
  return <TooltipPrimitive.Provider delayDuration={delayDuration}>
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild onClick={(event) => {
        // Preserve navigation when a link is the trigger. Informational buttons/spans support tap.
        if (event.currentTarget.tagName === 'A') return;
        event.preventDefault();
        setOpen(true);
      }}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={document.fullscreenElement || undefined}>
        <TooltipPrimitive.Content className="ui-tooltip" sideOffset={6} collisionPadding={12}>
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}
