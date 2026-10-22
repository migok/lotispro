# E0 — Fondations & nettoyage

**Design parent :** [2026-10-22-roadmap-lotispro-design.md](../2026-10-22-roadmap-lotispro-design.md) §5 E0
**Plan détaillé :** [2026-10-22-e0-fondations-nettoyage.md](../../plans/2026-10-22-e0-fondations-nettoyage.md)
**Ticket Asana :** aucun (dette technique) — **Dépend de :** rien — **Débloque :** tous les autres epics

## Pourquoi
Rien ne peut être vérifié sans tests fiables ni CI, et les branches `main` / `dev` divergent.

## Périmètre

### E0-T1 Réconcilier `main` et `dev`
- `dev` contient tout ce que `main` contient, **sauf** `frontend/src/components/ai_assistant/PromptLibrary.jsx` et `prompts.js` (commit `cc995e5`), qui sont déplacés dans `feature/ai_assistant`.
- `backend/app/infrastructure/database/session.py` garde la version de `dev` (elle inclut déjà SSL hors dev + `statement_cache_size=0`).
- `backend/railway.toml` : `preDeployCommand` = `alembic upgrade head && python scripts/create_admin.py` (plus de `|| alembic stamp 0001`).
- `feature/marketing_landing_page` : vérifier si elle contient du travail non mergé ; le noter dans `AVANCEMENT.md` (pas de merge dans E0).

### E0-T2 Isolation des tests backend
- Base SQLite **en mémoire**, schéma recréé par test (ou transaction annulée), aucun fichier `test_lots.db`.
- Fabriques : `make_user(role)`, `make_project()`, `make_lot(project, status, price, surface)`, `make_client()`, `make_notaire()`.
- Fixture `auth_headers(role)` → en-tête `Authorization: Bearer …`.
- Les 15 tests existants passent (aujourd'hui 13 OK + 2 erreurs `UNIQUE constraint failed: users.email`).

### E0-T3 Tests de caractérisation du workflow de statuts
Chaque transition existante testée via l'API (`/api/v1/lots/{id}/transitions/...`) : statut de départ, statut d'arrivée, refus (`BusinessRuleError` → 4xx) depuis un mauvais statut, refus du déblocage par un commercial.

| Route | De → Vers |
|---|---|
| `activate` | creation → available (refus si prix/surface manquants) |
| `start-option` | available → option |
| `cancel-option` | option → available |
| `extend-option` | option / reservation_a_finaliser → idem (date prolongée) |
| `direct-reservation` | available → reservation_a_finaliser |
| `to-reservation` | option → reservation_a_finaliser |
| `refund` | reservation_a_finaliser → available |
| `direct-engage` | available → reservation_engagee |
| `engage` | reservation_a_finaliser → reservation_engagee |
| `solde` | reservation_engagee → reservation_soldee |
| `set-notaire-intent` | reservation_soldee (flag `wants_notaire`) |
| `notaire` (POST) | reservation_soldee → chez_notaire |
| `notaire` (PUT) | chez_notaire (mise à jour infos) |
| `proprietaire` | chez_notaire → chez_proprietaire (`closed_at` renseigné) |
| `block` | available → blocked (`blocked_reason` stocké) |
| `unblock` | blocked → available (manager seulement) |

### E0-T4 Backend propre
- `F821` `UploadFile` (`project_service.py:1426`) corrigé.
- `F841` (3), `B904` (17), `ERA001` (3) corrigés ; `ruff check --fix` sûr appliqué.
- `E402` justifiés (`alembic/env.py`, `session.py`) en `per-file-ignores`.
- `PLR0912` / `PLR0915` / `ARG002` : ignorés globalement **pour l'instant**, à traiter quand un epic touche la fonction (liste des fonctions concernées copiée dans `AVANCEMENT.md` § dette).
- Résultat : `ruff check .` = 0 erreur ; `ruff format --check .` OK.

### E0-T5 Frontend propre et testé
- ESLint : 0 erreur (21 `no-unused-vars`, 2 `react-hooks/refs`, 2 `only-export-components`, 1 `no-undef`, 1 `rules-of-hooks`, 1 `no-prototype-builtins`). Les 22 warnings `exhaustive-deps` sont revus un par un : corrigés, ou désactivés en ligne avec une justification.
- Vitest + React Testing Library + jsdom ; script `npm test`.
- Tests de fumée : `Login`, `ProjectsPage`, `LotDetailModal` (rendu d'un lot `available`), `ToastContext` (portail plein écran).

### E0-T6 CI + docs
- `.github/workflows/ci.yml` sur PR vers `dev` et `main` : backend (ruff, ruff format --check, pytest), frontend (npm ci, lint, test, build).
- `CLAUDE.md` mis à jour (migrations 0001→0016, commandes de test frontend, workflow de statuts, règles de « Terminé »).

## Critères d'acceptance
- [ ] `git log dev..origin/main` ne liste que `cc995e5` (ou rien si fusion) et `PromptLibrary.jsx` est absent de `dev`.
- [ ] `pytest` : 0 échec, 0 erreur, lancé 2 fois de suite sans nettoyage.
- [ ] Toutes les transitions du tableau ont au moins un test « succès » et un test « refus ».
- [ ] `ruff check .` et `npx eslint src` : 0 erreur.
- [ ] `npm test` passe ; `npm run build` passe.
- [ ] La CI passe sur la PR E0.
