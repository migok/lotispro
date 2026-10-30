# E5 — 📊 #3 Vue projet : grille type de lot × statut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la page projet un onglet « Lots » : grille type de lot × statut actif avec totaux, liste filtrée par clic sur la grille ou par filtres (statut multiple, type, recherche), ouverture du `LotDetailModal` existant, compteurs rafraîchis après chaque transition, filtres conservés pendant la session.

**Architecture:** T1 ajoute `GET /api/projects/{id}/lots-matrix` : une requête `GROUP BY type_lot normalisé, status` dans `LotRepository`, une fonction pure `build_lots_matrix` (domaine) qui ordonne statuts et lignes, et une méthode fine de `ProjectService` qui contrôle l'accès. T2 crée `components/project/LotsTab.jsx` : la grille vient de l'endpoint, la liste vient de `lots.geojson` (le même flux que la carte, qui porte tous les champs dont la modale a besoin) et se filtre côté client, donc instantanément ; la conversion feature → lot de la carte est extraite dans un utilitaire partagé. T3 ajoute la barre de filtres, le badge, la réinitialisation et la persistance `sessionStorage`.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, pytest ; React 19, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/epics/E5-vue-projet.md](../specs/epics/E5-vue-projet.md) (design parent §5 E5).

## Écarts entre la spec et le code actuel (vérifiés le 2026-10-29 sur `b22edab`)

- **Préfixe d'API :** `API_V1_PREFIX = "/api"` → l'URL réelle est `GET /api/projects/{id}/lots-matrix` (la spec écrit `/api/v1/...`).
- **Statuts actifs (E3) :** 12 statuts dans `app/domain/lot_workflow.py` (`ALL_STATUSES`, `blocked` en dernier) ; `option`, `reservation_a_finaliser` et les 3 statuts EDL sont optionnels par projet (`projects.enabled_optional_statuses`, `enabled_statuses()`). Miroir frontend : `src/utils/lotWorkflow.js` (`enabledStatuses`). Libellés courts et couleurs : `STATUS_LABELS` / `STATUS_COLORS` de `src/utils/constants.js`.
- **Lot dans un statut désactivé :** E3 refuse de désactiver un statut utilisé, mais `POST /api/lots` accepte encore n'importe quel statut (dette E3). La grille affiche donc aussi tout statut désactivé qui contient des lots, à sa place dans l'ordre du pipeline, pour que les totaux restent justes.
- **Montants (E4) :** E5 n'affiche aucun montant agrégé ; la liste affiche `price` du lot tel que le fournit `lots.geojson` (comme la carte). Aucune dépendance aux nouvelles colonnes E4.
- **Contrôle d'accès :** la règle existante est `ProjectRepository.can_user_access` : manager toujours, projet `public` pour tous, commercial affecté sinon. E5 la réutilise telle quelle.
- **Données de la liste :** `GET /api/lots` est paginé (100 max) et ne filtre qu'un statut ; `GET /api/projects/{id}/lots.geojson` renvoie tous les lots du projet (géométrie éventuellement nulle) avec les propriétés que `LotDetailModal` lit (client, réservation, EDL, `db_id`…), sous le même contrôle d'accès. La liste l'utilise.

## Décisions de conception (défauts, à corriger par l'utilisateur à la relecture)

- **D1 Type non renseigné :** `type_lot` NULL ou blanc (après `trim`) → ligne `type_lot: null`, affichée « Non renseigné », toujours en dernier. Les autres lignes sont triées sans tenir compte de la casse ; les valeurs sont regroupées après `trim`, casse conservée.
- **D2 Clics dans la grille :** cellule → filtre statut = [ce statut] + type = cette ligne ; total de colonne → statut seul ; total de ligne → type seul ; total général → réinitialise. Les compteurs à 0 ne sont pas cliquables.
- **D3 Grille non filtrée :** la grille montre toujours tout le projet ; la cellule ou la colonne sélectionnée est surlignée. Seule la liste est filtrée.
- **D4 Clic sur un lot de la liste :** ouvre directement `LotDetailModal` (pas la petite popup de la carte). La modale est gérée par `LotsTab` ; à la fermeture, la liste, ses filtres et son défilement sont intacts (la liste reste montée sous la modale).
- **D5 Rafraîchissement :** `onRefresh` de la modale (appelé après chaque transition) recharge la grille et la liste ; les filtres ne changent pas.
- **D6 Badge :** nombre de dimensions actives (statut, type, recherche) : 0 à 3, texte « 1 filtre » / « N filtres », masqué à 0.
- **D7 Tri de la liste :** numéro, ordre naturel (`localeCompare(…, 'fr', { numeric: true })`, `LOT-2` avant `LOT-10`).
- **D8 Onglet :** « Lots », juste après « Carte », visible pour tous les rôles.

## Global Constraints

- Worktree `../lot_webapp-e5`, branche `feature/e5-vue-projet` (depuis `origin/dev` `b22edab`), PR vers `dev`. Ne jamais toucher `lot_webapp/` (dossier principal) ni d'autres worktrees.
- Aucune migration dans E5. Ne jamais lancer `alembic upgrade` contre `backend/.env` (base Supabase réelle).
- Textes d'UI et messages d'erreur API en français. Accès refusé : `AuthorizationError("Vous n'avez pas accès à ce projet.")` → 403 ; projet inconnu : `NotFoundError("Project", id)` → 404.
- Tests backend dans la venv du worktree (`<scratchpad>/venv-e5`, `pip install -e ".[dev]"` depuis `backend/`) : `SECRET_KEY=ci-dummy-secret-key-for-tests-only-0123456789abcdef python -m pytest -q`, `python -m ruff check .`, `python -m ruff format --check .` (0 erreur). Les tests n'envoient jamais d'email (fixture `no_resend` existante).
- Frontend : `npx vitest run`, `npx eslint .` (0 erreur), `npm run build`.
- TDD : test écrit avant le code ; la sortie RED est consignée dans le rapport de tâche.
- Commits conventionnels en anglais terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; jamais d'amend ni de force-push.
- Chaque tâche met à jour sa ligne dans `docs/AVANCEMENT.md` dans son commit (🟦 au démarrage, 🟨 après revue) ; le contrôleur passe l'issue sur le Project #4 (En cours → En revue). « Terminé » seulement après la recette de l'utilisateur dans l'app.
- Ne pas grossir `ProjectDetailPage.jsx` (3038 lignes) : tout le code E5 vit dans `components/project/` ; la page ne reçoit que l'onglet et l'appel au composant.

## Review Focus

1. **Lots sans type ou au type blanc (`""`, `"  "`)** — attendu : une seule ligne « Non renseigné », en dernier, et un clic sur ses cellules liste exactement ces lots → T1 `test_blank_and_null_types_grouped_last`, T2 `applyLotsFilters` cas `NO_TYPE`.
2. **Lot dans un statut désactivé pour le projet** — attendu : la colonne apparaît à sa place, total général = nombre de lots → T1 `test_disabled_status_with_lots_is_kept`.
3. **Commercial non affecté à un projet privé** — attendu : 403 en français sur la grille, et l'onglet affiche une erreur au lieu d'une grille vide trompeuse → T1 `test_unassigned_commercial_forbidden`, T2 `shows an error when the matrix fails to load`.
4. **`sessionStorage` corrompu, indisponible, ou filtre restauré qui ne correspond plus (statut inconnu)** — attendu : pas de plantage, filtres vides ou nettoyés → T3 `ignores corrupt or unknown persisted filters`.
5. **Transition depuis la modale puis fermeture** — attendu : compteurs à jour, même liste filtrée réaffichée, le lot sorti du filtre disparaît de la liste → T2 `refreshes grid and list after a transition and keeps the filter`.

---

### Task 1 (E5-T1, #35): Endpoint `lots-matrix`

**Files:**
- Create: `backend/app/domain/schemas/lots_matrix.py`, `backend/app/domain/lots_matrix.py`
- Modify: `backend/app/infrastructure/database/repositories/lot_repository.py` (à côté de `count_by_status`), `backend/app/services/project_service.py` (méthode après `get_project`), `backend/app/api/v1/endpoints/projects.py` (route après `/{project_id}/kpis`)
- Test: `backend/app/tests/unit/test_lots_matrix.py`, `backend/app/tests/integration/test_api/test_lots_matrix.py`
- Modify: `docs/AVANCEMENT.md` (ligne E5-T1, ligne E5 de la vue d'ensemble 🟦)

**Interfaces:**
- Produces (JSON consommé par T2) :
  ```json
  { "statuses": ["creation", "available", "..."],
    "rows": [{ "type_lot": "Villa", "counts": {"creation": 0, "available": 2, "...": 0}, "total": 3 },
             { "type_lot": null, "counts": {...}, "total": 1 }],
    "totals": {"creation": 0, "available": 3, "...": 0},
    "grand_total": 4 }
  ```
  `counts` et `totals` ont exactement les clés de `statuses` (zéros compris).
- `LotsMatrixRow(BaseSchema)`: `type_lot: str | None`, `counts: dict[str, int]`, `total: int` ; `LotsMatrixResponse(BaseSchema)`: `statuses: list[str]`, `rows: list[LotsMatrixRow]`, `totals: dict[str, int]`, `grand_total: int` (`BaseSchema` de `app/domain/schemas/common.py`).
- `build_lots_matrix(enabled_optional: Iterable[str], counts: Iterable[tuple[str | None, str, int]]) -> LotsMatrixResponse` — pur. `statuses` = `[s for s in ALL_STATUSES if is_status_enabled(enabled_optional, s) or s a des lots]`.
- `LotRepository.count_by_type_and_status(project_id: int) -> list[tuple[str | None, str, int]]` — une seule requête ; clé de type = `func.nullif(func.trim(LotModel.type_lot), "")`, groupée par cette expression et `status`.
- `ProjectService.get_lots_matrix(project_id: int, user_id: int, user_role: str) -> LotsMatrixResponse` — `NotFoundError` puis `can_user_access`, comme `get_project`.

- [ ] **Step 1: Tests unitaires (pur) dans `test_lots_matrix.py`**

```python
DEFAULT = ("option", "reservation_a_finaliser")

def test_statuses_follow_project_settings():
    m = build_lots_matrix(DEFAULT, [])
    assert m.statuses == ["creation", "available", "option", "reservation_a_finaliser",
        "reservation_engagee", "reservation_soldee", "chez_notaire", "chez_proprietaire", "blocked"]
    assert m.rows == [] and m.grand_total == 0
    assert m.totals == dict.fromkeys(m.statuses, 0)

def test_edl_enabled_adds_three_statuses_in_pipeline_order():
    m = build_lots_matrix(("edl",), [])
    assert m.statuses == ["creation", "available", "reservation_engagee", "reservation_soldee",
        "edl_programme", "edl_realise", "edl_finalise", "chez_notaire", "chez_proprietaire", "blocked"]

def test_disabled_status_with_lots_is_kept():
    m = build_lots_matrix((), [("Villa", "option", 2), ("Villa", "available", 1)])
    assert m.statuses.index("option") == 2  # place du pipeline
    assert m.totals["option"] == 2 and m.grand_total == 3

def test_rows_sorted_case_insensitive_with_missing_type_last():
    m = build_lots_matrix(DEFAULT, [(None, "available", 1), ("villa", "available", 1),
                                     ("Appartement", "blocked", 2), ("Villa", "option", 1)])
    assert [r.type_lot for r in m.rows] == ["Appartement", "villa", "Villa", None]
    assert m.rows[0].counts["blocked"] == 2 and m.rows[0].total == 2
    assert set(m.rows[0].counts) == set(m.statuses)
```

(L'ordre relatif de deux types égaux sans la casse, `villa`/`Villa`, est départagé par la valeur exacte : `sorted(key=lambda t: (t.casefold(), t))`.)

- [ ] **Step 2: Tests d'intégration dans `test_api/test_lots_matrix.py`** (`pytestmark = pytest.mark.integration`, fabriques `make_project`, `make_lot(..., type_lot=...)`, fixtures `manager`, `commercial`, `auth_headers`)

  - `test_matrix_counts_by_type_and_status` : lots Villa available ×2, Villa option ×1, Appartement reservation_engagee ×1 → 200 ; `rows[0] == {"type_lot": "Appartement", ..., "total": 1}`, `rows[1]["counts"]["available"] == 2`, `totals["option"] == 1`, `grand_total == 4`.
  - `test_blank_and_null_types_grouped_last` : `type_lot=None`, `""`, `"  "`, `" Villa "` et `"Villa"` → deux lignes : `"Villa"` (total 2) puis `None` (total 3).
  - `test_other_projects_lots_are_ignored`.
  - `test_unassigned_commercial_forbidden` : projet `visibility="private"` → 403, `"Vous n'avez pas accès à ce projet."` dans le corps.
  - `test_assigned_commercial_allowed` : affectation via `POST /api/projects/{id}/users` (manager) ou `AssignmentModel` → 200.
  - `test_unknown_project_404` ; `test_requires_authentication` → 401.

- [ ] **Step 3: Lancer, constater l'échec** — `python -m pytest app/tests/unit/test_lots_matrix.py app/tests/integration/test_api/test_lots_matrix.py -q` → `ImportError` / 404 sur la route.

- [ ] **Step 4: Implémenter** schémas, `build_lots_matrix`, `count_by_type_and_status`, `get_lots_matrix`, route `GET /{project_id}/lots-matrix` (`response_model=LotsMatrixResponse`, `summary="Lots matrix"`, `CurrentUser`, `ProjectServiceDep`).

- [ ] **Step 5: Vérifier** — suite complète verte, `ruff check .` et `ruff format --check .` à 0.

- [ ] **Step 6: Commit** — `feat: lots matrix endpoint by lot type and status` (+ `docs/AVANCEMENT.md` E5-T1 🟨, E5 🟦 1/3 après revue).

---

### Task 2 (E5-T2, #36): Onglet « Lots » — grille, liste filtrée, navigation

**Files:**
- Create: `frontend/src/utils/lotFromFeature.js`, `frontend/src/services/projectLotsService.js`, `frontend/src/components/project/lotsFilters.js`, `frontend/src/components/project/LotsMatrix.jsx`, `frontend/src/components/project/LotsList.jsx`, `frontend/src/components/project/LotsTab.jsx`
- Modify: `frontend/src/components/ProjectDetailPage.jsx` (`getTabs` l.73, `TAB_ICONS` l.30, rendu des onglets l.611+, clic carte l.413-446 remplacé par `lotFromFeature`), `frontend/src/styles.css` (section `/* Lots tab (E5) */` en fin de fichier)
- Test: `frontend/src/utils/__tests__/lotFromFeature.test.js`, `frontend/src/components/project/__tests__/lotsFilters.test.js`, `.../LotsMatrix.test.jsx`, `.../LotsTab.test.jsx`
- Modify: `docs/AVANCEMENT.md` (E5-T2)

**Interfaces:**
- Consumes: JSON de T1 ; `GET /api/projects/{id}/lots.geojson`.
- `lotFromFeature(feature, projectId) -> object` — exactement l'objet construit aujourd'hui l.413-446 (`id: props.db_id`, `numero: String(lot_id ?? parcelid)`, `surface` depuis `Shape_Area` arrondi à 2 décimales, etc.). La carte l'utilise désormais (refactor sans changement de comportement).
- `fetchLotsMatrix(projectId) -> Promise<Matrix>` ; `fetchProjectLots(projectId) -> Promise<Lot[]>` (`features.map(f => lotFromFeature(f, projectId))`), via `apiGet` / `apiFetch` de `utils/api.js`.
- `lotsFilters.js` : `NO_TYPE = '__none__'` ; `EMPTY_FILTERS = { statuses: [], typeLot: null, search: '' }` (`typeLot: null` = tous types) ; `normalizeTypeLot(value) -> string | null` (trim, blanc → null) ; `applyLotsFilters(lots, filters) -> Lot[]` (filtre + tri D7) ; `countActiveFilters(filters) -> 0..3` (D6).
- `<LotsMatrix matrix filters onSelect />` — `onSelect(nextFilters)` reçoit des filtres complets (`search` conservé) selon D2 ; type d'une ligne `null` → `NO_TYPE`.
- `<LotsList lots onOpenLot />` — colonnes Numéro, Type, Statut (pastille `STATUS_COLORS`), Surface (m²), Prix, Client ; ligne cliquable et activable au clavier ; état vide « Aucun lot ne correspond aux filtres. ».
- `<LotsTab projectId enabledOptional />` — état `filters` (T3 y branchera la persistance), `matrix`, `lots`, `selectedLot`.

- [ ] **Step 1: Tests purs** — `lotFromFeature.test.js` : une feature complète donne `id`, `numero`, `status` (défaut `available`), `surface` (`123.456` → `123.46`), `type_lot`, champs EDL. `lotsFilters.test.js` :
  - statuts multiples : `['available','option']` garde ces deux statuts ;
  - `typeLot: 'Villa'` garde `'Villa'` et `' Villa '` ; `NO_TYPE` garde `null`, `''`, `'  '` ;
  - `search: ' lot-1 '` garde `LOT-1`, `LOT-10`, pas `LOT-2` ;
  - tri : `['LOT-10','LOT-2','LOT-1']` → `['LOT-1','LOT-2','LOT-10']` ;
  - `countActiveFilters(EMPTY_FILTERS) === 0`, `({statuses:['a','b'], typeLot:'Villa', search:'x'}) === 3`.

- [ ] **Step 2: `LotsMatrix.test.jsx`** — avec une matrice de 2 lignes (Villa, `null`) :
  - en-têtes = `STATUS_LABELS` des `statuses`, ligne « Non renseigné », totaux de ligne / colonne / général affichés ;
  - clic sur la cellule Villa × Disponible → `onSelect({ statuses: ['available'], typeLot: 'Villa', search: '' })` ; cellule « Non renseigné » → `typeLot: NO_TYPE` ; total de colonne → `typeLot: null` ; total de ligne → `statuses: []` ; total général → `EMPTY_FILTERS` ;
  - cellule à 0 : pas de `button` ;
  - bouton accessible : `getByRole('button', { name: 'Villa — Disponible : 2 lots' })` ;
  - la table est dans un conteneur `.lots-matrix-scroll` (défilement horizontal, CSS `overflow-x: auto`, 1re colonne `position: sticky`).

- [ ] **Step 3: `LotsTab.test.jsx`** — `fetch` simulé selon l'URL (`/lots-matrix`, `/lots.geojson`) ; `vi.mock('../../LotDetailModal', ...)` par un bouchon qui affiche le numéro du lot et deux boutons « refresh » / « close » appelant `onRefresh` / `onClose`.
  - `shows the grid and all lots` ;
  - `filters the list when a cell is clicked` (titre « Villa · Disponible — 2 lots ») ;
  - `opens the lot detail and returns to the same filtered list` ;
  - `refreshes grid and list after a transition and keeps the filter` : 2e réponse où un lot passe `option` → la cellule passe de 2 à 1, le lot disparaît de la liste filtrée, le filtre reste ;
  - `shows an error when the matrix fails to load` (403 → « Vous n'avez pas accès à ce projet. » ou message d'erreur de l'API) ;
  - projet sans lot → « Aucun lot dans ce projet. ».

- [ ] **Step 4: Lancer, constater l'échec** — `npx vitest run src/utils/__tests__/lotFromFeature.test.js src/components/project` → modules introuvables.

- [ ] **Step 5: Implémenter** les fichiers ci-dessus ; dans `ProjectDetailPage.jsx` : onglet `{ id: 'lots', label: 'Lots' }` après `carte`, icône SVG grille dans `TAB_ICONS`, `{activeTab === 'lots' && <LotsTab projectId={parseInt(projectId)} enabledOptional={enabledOptional} />}`, clic carte via `lotFromFeature`. Styles : couleurs de cellule = `STATUS_COLORS[status]` en fond léger (`color-mix(in srgb, <couleur> 18%, transparent)`) avec texte de la couleur ; cellule sélectionnée en contour.

- [ ] **Step 6: Vérifier** — `npx vitest run` (toute la suite, dont les tests existants de la carte et de `LotDetailModal`), `npx eslint .` 0, `npm run build`.

- [ ] **Step 7: Commit** — `feat: project lots tab with type-by-status grid and filtered list` (+ AVANCEMENT E5-T2).

---

### Task 3 (E5-T3, #37): Filtres persistés en session

**Files:**
- Create: `frontend/src/components/project/LotsFiltersBar.jsx`
- Modify: `frontend/src/components/project/lotsFilters.js`, `frontend/src/components/project/LotsTab.jsx`, `frontend/src/styles.css`
- Test: `frontend/src/components/project/__tests__/lotsFilters.test.js`, `.../LotsTab.test.jsx` (nouveau `describe('filters')`)
- Modify: `docs/AVANCEMENT.md` (E5-T3)

**Interfaces:**
- Consumes: `lotsFilters.js` et `LotsTab` de T2.
- `filtersStorageKey(projectId) -> 'lotsFilters:<projectId>'` ; `loadFilters(projectId) -> filters` (JSON invalide, forme inattendue, accès refusé → `EMPTY_FILTERS` ; statuts hors `ALL_STATUSES` retirés ; `typeLot` non-chaîne → `null`) ; `saveFilters(projectId, filters) -> void` (exceptions avalées).
- `<LotsFiltersBar filters statuses typeOptions onChange onReset />` — `statuses` = `matrix.statuses` ; `typeOptions` = types de `matrix.rows` (`null` → option « Non renseigné » de valeur `NO_TYPE`) ; statut multiple en cases à cocher (pastilles colorées), type en `<select>` (« Tous les types »), recherche `<input type="search">` « Rechercher un numéro » ; bouton « Réinitialiser » désactivé à 0 filtre ; badge « N filtres » (D6).
- `LotsTab` : état initial `loadFilters(projectId)`, `saveFilters` à chaque changement ; la grille et la barre partagent le même état (un clic de cellule met à jour les cases et le select).

- [ ] **Step 1: Tests purs (`lotsFilters.test.js`)** — `loadFilters` : rien en session → `EMPTY_FILTERS` ; aller-retour `saveFilters`/`loadFilters` ; clé `lotsFilters:7` ; `'{oops'` → `EMPTY_FILTERS` ; `{statuses:['available','nope'], typeLot: 3}` → `{statuses:['available'], typeLot:null, search:''}` ; `sessionStorage.getItem` qui lève → `EMPTY_FILTERS`.

- [ ] **Step 2: Tests de composant (`LotsTab.test.jsx`, `describe('filters')`)**
  - cocher « Disponible » puis « Option » → la liste contient les deux statuts, badge « 1 filtre » ; choisir le type « Villa » → « 2 filtres » ;
  - saisir « 1 » dans la recherche → filtrage immédiat sans appel réseau (le nombre d'appels `fetch` ne change pas) ;
  - « Réinitialiser » → tous les lots, badge masqué, bouton désactivé ;
  - clic de cellule → case du statut cochée et select sur le type ;
  - `ignores corrupt or unknown persisted filters` ;
  - persistance : démonter puis remonter `LotsTab` (projet 7) → mêmes filtres ; le projet 8 démarre sans filtre.

- [ ] **Step 3: Lancer, constater l'échec.**

- [ ] **Step 4: Implémenter** `LotsFiltersBar`, `loadFilters` / `saveFilters`, branchement dans `LotsTab` ; styles responsive (la barre passe à la ligne sous 1024 px).

- [ ] **Step 5: Vérifier** — `npx vitest run`, `npx eslint .` 0, `npm run build`.

- [ ] **Step 6: Commit** — `feat: lots tab filters with session persistence` (+ AVANCEMENT E5-T3).

---

## Fin d'epic

- [ ] Revue finale de toute la branche (`git diff origin/dev...HEAD`) sur le modèle le plus capable ; corrections en commits séparés.
- [ ] Push de `feature/e5-vue-projet`, PR vers `dev` (`Closes #35 #36 #37`, refs #34), CI verte (backend, frontend, migrations).
- [ ] Recette par l'utilisateur : backend du worktree sur un port libre (`uvicorn app.main:app --port <p>` sans `--reload`, `SCHEDULER_ENABLED=false`, `CORS_ORIGINS` incluant le port Vite), frontend `VITE_API_URL=http://localhost:<p> npx vite --port <q>`. Scénario : onglet Lots (manager puis commercial affecté), types dynamiques et « Non renseigné », clic cellule / total colonne, ouverture d'un lot, transition depuis la modale puis compteurs et liste à jour, fermeture → même filtre, filtres + badge + réinitialisation, changement d'onglet puis retour (filtres conservés), fenêtre ~1024 px (défilement horizontal de la grille).
- [ ] Après recette : issues #35-#37 et #34 « Terminé » sur le Project #4, `docs/AVANCEMENT.md` E5 ✅ 3/3, mémoire projet mise à jour. Fusion par l'utilisateur.
