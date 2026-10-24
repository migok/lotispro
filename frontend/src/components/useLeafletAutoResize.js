import { useEffect } from 'react';

/**
 * Calls `mapRef.current.invalidateSize()` whenever the observed element changes size,
 * throttled to one call per animation frame. No-op when ResizeObserver is unavailable.
 */
export default function useLeafletAutoResize(mapRef, elementRef) {
  useEffect(() => {
    const element = elementRef?.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        mapRef?.current?.invalidateSize();
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [mapRef, elementRef]);
}
