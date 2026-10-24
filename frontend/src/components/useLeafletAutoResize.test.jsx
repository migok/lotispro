import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useLeafletAutoResize from './useLeafletAutoResize';

describe('useLeafletAutoResize', () => {
  let callback;
  let disconnect;
  let rafCallbacks;

  beforeEach(() => {
    rafCallbacks = new Map();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      id += 1;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (i) => rafCallbacks.delete(i));
    disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb) {
          callback = cb;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const flushFrame = () => {
    const pending = [...rafCallbacks.values()];
    rafCallbacks.clear();
    pending.forEach((cb) => cb());
  };

  it('calls invalidateSize once per animation frame', () => {
    const invalidateSize = vi.fn();
    const mapRef = { current: { invalidateSize } };
    renderHook(() => useLeafletAutoResize(mapRef, { current: document.createElement('div') }));

    callback();
    callback();
    callback();
    expect(invalidateSize).not.toHaveBeenCalled();
    flushFrame();
    expect(invalidateSize).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing map', () => {
    const mapRef = { current: null };
    renderHook(() => useLeafletAutoResize(mapRef, { current: document.createElement('div') }));
    callback();
    expect(() => flushFrame()).not.toThrow();
  });

  it('disconnects and cancels pending frame on unmount', () => {
    const invalidateSize = vi.fn();
    const mapRef = { current: { invalidateSize } };
    const { unmount } = renderHook(() =>
      useLeafletAutoResize(mapRef, { current: document.createElement('div') })
    );
    callback();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    flushFrame();
    expect(invalidateSize).not.toHaveBeenCalled();
  });

  it('does not throw without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const mapRef = { current: { invalidateSize: vi.fn() } };
    expect(() =>
      renderHook(() => useLeafletAutoResize(mapRef, { current: document.createElement('div') }))
    ).not.toThrow();
  });
});
