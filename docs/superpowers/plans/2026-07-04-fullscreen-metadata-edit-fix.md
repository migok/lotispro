# Fullscreen Metadata Edit Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make metadata editing (individual and bulk) fully usable in the Carte tab's fullscreen mode by fixing two independent bugs: toast feedback rendered outside the fullscreen DOM subtree (invisible to the user), and the bulk-edit panel overflowing the fixed-height fullscreen container with no scroll fallback.

**Architecture:** `ToastProvider` gains a `fullscreenchange`-driven portal target so `ToastContainer` always renders inside whichever element is currently the browser's fullscreen element (or `document.body` otherwise). Independently, `.carte-map-container` switches from a hardcoded `calc()` height to a flexible `flex: 1; min-height: 0` sizing so it shares space with whatever sibling panels (filters, selection bar, bulk-edit panel) are visible, with `overflow-y: auto` on `.carte-fullscreen` as a safety net, plus an `invalidateSize()` trigger so Leaflet repaints when the container's height changes.

**Tech Stack:** React 19, Vite, plain CSS (`styles.css`), Leaflet (via `mapRef`). No test framework exists in this frontend (`frontend/package.json` has no Jest/Vitest/RTL) — verification is `npm run lint` plus explicit manual browser checks.

## Global Constraints

- No frontend automated test framework exists in this repo — do not introduce one; verification is `npm run lint` + manual browser steps, per each task.
- Non-fullscreen (normal page) behavior must not change at all — every task includes a check that mode is untouched.
- Only one fullscreen element exists in the app today (`carteTabRef` in `ProjectDetailPage.jsx`) — do not build multi-target abstractions beyond what's needed for a single dynamic target.
- Follow existing code style: no comments unless explaining a non-obvious WHY, French UI strings unchanged, no new dependencies.

---

### Task 1: Portal ToastContainer into the active fullscreen element

**Files:**
- Modify: `frontend/src/contexts/ToastContext.jsx` (full file, 85 lines)

**Interfaces:**
- Consumes: nothing new — `document.fullscreenElement` (browser API), `createPortal` from `react-dom` (already a project dependency via `react-dom`).
- Produces: no change to the public `useToast()` API (`addToast`, `removeToast`, `success`, `error`, `warning`, `info`) — later tasks and existing call sites are unaffected.

- [ ] **Step 1: Read the current file to confirm no drift**

Run: view `frontend/src/contexts/ToastContext.jsx` and confirm it matches this current content (imports, `ToastProvider`, `ToastContainer`, `getToastIcon`):

```jsx
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message, duration) => addToast(message, 'success', duration), [addToast]);
  const error = useCallback((message, duration) => addToast(message, 'error', duration), [addToast]);
  const warning = useCallback((message, duration) => addToast(message, 'warning', duration), [addToast]);
  const info = useCallback((message, duration) => addToast(message, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role="alert"
        >
          <div className="toast-content">
            <span className="toast-icon">{getToastIcon(toast.type)}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
          <button
            className="toast-close"
            onClick={() => onClose(toast.id)}
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

const getToastIcon = (type) => {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return 'ℹ️';
  }
};
```

If it differs, stop and reconcile before continuing — the exact replacement in Step 2 assumes this content.

- [ ] **Step 2: Replace the whole file with the portal-aware version**

Replace the entire content of `frontend/src/contexts/ToastContext.jsx` with:

```jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [fullscreenTarget, setFullscreenTarget] = useState(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreenTarget(document.fullscreenElement || null);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message, duration) => addToast(message, 'success', duration), [addToast]);
  const error = useCallback((message, duration) => addToast(message, 'error', duration), [addToast]);
  const warning = useCallback((message, duration) => addToast(message, 'warning', duration), [addToast]);
  const info = useCallback((message, duration) => addToast(message, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      {createPortal(
        <ToastContainer toasts={toasts} onClose={removeToast} />,
        fullscreenTarget || document.body
      )}
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role="alert"
        >
          <div className="toast-content">
            <span className="toast-icon">{getToastIcon(toast.type)}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
          <button
            className="toast-close"
            onClick={() => onClose(toast.id)}
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

const getToastIcon = (type) => {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return 'ℹ️';
  }
};
```

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors/warnings introduced by this file (pre-existing unrelated warnings elsewhere are fine).

- [ ] **Step 4: Manual verification — toast visible in fullscreen**

Run: `cd frontend && npm run dev`, open the app, log in, open any project, go to the "Carte" tab.
1. Click the fullscreen button (or double-click the map) to enter fullscreen.
2. Enable selection mode, select at least one lot, click "Modifier", leave all fields empty, click "Appliquer aux N lots" (or open a single lot in `complete_lot` mode and submit without `price_per_sqm`/`surface`).
3. Expected: a warning/error toast appears **visibly inside the fullscreen view**, top-right, on top of the map.
4. Exit fullscreen (Échap). Trigger another toast (e.g. any successful save elsewhere). Expected: toast still appears normally in the top-right of the page — no regression.

- [ ] **Step 5: Commit**

```bash
cd "lot_webapp" && git add frontend/src/contexts/ToastContext.jsx
git commit -m "fix: portal toast notifications into the active fullscreen element

Toasts were rendered at the app root, outside the fullscreen element's
DOM subtree, so the browser's Fullscreen API silently hid all
success/error/warning feedback while the Carte tab was in fullscreen."
```

---

### Task 2: Make the map container flexible so panels don't overflow fullscreen

**Files:**
- Modify: `frontend/src/styles.css:856-890` (the `Carte Fullscreen` block)
- Modify: `frontend/src/components/ProjectDetailPage.jsx:1114-1126` (carte-map-container inline style)
- Modify: `frontend/src/components/ProjectDetailPage.jsx` (add a new `useEffect` after the existing `showFilters` effect, currently at lines 750-758)

**Interfaces:**
- Consumes: existing `isFullscreen`, `selectionMode`, `showBulkEdit`, `mapRef` from `CarteTab` (all already defined in the component, no new props).
- Produces: no new exports — purely internal layout/CSS behavior.

- [ ] **Step 1: Fix the CSS — flexible map height, correct selector, scroll safety net**

In `frontend/src/styles.css`, find this block (around line 856):

```css
/* Carte Fullscreen */
.carte-tab {
  transition: all 0.3s ease;
}

.carte-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: var(--bg-primary);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
}

.carte-fullscreen .carte-filters {
  flex-shrink: 0;
}

.carte-fullscreen .carte-map-container {
  /* Height is controlled by the inline style (calc(100vh - Xpx)) — do NOT override it */
}

/* Styles pour le fullscreen natif du navigateur */
.carte-tab:fullscreen {
  background: var(--bg-primary);
  padding: var(--spacing-md);
}

.carte-tab:fullscreen .carte-map-container {
  /* Height is controlled by the inline style — do NOT override it */
}
```

Replace it with:

```css
/* Carte Fullscreen */
.carte-tab {
  transition: all 0.3s ease;
}

.carte-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: var(--bg-primary);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.carte-fullscreen .map-filters-v2 {
  flex-shrink: 0;
}

.carte-fullscreen .carte-map-container {
  /* Flexible: fills whatever space remains after filters, selection bar and bulk-edit panel */
  flex: 1;
  min-height: 0;
}

/* Styles pour le fullscreen natif du navigateur */
.carte-tab:fullscreen {
  background: var(--bg-primary);
  padding: var(--spacing-md);
}

.carte-tab:fullscreen .carte-map-container {
  flex: 1;
  min-height: 0;
}
```

(The old `.carte-fullscreen .carte-filters` selector never matched anything — the JSX class is `map-filters-v2` — so it's being corrected, not just renamed for style.)

- [ ] **Step 2: Make the inline height/minHeight conditional in JSX**

In `frontend/src/components/ProjectDetailPage.jsx`, find (around line 1114-1126):

```jsx
      {/* Map Container */}
      <div style={{ position: 'relative' }}>
        <div
          className="section-card carte-map-container"
          style={{
            padding: 0,
            overflow: 'hidden',
            height: isFullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 300px)',
            minHeight: 500
          }}
        >
```

Replace the inner `style={{...}}` with:

```jsx
      {/* Map Container */}
      <div style={{ position: 'relative' }}>
        <div
          className="section-card carte-map-container"
          style={{
            padding: 0,
            overflow: 'hidden',
            height: isFullscreen ? undefined : 'calc(100vh - 300px)',
            minHeight: isFullscreen ? 0 : 500
          }}
        >
```

This matters because inline styles always win over CSS classes: leaving `minHeight: 500` unconditional would silently defeat the new `flex: 1; min-height: 0` CSS rule from Step 1 whenever the fullscreen content doesn't fit in 500px less space.

- [ ] **Step 3: Resize the map when the selection bar / bulk-edit panel toggle**

In `frontend/src/components/ProjectDetailPage.jsx`, find the existing effect (around line 750-758):

```jsx
  // Redimensionner la carte quand on toggle les filtres
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef?.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [showFilters]);
```

Immediately after it, add a new effect:

```jsx
  // Redimensionner la carte quand la barre de sélection ou le panneau d'édition groupée apparaît/disparaît
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef?.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectionMode, showBulkEdit]);
```

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors/warnings.

- [ ] **Step 5: Manual verification — panel fully visible, map resizes, no regression**

Run: `cd frontend && npm run dev`, open a project, go to "Carte" tab.
1. Enter fullscreen.
2. Enable selection mode → select lots → click "Modifier". Expected: the "Modifier les métadonnées" panel is **fully visible** (header, all 6 fields, footer with "Annuler"/"Appliquer" buttons) without needing to scroll, on a normal desktop viewport (e.g. 1366×768 or larger). The map below it visibly shrinks to fill the remaining space (not clipped, not overlapping).
3. Close the panel, disable selection mode. Expected: map grows back to fill the space under the filters.
4. Exit fullscreen. Expected: map height and behavior are exactly as before this change (`calc(100vh - 300px)`, normal page scroll, `minHeight: 500`).
5. Shrink the browser window height to something small (e.g. 600px) while in fullscreen with the bulk-edit panel open. Expected: if content still doesn't fit, the fullscreen container scrolls (via `overflow-y: auto`) instead of silently clipping the panel.

- [ ] **Step 6: Commit**

```bash
cd "lot_webapp" && git add frontend/src/styles.css frontend/src/components/ProjectDetailPage.jsx
git commit -m "fix: make carte-map-container flexible in fullscreen mode

The map's height was a fixed calc() that ignored the selection bar and
bulk-metadata panel, and .carte-fullscreen had no overflow fallback, so
those panels overflowed the fixed-position fullscreen container and
became inaccessible. Also fixes a dead CSS selector (.carte-filters
never matched the actual .map-filters-v2 class)."
```

---

### Task 3: End-to-end acceptance check

**Files:** none (verification only — no code changes expected; if a check fails, fix in the relevant task above and re-run this task)

**Interfaces:**
- Consumes: the combined behavior of Task 1 + Task 2.
- Produces: confirmation that the spec's acceptance criteria are met.

- [ ] **Step 1: Full manual regression pass**

Run: `cd frontend && npm run dev`, open a project as a manager, go to "Carte" tab, enter fullscreen, and walk through all of these in order:

1. Select several lots (selection mode) → "Modifier" → fill `type_lot`, `emplacement`, `type_maison` → "Appliquer aux N lots". Expected: request succeeds, a **visible** success toast appears in fullscreen, panel closes, lots refresh with new metadata.
2. Open a single lot in `complete_lot` mode → submit without `price_per_sqm`/`surface`. Expected: a **visible** warning toast appears in fullscreen (validation message), panel stays open.
3. Fill `price_per_sqm` and `surface`, submit. Expected: **visible** success toast, modal closes, lot updated.
4. Exit fullscreen (Échap). Repeat steps 1-3 in normal (non-fullscreen) mode. Expected: identical behavior to before this fix — toasts visible, panels usable, page scrolls normally, map height `calc(100vh - 300px)`.

- [ ] **Step 2: Confirm against spec acceptance criteria**

Check off each criterion from `docs/superpowers/specs/2026-07-04-fullscreen-metadata-edit-fix-design.md`:
- [ ] En mode plein écran, toutes les actions d'édition de métadonnées fonctionnent identiquement au mode normal.
- [ ] Les modales et panneaux sont bien visibles et interactifs dans le fullscreen container.
- [ ] Aucune régression en mode non-fullscreen.

If any box can't be checked, stop and fix the relevant task before proceeding — do not mark this task complete with unresolved regressions.
