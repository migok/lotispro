# E3 — Statuts par projet + états des lieux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centraliser le workflow des statuts de lot (table de transitions unique + historique de chaque changement), rendre `option`, `reservation_a_finaliser` et le bloc « états des lieux » activables par projet, ajouter la transition `option → reservation_engagee` et les 3 statuts d'état des lieux.

**Architecture:** Un module de domaine pur `app/domain/lot_workflow.py` décrit les statuts, leurs groupes et la table des transitions (nom → statuts de départ/arrivée + statut optionnel requis/interdit). Un point de passage unique `LotRepository.change_status(...)` applique tout changement de statut et écrit `lot_status_history` dans la même transaction ; chaque méthode de transition existante l'appelle après avoir appelé `assert_transition_allowed(...)`. Le frontend a un miroir testé de la table (`frontend/src/utils/lotWorkflow.js`) pour n'afficher que les actions permises.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2 ; React 19, Vitest.

**Spec:** [docs/superpowers/specs/epics/E3-statuts-etats-des-lieux.md](../specs/epics/E3-statuts-etats-des-lieux.md)

## Global Constraints

- Branche `feature/e3-statuts-edl` depuis `dev` ; PR vers `dev`.
- **Migrations `0020`, `0021`, `0022`** (les numéros 0018-0020 de la spec ont été pris par E2) ; additives sauf l'élargissement de la contrainte `valid_lot_status` (drop + create, même nom) ; chacune avec `downgrade`. Ne jamais lancer `alembic upgrade` sur la vraie base (seulement `--sql`) ; le contrôleur applique après relecture.
- **Transitions strictes inchangées** pour un projet aux réglages par défaut : les 39+ tests de caractérisation (`app/tests/integration/test_api/test_lot_transitions.py`) restent verts sans modification de leurs assertions.
- `BusinessRuleError` → HTTP 400 ; rôle insuffisant → 403 ; messages en français.
- Défaut de `enabled_optional_statuses` (projets existants et nouveaux) : `["option", "reservation_a_finaliser"]` (EDL désactivé).
- Tests backend dans la venv CI : depuis `backend/`, `SECRET_KEY=ci-dummy-secret-key-for-tests-only-0123456789abcdef <venv-ci python> -m pytest -q` ; `python -m ruff check .` / `format --check`. Frontend : `npx vitest run`, `npx eslint src` (0), `npm run build`.
- Tests écrits **avant** le code (sortie RED consignée dans le rapport).
- Commits conventionnels en anglais + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; jamais d'amend ni de force-push ; ligne de la tâche dans `docs/AVANCEMENT.md` mise à jour dans le même commit.

### Table des transitions (valeurs exactes)

| Nom (`transition`) | Route existante / nouvelle | De | Vers | Condition projet |
|---|---|---|---|---|
| `activate` | `activate` | creation | available | — |
| `start_option` | `start-option` | available | option | `option` actif |
| `cancel_option` | `cancel-option` | option | available | — |
| `extend_option` | `extend-option` | option, reservation_a_finaliser | (inchangé) | — |
| `direct_reservation` | `direct-reservation` | available | reservation_a_finaliser | `reservation_a_finaliser` actif |
| `to_reservation` | `to-reservation` | option | reservation_a_finaliser | `reservation_a_finaliser` actif |
| `refund` | `refund` | reservation_a_finaliser | available | — |
| `direct_engage` | `direct-engage` | available | reservation_engagee | — |
| `engage` | `engage` | reservation_a_finaliser | reservation_engagee | — |
| `option_engage` | **`option-engage`** (nouveau, T3) | option | reservation_engagee | `reservation_a_finaliser` **inactif** |
| `solde` | `solde` | reservation_engagee | reservation_soldee | — |
| `set_notaire_intent` | `set-notaire-intent` | reservation_soldee, edl_programme, edl_realise, edl_finalise | (inchangé) | — |
| `edl_schedule` | **`edl-schedule`** POST (T4) | reservation_soldee | edl_programme | `edl` actif |
| `edl_reschedule` | **`edl-schedule`** PUT (T4) | edl_programme | (inchangé) | — |
| `edl_done` | **`edl-done`** (T4) | edl_programme | edl_realise | — |
| `edl_finalize` | **`edl-finalize`** (T4) | edl_realise | edl_finalise | aucune action `ouverte` (règle service) |
| `notaire` | `notaire` POST | reservation_soldee | chez_notaire | `edl` **inactif** ; `wants_notaire` vrai (existant) |
| `notaire` | `notaire` POST | edl_finalise | chez_notaire | `edl` actif ; `wants_notaire` vrai |
| `notaire_update` | `notaire` PUT | chez_notaire | (inchangé) | — |
| `proprietaire` | `proprietaire` | chez_notaire | chez_proprietaire | — |
| `block` | `block` | tout sauf blocked, chez_proprietaire | blocked | — |
| `unblock` | `unblock` | blocked | available | — |
| `direct_update` | `PUT /lots/{id}` (champ `status`) | creation, available, blocked | creation, available, blocked | — (règles existantes de `update_lot`) |

Groupes : `ALL_STATUSES` (ordre du pipeline de la spec, `blocked` en dernier) ; `OPTIONAL_KEYS = ("option", "reservation_a_finaliser", "edl")` ; `EDL_STATUSES = ("edl_programme", "edl_realise", "edl_finalise")` ; `SOLD_STATUSES = ("reservation_soldee", *EDL_STATUSES, "chez_notaire", "chez_proprietaire")` ; `MANDATORY_STATUSES` = tous sauf `option`, `reservation_a_finaliser` et `EDL_STATUSES`.

Messages : transition depuis un mauvais statut → message existant inchangé ; statut cible désactivé → `"Le statut « {libellé} » est désactivé pour ce projet."` (règle `status_disabled`) ; `option_engage` alors que `reservation_a_finaliser` est actif → `"Passez par « Réservation à finaliser » : l'engagement direct depuis une option n'est possible que si ce statut est désactivé."` (règle `option_engage_not_allowed`) ; `notaire` depuis soldée alors que l'EDL est actif → `"L'état des lieux est activé pour ce projet : programmez-le avant le passage chez le notaire."` (règle `edl_required`) ; désactivation refusée → `"Impossible de désactiver « {libellé} » : lots concernés : {numéros séparés par des virgules}."` (règle `status_in_use`) ; finalisation avec action ouverte → `"Impossible de finaliser : {n} action(s) encore ouverte(s)."` (règle `edl_open_actions`).

## Review Focus

1. **Projet existant après les 3 migrations** — attendu : comportement identique (défaut `["option","reservation_a_finaliser"]`) → tests de caractérisation inchangés et verts à chaque tâche.
2. **Changement de statut oublié** (une méthode qui écrit `status=` sans passer par `change_status`) — attendu : aucune → T1 test « chaque transition réussie crée exactement une ligne d'historique » paramétré sur toutes les routes, + garde statique (test qui échoue si `lot_repo.update(..., status=` ou `release_lot(` apparaît hors `change_status` dans `app/services`).
3. **Désactiver un statut occupé** — attendu : 400 avec la liste des numéros de lots → T2.
4. **EDL : finaliser avec une action ouverte, ou passer chez le notaire depuis soldée quand l'EDL est actif** — attendu : 400 avec les messages exacts → T4.
5. **Tableaux de bord avec des lots en EDL** — attendu : comptés comme vendus, pas d'erreur de schéma → T4 test dashboard stats avec un lot `edl_realise`.

---

### Task 1: Module de workflow + historique des statuts

**Files:**
- Create: `backend/app/domain/lot_workflow.py`
- Create: `backend/alembic/versions/0020_add_lot_status_history.py`
- Modify: `backend/app/infrastructure/database/models.py` (`LotStatusHistoryModel`)
- Modify: `backend/app/infrastructure/database/repositories/lot_repository.py` (`change_status`, `get_status_history`)
- Modify: `backend/app/services/reservation_service.py`, `lot_service.py`, `project_service.py` (activation à l'import CSV) — tous les changements de statut passent par `change_status`
- Modify: `backend/app/api/v1/endpoints/lot_transitions.py` / `lots.py` (passer `current_user.id` là où il manque ; route `GET /api/lots/{lot_id}/status-history`)
- Create: `backend/app/domain/schemas/lot_status_history.py`
- Tests: `backend/app/tests/unit/test_domain/test_lot_workflow.py`, `backend/app/tests/integration/test_api/test_lot_status_history.py`, `backend/app/tests/unit/test_no_direct_status_writes.py`

**Interfaces:**
- Produces (`lot_workflow.py`) : constantes du tableau « Groupes » ; `TRANSITIONS: dict[str, Transition]` (`Transition` = dataclass `name, from_statuses: frozenset[str], to_status: str | None` — `None` = statut inchangé —, `requires_enabled: str | None`, `requires_disabled: str | None`) ; `DEFAULT_ENABLED_OPTIONAL = ("option", "reservation_a_finaliser")` ; `is_status_enabled(enabled_optional: Iterable[str], status: str) -> bool` ; `enabled_statuses(enabled_optional) -> list[str]` (ordre du pipeline) ; `assert_transition_allowed(enabled_optional: Iterable[str], transition: str, from_status: str) -> str` (renvoie le statut d'arrivée ; lève `BusinessRuleError` : statut de départ hors table → `rule="invalid_lot_status"`, conditions projet → règles/messages ci-dessus). Les services **gardent leurs contrôles de statut de départ existants** (messages inchangés, caractérisation verte) et appellent ensuite `assert_transition_allowed` : en pratique, celle-ci ne lève donc que pour les conditions projet ; son contrôle de départ est un filet de sécurité.
- Produces (repository) : `change_status(lot_id: int, new_status: str, *, transition: str, user_id: int | None, reservation_id: int | None = None, clear_reservation: bool = False, **fields) -> LotModel` — lit le statut courant, met à jour (`current_reservation_id=None` si `clear_reservation`), insère `lot_status_history(lot_id, from_status, to_status, transition, user_id, reservation_id, changed_at=utc_now)`, `flush`. Une transition sans changement de statut (`extend_option`, `set_notaire_intent`, `edl_reschedule`, `notaire_update`) **n'écrit pas** d'historique.
- Produces (API) : `GET /api/lots/{lot_id}/status-history` → `list[LotStatusHistoryResponse]` (`id, lot_id, from_status, to_status, transition, user_id, user_name, reservation_id, changed_at`), du plus récent au plus ancien ; même contrôle d'accès que `GET /api/lots/{id}`.

- [ ] **Step 1: Tests** —
  - unitaires `lot_workflow` : chaque ligne de la table (départ valide → statut d'arrivée ; départ invalide → erreur) ; `enabled_statuses(DEFAULT)` = pipeline sans EDL ; `is_status_enabled` pour chaque statut obligatoire = vrai quels que soient les réglages ; ordre de `ALL_STATUSES`.
  - API `test_lot_status_history.py` : paramétré sur les transitions qui changent de statut (activate, start-option, cancel-option, direct-reservation, to-reservation, refund, direct-engage, engage, solde, notaire, proprietaire, block, unblock) → exactement **une** nouvelle ligne avec `from_status`, `to_status`, `transition`, `user_id` corrects ; `extend-option` / `set-notaire-intent` / `notaire` PUT → aucune ligne ; `GET /status-history` ordonné, `user_name` renseigné.
  - garde statique `test_no_direct_status_writes.py` : parcourt `app/services/*.py` et échoue si une ligne contient `status=` dans un appel `lot_repo.update(` ou `lot_repo.release_lot(` (hors commentaires).
- [ ] **Step 2: Lancer → FAIL** (consigner).
- [ ] **Step 3: Implémenter** module, modèle + migration 0020 (table, FK `lots.id` ON DELETE CASCADE, FK `users.id` nullable, index `(lot_id, changed_at)`), `change_status`, recâblage de **tous** les sites (`reservation_service` : start_option_for_lot, cancel_option, available_to_reservation_a_finaliser, available_to_reservation_engagee, option_to_reservation_a_finaliser, finaliser_refund, finaliser_engage, engagee_to_soldee, soldee_to_notaire, notaire_to_proprietaire, block_lot, unblock_lot ; `lot_service.activate_lot`, `update_lot` (statut direct), activation par complétion de prix/surface ; `project_service` activation à l'import CSV), chaque méthode appelant `assert_transition_allowed(DEFAULT_ENABLED_OPTIONAL, ...)` (T2 remplacera par le réglage du projet). `sale_service` écrit `status="sold"` (statut invalide, chemin hérité) : ne pas le recâbler, le signaler dans `docs/AVANCEMENT.md` § Anomalies et l'exclure de la garde statique par un commentaire explicite.
- [ ] **Step 4: Vérifier** — suite complète verte (dont caractérisation inchangée), ruff, `alembic upgrade 0019:0020 --sql`.
- [ ] **Step 5: Commit** — `feat: centralise lot workflow and record status history` (+ AVANCEMENT E3-T1 ✅).

---

### Task 2: Statuts optionnels par projet

**Files:**
- Create: `backend/alembic/versions/0021_add_project_enabled_optional_statuses.py`
- Modify: `models.py` (`ProjectModel.enabled_optional_statuses` : `JSON`, non nul, défaut serveur `'["option","reservation_a_finaliser"]'`), `schemas/project.py`, `project_service.py`, `project_repository.py`, `endpoints/projects.py`
- Modify: `reservation_service.py`, `lot_service.py` (lire le réglage du projet du lot pour `assert_transition_allowed`)
- Tests: `backend/app/tests/integration/test_api/test_project_workflow_settings.py`

**Interfaces:**
- Consumes: T1 (`assert_transition_allowed`, `enabled_statuses`, `OPTIONAL_KEYS`).
- Produces : `ProjectResponse` gagne `enabled_optional_statuses: list[str]` et `enabled_statuses: list[str]` (calculé, ordre du pipeline) ; `PUT /api/projects/{project_id}/workflow` (manager uniquement) corps `{"enabled_optional_statuses": [...]}` (valeurs ⊂ `OPTIONAL_KEYS`, doublons ignorés) → `ProjectResponse` ; refus 400 `status_in_use` si on désactive une clé dont un statut est porté par au moins un lot du projet (pour `edl` : les 3 statuts EDL) ; `make_project` (fabrique) accepte `enabled_optional_statuses`.

- [ ] **Step 1: Tests** — défaut à la création et sur un projet existant ; PUT par commercial → 403 ; valeur inconnue → 422 ; désactiver `option` avec un lot en option → 400 message exact listant les numéros ; désactiver puis `start-option` → 400 `status_disabled` ; `reservation_a_finaliser` désactivé → `direct-reservation` et `to-reservation` → 400 ; `enabled_statuses` correct pour 3 combinaisons ; projet par défaut → transitions inchangées (rejouer 3 transitions de la caractérisation).
- [ ] **Step 2: FAIL** · **Step 3: Implémenter** (migration 0021 : `add_column` avec `server_default`, downgrade `drop_column`) · **Step 4: Vérifier** (+ `alembic upgrade 0020:0021 --sql`) · **Step 5: Commit** — `feat: per-project optional lot statuses` (+ AVANCEMENT E3-T2 ✅).

---

### Task 3: Transition `option → reservation_engagee`

**Files:**
- Modify: `backend/app/domain/schemas/reservation.py` (`OptionEngageData`), `reservation_service.py` (`option_to_reservation_engagee`), `endpoints/lot_transitions.py` (`POST /{lot_id}/transitions/option-engage`)
- Tests: `backend/app/tests/integration/test_api/test_option_engage.py`

**Interfaces:**
- Produces : `OptionEngageData` = champs de `DirectToEngageeData` **sans** `client_id` (premier versement `guarantee_amount`, `payment_type`, `notes`, `sale_price`, `promotion_paid_timing`, `promotion_received`, `payment_plan`) ; effets identiques à `available_to_reservation_engagee` appliqués à la réservation d'option existante (même client, même `reserved_by_user_id`, échéancier créé de la même façon, historique `option_engage`) ; contrôle de propriétaire identique à `to_reservation` (commercial non propriétaire → 400 `insufficient_permissions`).

- [ ] **Step 1: Tests** — projet avec `reservation_a_finaliser` désactivé : option → `option-engage` → `reservation_engagee`, réservation active conservée (même id, même client), échéancier créé si `payment_plan`, ligne d'historique `option_engage` ; projet par défaut → 400 `option_engage_not_allowed` (message exact) ; mauvais statut → 400 ; autre commercial → 400 `insufficient_permissions`.
- [ ] **Step 2: FAIL** · **Step 3: Implémenter** (factoriser avec `available_to_reservation_engagee` plutôt que copier) · **Step 4: Vérifier** · **Step 5: Commit** — `feat: allow option to engaged reservation when finalisation step is disabled` (+ AVANCEMENT E3-T3 ✅).

---

### Task 4: États des lieux (backend) + statuts EDL partout

**Files:**
- Create: `backend/alembic/versions/0022_add_etats_des_lieux.py`
- Modify: `models.py` (`EtatDesLieuxModel`, `EdlActionModel`, contrainte `valid_lot_status` à 12 valeurs), `schemas/lot.py` (les 3 `Literal` de statuts), `schemas/dashboard.py`, `lot_repository.py` (compteurs), `project_repository.py` et `dashboard_service.py` (utiliser `SOLD_STATUSES`), `endpoints/lots.py` (filtre de statut)
- Create: `backend/app/domain/schemas/etat_des_lieux.py`, `backend/app/infrastructure/database/repositories/etat_des_lieux_repository.py`, `backend/app/services/etat_des_lieux_service.py`, routes dans `endpoints/lot_transitions.py` (+ `endpoints/lots.py` pour les actions et `GET /api/lots/{id}/edl`)
- Modify: `reservation_service.py` (`set_notaire_intent` élargi aux statuts EDL ; `soldee_to_notaire` accepte `edl_finalise` quand EDL actif ; refus `edl_required`)
- Modify: `dashboard_service.get_notaire_alerts` (inclure `edl_finalise` avec `wants_notaire`)
- Tests: `backend/app/tests/integration/test_api/test_etats_des_lieux.py`, `backend/app/tests/unit/test_domain/test_status_literals.py`

**Interfaces:**
- Produces (tables) : `etats_des_lieux(id, lot_id FK, reservation_id FK, scheduled_at timestamptz NOT NULL, intervenant varchar(200) NOT NULL, schedule_note text, done_at timestamptz, done_note text, finalized_at timestamptz, created_at, updated_at)` ; `edl_actions(id, etat_des_lieux_id FK ON DELETE CASCADE, description varchar(500) NOT NULL, responsable varchar(200), status varchar(10) NOT NULL default 'ouverte' CHECK IN ('ouverte','faite'), done_at timestamptz, created_at, updated_at)`.
- Produces (API, toutes `CurrentUser` sauf mention) :
  - `POST /api/lots/{id}/transitions/edl-schedule` `{scheduled_at, intervenant, note?}` → soldée → `edl_programme` (crée l'EDL lié à la réservation courante).
  - `PUT /api/lots/{id}/transitions/edl-schedule` (même corps) → reprogramme (statut inchangé).
  - `POST /api/lots/{id}/transitions/edl-done` `{done_at, note?, actions: [{description, responsable?}]}` → `edl_realise`.
  - `POST /api/lots/{id}/edl/actions` `{description, responsable?}` ; `PUT /api/lots/{id}/edl/actions/{action_id}` `{description?, responsable?, status?}` (`status="faite"` renseigne `done_at`, `"ouverte"` le vide) ; `DELETE …/{action_id}` — autorisés seulement en `edl_realise`.
  - `POST /api/lots/{id}/transitions/edl-finalize` → `edl_finalise` (400 `edl_open_actions` si action ouverte).
  - `GET /api/lots/{id}/edl` → `EtatDesLieuxResponse` (champs + `actions: list[EdlActionResponse]`) ou 404 si aucun.
- Produces : `LotWithDetails` gagne `edl_scheduled_at`, `edl_intervenant`, `edl_open_actions_count` (pour les cartes / le modal) ; `DashboardCounts` gagne `edl_programme`, `edl_realise`, `edl_finalise` (0 par défaut).

- [ ] **Step 1: Tests** — parcours complet sur un projet EDL actif : soldée → edl-schedule → reschedule → edl-done (2 actions) → finalize refusé (message exact) → action 1 et 2 `faite` → finalize OK → set-notaire-intent → notaire → proprietaire, avec une ligne d'historique par changement de statut ; EDL inactif → edl-schedule 400 `status_disabled` ; EDL actif → notaire depuis soldée 400 `edl_required` ; actions modifiables seulement en `edl_realise` ; `GET /edl` ; dashboard stats avec un lot `edl_realise` → compté vendu, 200 ; test des `Literal` de `schemas/lot.py` = `ALL_STATUSES` ; désactiver `edl` avec un lot en `edl_programme` → 400 (réutilise T2).
- [ ] **Step 2: FAIL** · **Step 3: Implémenter** (migration 0022 : 2 tables + `drop_constraint`/`create_check_constraint("valid_lot_status", …12 valeurs…)` ; downgrade : refuser proprement s'il existe des lots en statut EDL — `op.execute` d'un contrôle qui lève — puis rétablir la contrainte à 9 valeurs et supprimer les tables) · **Step 4: Vérifier** (+ `alembic upgrade 0021:0022 --sql`) · **Step 5: Commit** — `feat: etats des lieux workflow and EDL statuses` (+ AVANCEMENT E3-T4 ✅).

---

### Task 5: Frontend — réglages, actions permises, écrans EDL

**Files:**
- Create: `frontend/src/utils/lotWorkflow.js` (+ `__tests__/lotWorkflow.test.js`)
- Modify: `frontend/src/utils/constants.js` (libellés `edl_programme` « EDL programmé », `edl_realise` « EDL réalisé », `edl_finalise` « EDL finalisé » ; couleurs CSS + hex `#38bdf8`, `#0ea5e9`, `#0284c7` ; `ACTIVE_LOT_STATUSES` inclut les 3), `frontend/src/styles.css` (variables couleur), toutes les autres énumérations de statuts (`Dashboard.jsx`, `ProjectDetailPage.jsx` filtres/légende, `LotDetailModal.jsx`)
- Modify: `ProjectDetailPage.jsx` → `ParametresTab` : section « Étapes du workflow » (3 cases : Option, Réservation à finaliser, États des lieux ; manager seulement ; appel `PUT /api/projects/{id}/workflow` ; toast succès ; erreur 400 affichée telle quelle (liste des lots))
- Modify: `LotDetailModal.jsx` : boutons d'action filtrés par `allowedTransitions(lot.status, project.enabled_optional_statuses)` ; action « Engager » depuis option quand `option_engage` est permise (réutilise le formulaire d'engagement direct, sans sélection de client) ; panneaux EDL : programmer / reprogrammer (date-heure, intervenant, note), réaliser (date, note, liste d'actions ajoutables), suivi des actions (cocher faite, ajouter, supprimer) en `edl_realise`, bouton « Finaliser » désactivé avec le nombre d'actions ouvertes ; affichage des infos EDL dans les statuts EDL ; passage notaire depuis `edl_finalise`.
- Tests: `lotWorkflow.test.js`, `ProjectDetailPage` (réglages), `LotDetailModal` (actions filtrées + EDL)

**Interfaces:**
- Produces (`lotWorkflow.js`) : `ALL_STATUSES`, `EDL_STATUSES`, `TRANSITIONS` (miroir exact de la table du backend), `allowedTransitions(status, enabledOptional) -> string[]` (noms de transitions), `enabledStatuses(enabledOptional) -> string[]`.

- [ ] **Step 1: Tests** — `allowedTransitions` pour chaque statut × 3 réglages (défaut ; sans option ; sans à-finaliser + EDL) ; un test qui compare `TRANSITIONS` à un snapshot JSON de la table backend généré par un test backend (`backend/app/tests/unit/test_domain/test_lot_workflow.py::test_export_snapshot` écrit `frontend/src/utils/__tests__/lotWorkflow.snapshot.json` — ou, plus simple, la table est dupliquée et un test vérifie 10 cas clés : au choix de l'implémenteur, justifié dans le rapport) ; modal : lot `available` sur projet sans option → pas de bouton « Démarrer une option » ; lot `option` sur projet sans à-finaliser → bouton « Engager » ; lot `edl_realise` avec 1 action ouverte → « Finaliser » désactivé + « 1 action ouverte » ; réglages : décocher puis enregistrer → `PUT` avec la bonne liste ; erreur 400 → message affiché.
- [ ] **Step 2: FAIL** · **Step 3: Implémenter** · **Step 4: Vérifier** (vitest, eslint 0, build) · **Step 5: Commit** — `feat: workflow settings, filtered lot actions and EDL screens` (+ AVANCEMENT E3-T5 ✅, E3 5 / 5).
