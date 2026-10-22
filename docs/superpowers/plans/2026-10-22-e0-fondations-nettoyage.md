# E0 — Fondations & nettoyage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remettre `dev` en état de recevoir les epics : branches réconciliées, tests isolés et fiables, workflow de statuts couvert, lint à zéro, CI.

**Architecture:** Aucun changement fonctionnel. On réconcilie git, on refond les fixtures pytest (SQLite mémoire, schéma par test, fabriques), on fige le comportement actuel des transitions par des tests de caractérisation, puis on nettoie (ruff, eslint) sous la protection de ces tests, et on ajoute Vitest + une CI GitHub Actions.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy async, aiosqlite, pytest + pytest-asyncio, ruff ; React 19, Vite 7, ESLint 9, Vitest, React Testing Library, jsdom ; GitHub Actions.

**Spec:** [docs/superpowers/specs/epics/E0-fondations-nettoyage.md](../specs/epics/E0-fondations-nettoyage.md) (design parent : [2026-10-22-roadmap-lotispro-design.md](../specs/2026-10-22-roadmap-lotispro-design.md))

## Global Constraints

- Branche de travail : `feature/e0-fondations` créée depuis `dev` ; PR vers `dev`.
- Aucun changement de comportement métier : toute modification de code applicatif dans E0 est un refactor sûr, prouvé par les tests de caractérisation (Task 3) verts avant **et** après.
- Les commits de l'assistant IA (`cc995e5` : `frontend/src/components/ai_assistant/PromptLibrary.jsx`, `prompts.js`) ne doivent pas entrer dans `dev`.
- `backend/app/infrastructure/database/session.py` : conserver la version de `dev`.
- Préfixe API : `/api` (`settings.API_V1_PREFIX`) ; transitions sous `/api/lots/{lot_id}/transitions/...`.
- `BusinessRuleError` → HTTP 400 ; `NotFoundError` → 404 ; rôle insuffisant → 403.
- Messages de commit en anglais au format conventionnel (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Après chaque tâche : mettre à jour la ligne correspondante de `docs/AVANCEMENT.md` et l'issue GitHub (statut).

## Review Focus

1. **Tests qui passent seuls mais pas ensemble** (état partagé, fichier `test_lots.db`) — attendu : `pytest` vert deux fois de suite et dans un ordre aléatoire → Task 2 ajoute `test_isolation_users_table_empty_at_start` exécuté en double.
2. **Transitions effectuées par un commercial non propriétaire de la réservation** (`engagee_to_soldee` vérifie `reserved_by_user_id`) — attendu : 400 → Task 3 `test_solde_refused_for_other_commercial`.
3. **Merge `main` → `dev` qui réintroduit l'ancienne config SSL** — attendu : `session.py` identique à `dev` → Task 1 step de vérification `git diff`.
4. **Autofix ruff qui change un comportement** (ex. `UP017` `timezone.utc` → `UTC`, imports réordonnés provoquant un import circulaire) — attendu : suite complète verte après `--fix` → Task 4 relance la suite complète.
5. **Suppression d'une variable « inutilisée » côté React qui était en fait un effet de bord** (setter appelé, hook) — attendu : build + tests de fumée verts, revue manuelle de chaque `no-unused-vars` → Task 5.

---

### Task 1: Réconcilier `main` et `dev`

**Files:**
- Modify: `backend/railway.toml:6`
- Delete (sur `dev` uniquement): `frontend/src/components/ai_assistant/PromptLibrary.jsx`, `frontend/src/components/ai_assistant/prompts.js`
- Modify: `docs/AVANCEMENT.md` (section Branches)

**Interfaces:**
- Produces: `dev` contenant l'historique de `origin/main` ; `feature/ai_assistant` contenant `PromptLibrary.jsx` et `prompts.js`.

- [ ] **Step 1: Sauvegarder les fichiers IA dans leur branche**

```bash
git switch feature/ai_assistant
git checkout origin/main -- frontend/src/components/ai_assistant/PromptLibrary.jsx frontend/src/components/ai_assistant/prompts.js
git commit -m "feat: add PromptLibrary to AI assistant branch (moved from main)"
git push origin feature/ai_assistant
```

- [ ] **Step 2: Fusionner `main` dans une branche de travail issue de `dev`**

```bash
git switch dev && git pull
git switch -c feature/e0-fondations
git merge origin/main --no-ff -m "chore: merge main into dev (reconcile branches)"
```
En cas de conflit sur `session.py` : `git checkout --ours backend/app/infrastructure/database/session.py`.

- [ ] **Step 3: Retirer les fichiers IA de la branche**

```bash
git rm frontend/src/components/ai_assistant/PromptLibrary.jsx frontend/src/components/ai_assistant/prompts.js
```
Vérifier qu'aucun fichier hors `ai_assistant/` ne les importe : `grep -rn "PromptLibrary\|ai_assistant/prompts" frontend/src` → aucun résultat.

- [ ] **Step 4: Rendre visibles les échecs de migration**

`backend/railway.toml` ligne 6 :
```toml
preDeployCommand = "sh -c 'alembic upgrade head && python scripts/create_admin.py'"
```

- [ ] **Step 5: Vérifier**

Run: `git diff dev -- backend/app/infrastructure/database/session.py`
Expected: aucune sortie.
Run: `git log --oneline HEAD..origin/main`
Expected: aucune sortie.
Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 6: Inspecter `feature/marketing_landing_page`**

Run: `git log --oneline dev..origin/feature/marketing_landing_page`
Consigner le résultat (liste des commits non mergés, ou « rien ») dans `docs/AVANCEMENT.md` § Branches. Pas de merge.

- [ ] **Step 7: Commit**

```bash
git add backend/railway.toml docs/AVANCEMENT.md
git commit -m "chore: reconcile main into dev, keep AI assistant on its branch, fail deploy on migration error"
```

---

### Task 2: Isolation des tests backend + fabriques

**Files:**
- Modify: `backend/app/tests/conftest.py` (réécriture)
- Create: `backend/app/tests/factories.py`
- Create: `backend/app/tests/integration/test_api/test_isolation.py`
- Modify: `backend/pyproject.toml` (`[project.optional-dependencies].dev` : ajouter `aiosqlite`, `pytest-randomly`)

**Interfaces:**
- Produces (fixtures `conftest.py`) :
  - `db_session: AsyncSession` — base SQLite **en mémoire** neuve par test (`sqlite+aiosqlite:///:memory:`, `StaticPool`, `Base.metadata.create_all` à chaque test).
  - `client: AsyncClient` — app avec `get_session` surchargé.
  - `manager: UserModel`, `commercial: UserModel`, `other_commercial: UserModel`.
  - `auth_headers(user: UserModel) -> dict[str, str]` — fixture-fonction renvoyant `{"Authorization": f"Bearer {create_access_token(...)}"}` (même payload que `test_auth.py` utilise aujourd'hui).
- Produces (`factories.py`, toutes `async`, prennent `session: AsyncSession` en premier argument, font `add` + `commit` + `refresh`) :
  - `make_user(session, role: str = "commercial", email: str | None = None) -> UserModel`
  - `make_project(session, created_by: UserModel, **overrides) -> ProjectModel`
  - `make_lot(session, project: ProjectModel, status: str = "available", price: float | None = 500000.0, surface: float | None = 200.0, numero: str | None = None, **overrides) -> LotModel`
  - `make_client(session, created_by: UserModel | None = None, **overrides) -> ClientModel`
  - `make_notaire(session, **overrides) -> NotaireModel` (défauts `nom="Notaire"`, `prenom="Test"`, `telephone="+212600000000"`)
  - `assign(session, user: UserModel, project: ProjectModel) -> AssignmentModel`

- [ ] **Step 1: Écrire le test d'isolation**

```python
# test_isolation.py
@pytest.mark.parametrize("run", [1, 2])
async def test_isolation_users_table_empty_at_start(db_session, run):
    count = (await db_session.execute(select(func.count()).select_from(UserModel))).scalar_one()
    assert count == 0
    await make_user(db_session, email="same@example.com")
```

- [ ] **Step 2: Lancer et constater l'échec**

Run: `cd backend && python -m pytest app/tests/integration/test_api/test_isolation.py -v`
Expected: FAIL (`run=2` voit 1 utilisateur ou `ImportError` sur `factories`).

- [ ] **Step 3: Réécrire `conftest.py` et créer `factories.py`** selon les Interfaces ci-dessus. Supprimer la fixture `event_loop` (dépréciée en pytest-asyncio ≥ 0.24). Adapter `test_auth.py` aux nouveaux noms de fixtures si nécessaire, sans changer ses assertions.

- [ ] **Step 4: Lancer toute la suite deux fois**

Run: `python -m pytest -q && python -m pytest -q -p randomly`
Expected: 17 passed, 0 error, les deux fois ; aucun fichier `test_lots.db` créé.

- [ ] **Step 5: Commit**

```bash
git add backend/app/tests backend/pyproject.toml
git commit -m "test: isolate backend tests with per-test in-memory database and factories"
```

---

### Task 3: Tests de caractérisation du workflow de statuts

**Files:**
- Create: `backend/app/tests/integration/test_api/test_lot_transitions.py`

**Interfaces:**
- Consumes: fixtures et fabriques de Task 2.
- Produces: helper local `async def post_transition(client, headers, lot_id: int, name: str, json: dict | None = None) -> Response` qui appelle `POST /api/lots/{lot_id}/transitions/{name}`.

Payloads minimaux (schémas réels de `app/domain/schemas/reservation.py`) :
- `start-option` : `{"client_id": c.id, "expiration_date": <now+7j ISO>}`
- `direct-reservation` : `{"client_id": c.id, "guarantee_amount": 10000, "payment_type": "<1re valeur de PAYMENT_TYPE>", "finalization_date": <now+15j ISO>}`
- `to-reservation` : `{"guarantee_amount": 10000, "payment_type": …, "finalization_date": …}`
- `direct-engage` : `{"client_id": c.id, "guarantee_amount": 50000, "payment_type": …}`
- `engage` : `{"guarantee_action": "deduct"}`
- `refund` : `{"refund_amount": 10000, "refund_date": <today ISO>}`
- `notaire` (POST) : `{"notaire_id": n.id, "notary_date": <today ISO>}`
- `block` : `{"reason": "test"}` ; `unblock` : `{}`

- [ ] **Step 1: Écrire les tests (un par ligne)**

| Test | Préparation | Appel | Assertion |
|---|---|---|---|
| `test_activate_creation_to_available` | lot `creation` avec prix+surface | `activate` | 200, `status == "available"` |
| `test_activate_refused_without_price` | lot `creation`, `price=None` | `activate` | 400, message contient `Prix` |
| `test_start_option_available_to_option` | lot `available` | `start-option` | 200 ; lot relu `status == "option"` |
| `test_cancel_option_back_to_available` | après `start-option` | `cancel-option` | 200, `status == "available"` |
| `test_extend_option_keeps_status` | après `start-option` | `extend-option` (payload du schéma de la route) | 200 ; statut `option` ; date d'expiration > précédente |
| `test_direct_reservation_available_to_raf` | lot `available` | `direct-reservation` | lot `reservation_a_finaliser` |
| `test_option_to_reservation` | après `start-option` | `to-reservation` | lot `reservation_a_finaliser` |
| `test_refund_raf_to_available` | après `direct-reservation` | `refund` | lot `available` |
| `test_direct_engage_available_to_engagee` | lot `available` | `direct-engage` | lot `reservation_engagee` |
| `test_engage_raf_to_engagee` | après `direct-reservation` | `engage` | lot `reservation_engagee` |
| `test_solde_engagee_to_soldee` | après `direct-engage` (même commercial) | `solde` | lot `reservation_soldee` |
| `test_solde_refused_for_other_commercial` | `direct-engage` par `commercial` | `solde` par `other_commercial` | 400 |
| `test_notaire_soldee_to_chez_notaire` | lot soldé, notaire créé | `notaire` | lot `chez_notaire` |
| `test_proprietaire_sets_closed_at` | lot `chez_notaire` | `proprietaire` | lot `chez_proprietaire` ; réservation `closed_at` non nul |
| `test_block_stores_reason` | lot `available` | `block` `{"reason": "test"}` | lot `blocked`, `blocked_reason == "test"` |
| `test_unblock_manager_only` | lot `blocked` | `unblock` par `commercial` puis par `manager` | 403 puis 200 + `available` |
| `test_transition_from_wrong_status_refused` | lot `creation` | `start-option` | 400 ; statut inchangé |

Les tests qui dépendent d'un état intermédiaire l'atteignent **via l'API** (pas en écrivant le statut en base), pour figer aussi les effets de bord (réservation, échéancier).

- [ ] **Step 2: Lancer**

Run: `python -m pytest app/tests/integration/test_api/test_lot_transitions.py -v`
Expected: PASS. Si un test échoue, c'est **le comportement actuel** qui doit être compris : corriger le test (payload, attente) pour qu'il décrive le comportement réel, **ne pas** modifier le code applicatif ; consigner toute anomalie suspecte dans `docs/AVANCEMENT.md` § Anomalies pour décision.

- [ ] **Step 3: Commit**

```bash
git add backend/app/tests/integration/test_api/test_lot_transitions.py
git commit -m "test: add characterization tests for lot status transitions"
```

---

### Task 4: Backend à zéro erreur ruff

**Files:**
- Modify: `backend/app/services/project_service.py:773,777,1426`
- Modify: `backend/app/infrastructure/storage/supabase_storage.py:84`
- Modify: `backend/pyproject.toml` (`[tool.ruff.lint]` ignore + per-file-ignores)
- Modify: fichiers signalés par `B904`, `ERA001`, `SIM102`, `RUF012`, `PLW0603`, `SIM105`
- Modify: `docs/AVANCEMENT.md` (§ Dette : liste des fonctions `PLR0912`/`PLR0915`)

- [ ] **Step 1: Test du crash `UploadFile`**

Dans `backend/app/tests/unit/test_imports.py` :
```python
def test_project_service_annotations_resolve():
    import typing
    from app.services.project_service import ProjectService
    for name, fn in vars(ProjectService).items():
        if callable(fn):
            typing.get_type_hints(fn)  # lève NameError si un nom est indéfini
```

- [ ] **Step 2: Lancer → FAIL** (`NameError: name 'UploadFile' is not defined`).

- [ ] **Step 3: Corriger** : `from fastapi import UploadFile` sous `if TYPE_CHECKING:` dans `project_service.py` (+ `from __future__ import annotations` si absent) ; supprimer les 3 variables `F841` (vérifier que l'appel de droite n'a pas d'effet de bord ; s'il en a, garder l'appel sans l'assignation).

- [ ] **Step 4: Autofix sûr puis corrections manuelles**

```bash
python -m ruff check . --fix
python -m ruff format .
```
Corriger à la main : `B904` (`raise ... from exc`), `ERA001` (supprimer le code commenté), `SIM102`, `SIM105`, `RUF012` (`ClassVar`), `PLW0603`.
Configurer dans `pyproject.toml` :
```toml
[tool.ruff.lint.per-file-ignores]
"alembic/env.py" = ["E402"]
"app/infrastructure/database/session.py" = ["E402"]
```
et ajouter à `ignore` : `"PLR0912", "PLR0915", "ARG002", "RUF001", "RUF002", "RUF003"` (les `RUF00x` = caractères français dans les chaînes, voulus). Copier la sortie de `ruff check . --select PLR0912,PLR0915 --output-format concise` dans `docs/AVANCEMENT.md` § Dette.

- [ ] **Step 5: Vérifier**

Run: `python -m ruff check . && python -m ruff format --check . && python -m pytest -q`
Expected: `All checks passed!`, aucun fichier à reformater, suite verte.

- [ ] **Step 6: Commit**

```bash
git add backend docs/AVANCEMENT.md
git commit -m "fix: resolve undefined UploadFile and clean backend lint to zero errors"
```

---

### Task 5: Frontend — ESLint à zéro erreur + Vitest

**Files:**
- Modify: `frontend/package.json` (devDependencies `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` ; script `"test": "vitest run"`)
- Modify: `frontend/vite.config.js` (bloc `test: { environment: 'jsdom', setupFiles: './src/test/setup.js', globals: true }`)
- Create: `frontend/src/test/setup.js` (`import '@testing-library/jest-dom'`)
- Create: `frontend/src/test/renderWithProviders.jsx` — `renderWithProviders(ui, { route = '/', user = null } = {})` qui enveloppe `MemoryRouter`, `ToastProvider` et un `AuthContext` simulé.
- Create: `frontend/src/components/__tests__/Login.test.jsx`, `ProjectsPage.test.jsx`, `LotDetailModal.test.jsx`
- Create: `frontend/src/contexts/__tests__/ToastContext.test.jsx`
- Create: `frontend/src/contexts/toastHooks.js` (ou équivalent) pour sortir le hook exporté de `ToastContext.jsx` (règle `only-export-components`) ; idem `AuthContext.jsx`.
- Modify: les 9 fichiers listés par ESLint (Dashboard.jsx 8, LotDetailModal.jsx 7, ProjectDetailPage.jsx 7, ContactPage, ErrorBoundary, GlobalDashboard, ProjectsPage, AuthContext, ToastContext).

**Interfaces:**
- Produces: `renderWithProviders` réutilisé par tous les tests frontend des epics suivants ; `npm test`.

- [ ] **Step 1: Écrire les tests de fumée**
  - `Login.test.jsx` : `renders email and password fields and submit button`.
  - `ProjectsPage.test.jsx` : `fetch` simulé (`vi.fn` → `[]`) ; affiche l'état vide sans erreur.
  - `LotDetailModal.test.jsx` : lot `{ id: 1, numero: 'A1', status: 'available', price: 500000, surface: 200 }` ; le libellé « Disponible » est affiché.
  - `ToastContext.test.jsx` : `document.fullscreenElement` simulé = un `div` du DOM + événement `fullscreenchange` ; `toast.success('ok')` → le texte `ok` est un descendant de ce `div`.

- [ ] **Step 2: Lancer → FAIL** (vitest absent). Installer les dépendances, configurer, relancer → les tests passent ou échouent pour une raison réelle ; corriger le test, pas le composant, sauf bug avéré (le consigner).

- [ ] **Step 3: Corriger ESLint**
  - `no-unused-vars` (21) : supprimer — vérifier pour chacun qu'il ne s'agit pas d'un setter/hook appelé pour son effet.
  - `react-hooks/rules-of-hooks` (1), `react-hooks/refs` (2), `no-undef` (1), `no-prototype-builtins` (1 → `Object.hasOwn`) : corriger.
  - `only-export-components` (2) : déplacer les hooks/constantes exportés dans un fichier séparé et mettre à jour les imports.
  - `exhaustive-deps` (22 warnings) : pour chacun, ajouter la dépendance si sûr ; sinon `// eslint-disable-next-line react-hooks/exhaustive-deps -- <raison>`.

- [ ] **Step 4: Vérifier**

Run: `cd frontend && npx eslint src && npm test && npm run build`
Expected: 0 problème ESLint, tests verts, build OK.

- [ ] **Step 5: Vérification manuelle** : `npm run dev` + backend local ; se connecter, ouvrir un projet, onglet Carte, ouvrir un lot, passer en plein écran → aucune erreur console.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "chore: add Vitest smoke tests and fix all ESLint errors"
```

---

### Task 6: CI GitHub Actions + CLAUDE.md

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Écrire `ci.yml`** — déclenché sur `pull_request` vers `dev` et `main` et `push` sur `dev` ; deux jobs :
  - `backend` (ubuntu-latest, Python 3.13, `working-directory: backend`) : `pip install -e ".[dev]"`, `ruff check .`, `ruff format --check .`, `pytest -q`.
  - `frontend` (Node 22, `working-directory: frontend`) : `npm ci`, `npm run lint`, `npm test`, `npm run build`.

- [ ] **Step 2: Mettre à jour `CLAUDE.md`** : migrations `0001 → 0016` ; commandes `npm test` ; section « Workflow de statuts » (tableau des 16 transitions, renvoi vers `test_lot_transitions.py`) ; section « Définition de Terminé » copiée du design §6 ; renvoi vers `docs/AVANCEMENT.md`.

- [ ] **Step 3: Pousser et ouvrir la PR**

```bash
git push -u origin feature/e0-fondations
gh pr create --base dev --title "E0 — Fondations & nettoyage" --body "Closes #<issue E0> ..."
```
Expected: les deux jobs CI verts.

- [ ] **Step 4: Revue** : lancer `/code-review` (ou `pr-review-toolkit:review-pr`) sur la PR ; traiter chaque remarque ; mettre à jour `docs/AVANCEMENT.md` (E0 → Terminé, lien PR) et les issues GitHub ; merger dans `dev` après CI verte.

- [ ] **Step 5: Commit**

```bash
git add .github CLAUDE.md docs/AVANCEMENT.md
git commit -m "chore: add CI workflow and refresh CLAUDE.md"
```
