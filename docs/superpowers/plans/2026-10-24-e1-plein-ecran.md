# E1 — 🐛 #5 Plein écran (fin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le panneau d'édition groupée des métadonnées entièrement visible et utilisable dans l'onglet Carte en plein écran (le correctif des toasts est déjà livré, `5b4a4bb`).

**Architecture:** Reprise des tâches 2 et 3 du plan [2026-07-04-fullscreen-metadata-edit-fix.md](2026-07-04-fullscreen-metadata-edit-fix.md), mises à jour après E0 : la carte devient flexible en plein écran (`flex: 1; min-height: 0`), le conteneur plein écran défile en secours, Leaflet est redimensionné quand la barre de sélection / le panneau apparaît, et un test Vitest fige la règle de hauteur.

**Tech Stack:** React 19, Vite 7, CSS (`frontend/src/styles.css`), Leaflet, Vitest + React Testing Library (`renderWithProviders` depuis `frontend/src/test/renderWithProviders.jsx`).

**Spec:** [docs/superpowers/specs/epics/E1-plein-ecran.md](../specs/epics/E1-plein-ecran.md) (spec technique d'origine : [2026-07-04-fullscreen-metadata-edit-fix-design.md](../specs/2026-07-04-fullscreen-metadata-edit-fix-design.md))

## Global Constraints

- Branche `feature/e1-plein-ecran` depuis `dev` ; PR vers `dev`.
- Le comportement hors plein écran ne change pas : `height: calc(100vh - 300px)`, `minHeight: 500`.
- Un seul élément plein écran dans l'app (`carteTabRef`) : pas d'abstraction multi-cible.
- Pas de nouvelle dépendance. Chaînes UI françaises inchangées.
- La contrainte « pas de framework de test » du plan 2026-07-04 est **caduque** : Vitest existe depuis E0 et la spec E1 exige un test.
- ESLint à 0 problème ; toute dépendance d'effet ajoutée doit être stable (E0 : `mapRef` est stable).
- Commits conventionnels en anglais terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; `docs/AVANCEMENT.md` mis à jour dans le commit de chaque tâche.

## Review Focus

1. **Écran bas (≤ 700 px de haut) en plein écran avec le panneau ouvert** — attendu : le conteneur défile, rien n'est coupé → Task 1 règle CSS `overflow-y: auto` + vérification Task 2.
2. **Sortie du plein écran (Échap) avec le panneau ouvert** — attendu : la carte reprend `calc(100vh - 300px)` / `minHeight 500` → test Vitest de Task 1 (cas non plein écran).
3. **Plein écran par repli CSS (`.carte-fullscreen`) quand l'API Fullscreen échoue** — attendu : même comportement que `:fullscreen` → règles CSS dupliquées pour les deux sélecteurs (Task 1).
4. **Carte grise ou mal dimensionnée après l'ouverture/fermeture du panneau** — attendu : `invalidateSize()` déclenché → Task 1 Step 4.

---

### Task 1: Carte flexible en plein écran

**Files:**
- Modify: `frontend/src/styles.css:856-890` (bloc `/* Carte Fullscreen */`)
- Modify: `frontend/src/components/ProjectDetailPage.jsx:1123-1128` (style inline de `.carte-map-container`, ligne `height: isFullscreen ? 'calc(100vh - 120px)' …` à la ligne 1127)
- Modify: `frontend/src/components/ProjectDetailPage.jsx` (nouvel effet juste après l'effet « Redimensionner la carte quand on toggle les filtres », ligne 756)
- Create: `frontend/src/components/__tests__/carteMapContainerStyle.test.js`
- Create (si extraction) : `frontend/src/components/carteMapContainerStyle.js`

**Interfaces:**
- Produces: `getCarteMapContainerStyle(isFullscreen: boolean) -> { padding: 0, overflow: 'hidden', height: string | undefined, minHeight: number }` — fonction pure exportée depuis `frontend/src/components/carteMapContainerStyle.js`, utilisée par `CarteTab` pour le `style` du conteneur de carte (rend la règle testable sans monter Leaflet).

- [ ] **Step 1: Écrire le test**

```js
// carteMapContainerStyle.test.js
import { getCarteMapContainerStyle } from '../carteMapContainerStyle';

test('fullscreen: no fixed height, min-height 0 (CSS flex takes over)', () => {
  expect(getCarteMapContainerStyle(true)).toEqual({ padding: 0, overflow: 'hidden', height: undefined, minHeight: 0 });
});

test('normal mode: unchanged sizing', () => {
  expect(getCarteMapContainerStyle(false)).toEqual({ padding: 0, overflow: 'hidden', height: 'calc(100vh - 300px)', minHeight: 500 });
});
```

- [ ] **Step 2: Lancer → FAIL** — `cd frontend && npx vitest run src/components/__tests__/carteMapContainerStyle.test.js` → module introuvable.

- [ ] **Step 3: Créer `carteMapContainerStyle.js`** avec la fonction de l'Interface, et l'utiliser dans `ProjectDetailPage.jsx` à la place de l'objet `style` inline (lignes 1123-1128).

- [ ] **Step 4: CSS + redimensionnement**
  - `styles.css` : appliquer exactement le remplacement du plan 2026-07-04, Task 2 Step 1 (`.carte-fullscreen` + `overflow-y: auto` ; `.carte-fullscreen .map-filters-v2 { flex-shrink: 0; }` à la place du sélecteur mort `.carte-filters` ; `.carte-fullscreen .carte-map-container` et `.carte-tab:fullscreen .carte-map-container` → `flex: 1; min-height: 0;`).
  - `ProjectDetailPage.jsx` : après l'effet de la ligne 756, ajouter un effet identique (timer 150 ms → `mapRef.current?.invalidateSize()`, nettoyage `clearTimeout`) dont les dépendances sont `[selectionMode, showBulkEdit, mapRef]`.

- [ ] **Step 5: Vérifier**

Run: `cd frontend && npx vitest run && npx eslint src && npm run build`
Expected: tests verts (6 au total), 0 problème ESLint, build OK.

- [ ] **Step 6: Commit**

```bash
git add frontend/src docs/AVANCEMENT.md
git commit -m "fix: make carte map container flexible in fullscreen mode"
```
(+ ligne E1-T1 de `docs/AVANCEMENT.md` → ✅)

---

### Task 2: Recette multi-navigateurs et non-régression

**Files:**
- Modify: `docs/AVANCEMENT.md` (§ « Recette E1 (plein écran) » : remplir la grille)

**Interfaces:**
- Consumes: le comportement livré par Task 1 + le correctif toasts `5b4a4bb`.

- [ ] **Step 1: Lancer l'app** — backend `cd backend && uvicorn app.main:app --reload --port 8000`, frontend `cd frontend && npm run dev`, connexion manager, un projet avec des lots et un GeoJSON.

- [ ] **Step 2: Scénario, pour chaque case de la grille** (Chrome, Firefox, Edge × fenêtré, plein écran F11 et bouton, tablette 1024 px, écran large ≥ 1440 px) :
  1. Mode sélection → sélectionner plusieurs lots → « Modifier » → remplir `type_lot`, `emplacement`, `type_maison` → « Appliquer aux N lots » : panneau entièrement visible, toast de succès visible, lots rafraîchis.
  2. Ouvrir un lot en mode `complete_lot`, valider sans `price_per_sqm` / `surface` : toast d'avertissement visible, panneau ouvert ; puis remplir et valider : toast de succès, modal fermé.
  3. Ouvrir/fermer le panneau : la carte se redimensionne (pas de zone grise).
  4. Hauteur de fenêtre ~600 px en plein écran avec panneau ouvert : le conteneur défile, rien n'est coupé.
  5. Sortie du plein écran (Échap) : carte à `calc(100vh - 300px)`, page défilable normalement.
  6. Console : aucune erreur.
- [ ] **Step 3: Remplir la grille** de `docs/AVANCEMENT.md` (✅ / ❌ + note) ; Safari : « non testé (Windows) ».
- [ ] **Step 4: Cocher** les critères d'acceptance de la spec E1 ; tout ❌ renvoie à Task 1.
- [ ] **Step 5: Commit** — `docs: record E1 fullscreen acceptance grid` (+ ligne E1-T2 → ✅).
