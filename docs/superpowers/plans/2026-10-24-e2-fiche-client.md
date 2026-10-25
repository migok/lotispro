# E2 — 👤 #7 Fiche client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fiche client complète (identité ordonnée, adresses Maroc / étranger + adresse d'acte, canal d'acquisition, préférences de notification), validée côté serveur et côté client, avec détection de doublons, et utilisée partout où l'on crée ou édite un client.

**Architecture:** Migration **additive** 0017 (aucun renommage ni suppression) ; le modèle mappe l'attribut `address_morocco` sur la colonne existante `address` ; `name` reste la colonne d'affichage, recalculée « Prénom Nom ». Règles de validation centralisées dans un module de domaine (`app/domain/client_profile.py`) appelées par les schémas (création) et le service (mise à jour sur l'état fusionné). Côté frontend, un composant unique `ClientForm` remplace les trois formulaires existants.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2 ; React 19, Vitest + RTL.

**Spec:** [docs/superpowers/specs/epics/E2-fiche-client.md](../specs/epics/E2-fiche-client.md)

## Global Constraints

- Branche `feature/e2-fiche-client` ; PR vers `dev`.
- Migration 0017 **additive** : `ADD COLUMN` + backfill + contraintes CHECK ; ni `DROP` ni `RENAME` de colonne existante ; `downgrade` supprime exactement ce qu'`upgrade` ajoute.
- `clients.name` conservé, recalculé à chaque écriture = `compose_client_name(first_name, last_name)`.
- `client_type` (propriétaire / revendeur / investisseur / autre) conservé tel quel.
- Erreurs : validation → HTTP 422 `{"error": "VALIDATION_ERROR", "details": [{"field", "message"}]}` (Pydantic ou `app.core.exceptions.ValidationError(message, field=...)`) ; `NotFoundError` → 404.
- Libellés UI et messages d'erreur en français ; valeurs techniques en anglais/snake_case.
- Tests de caractérisation des transitions (`test_lot_transitions.py`) verts à chaque tâche.
- Commits conventionnels en anglais + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; ligne de la tâche dans `docs/AVANCEMENT.md` mise à jour dans le même commit.

### Valeurs exactes (spec)

| Élément | Valeur |
|---|---|
| Canaux d'acquisition | `smap`, `bureau_vente`, `reseaux_sociaux`, `recommandation`, `samsar` |
| Libellés canaux | SMAP · Bureau de vente · Réseaux sociaux · Recommandé par · Samsar |
| Adresse d'acte | `morocco` \| `abroad` |
| Canaux de notification | `email`, `sms`, `whatsapp` |
| Regex CIN (après majuscules, sans espaces) | `^[A-Z]{1,2}\d{1,6}$` |
| Téléphone normalisé (E.164) | `^\+[1-9]\d{7,14}$` ; `0XXXXXXXXX` (10 chiffres) → `+212XXXXXXXXX` ; préfixe `00` → `+` ; espaces, points, tirets retirés |
| Message CIN | `Format CIN invalide (ex. AB123456)` |
| Message téléphone | `Numéro invalide (format international, ex. +212612345678)` |

## Review Focus

1. **Client existant (seulement `name`, sans prénom ni canal) ouvert puis enregistré** — attendu : fiche affichée, formulaire d'édition pré-rempli (`last_name` = ancien nom), champs obligatoires manquants signalés, pas de crash → Task 1 `test_legacy_client_response_has_new_fields_null`, Task 3 test `legacy client opens in edit form`.
2. **Téléphones réels** (`06 12 34 56 78`, `0612-345-678`, `+33 6 12 34 56 78`, `00212612345678`) — attendu : normalisés, ou refus clair → Task 2 tests paramétrés.
3. **Effacer un champ optionnel** (nom de jeune fille, adresse étranger) en édition — attendu : la valeur devient `null` (aujourd'hui `BaseRepository.update` ignore les `None`) → Task 1 `test_update_can_clear_optional_field`.
4. **Doublon de soi-même** en édition — attendu : pas d'alerte sur sa propre fiche → Task 2 `test_duplicates_excludes_given_id`, Task 3.
5. **CIN saisi en minuscules ou avec espaces** — attendu : normalisé `AB123456`, doublon détecté quand même → Task 2.

---

### Task 1: Migration 0017, modèle, schémas, service d'écriture

**Files:**
- Create: `backend/alembic/versions/0017_extend_client_profile.py`
- Create: `backend/app/domain/client_profile.py`
- Modify: `backend/app/infrastructure/database/models.py` (`ClientModel`)
- Modify: `backend/app/domain/schemas/client.py`
- Modify: `backend/app/services/client_service.py`
- Modify: `backend/app/infrastructure/database/repositories/client_repository.py` (dict de `get_details` : nouveaux champs)
- Modify: `backend/app/tests/factories.py` (`make_client` : `last_name` par défaut)
- Create: `backend/app/tests/integration/test_api/test_clients.py`
- Modify: `.github/workflows/ci.yml` (job `migrations`)

**Interfaces:**
- Produces (`app/domain/client_profile.py`) :
  - `ACQUISITION_CHANNELS: tuple[str, ...]`, `ACTE_ADDRESS_CHOICES = ("morocco", "abroad")`, `NOTIFICATION_CHANNELS = ("email", "sms", "whatsapp")`
  - `compose_client_name(first_name: str | None, last_name: str | None) -> str` — `"Prénom Nom"` sans espaces superflus ; seulement le nom si pas de prénom.
- Produces (`ClientModel`) : attributs `last_name`, `first_name`, `maiden_name` (String 100), `whatsapp` (String 20), `address_morocco = mapped_column("address", String(500))`, `address_abroad` (String 500), `acte_address` (String 10), `acquisition_channel` (String 20), `acquisition_referrer` (String 200), `acquisition_date` (Date), `notification_channels` (`JSON`, nullable) ; CHECK `valid_acte_address` et `valid_acquisition_channel` (NULL autorisé).
- Produces (schémas) : `ClientCreate` (obligatoires : `last_name`, `first_name`, `phone`, `acquisition_channel`), `ClientUpdate` (tout optionnel), `ClientResponse` (tous les champs + `name`, + `address_morocco`).
- Produces (service) : `ClientService._to_response(client: ClientModel) -> ClientResponse` (remplace les 4 constructions dupliquées) ; la mise à jour applique `data.model_dump(exclude_unset=True)` en écrivant aussi les `None` explicites (nouvelle méthode `ClientRepository.update_fields(client_id: int, fields: dict) -> ClientModel`).

- [ ] **Step 1: Écrire les tests** (`test_clients.py`, via l'API `/api/clients`, `auth_headers(commercial)`) :
  - `test_create_client_with_full_profile` : POST complet (`last_name="Benali"`, `first_name="Fatima"`, `maiden_name="Alaoui"`, `phone="+212612345678"`, `whatsapp`, `email`, `address_morocco`, `address_abroad`, `acte_address="abroad"`, `acquisition_channel="samsar"`, `acquisition_referrer="Karim"`, `acquisition_date="2026-10-01"`, `notification_channels=["email","whatsapp"]`) → 201 ; réponse contient chaque valeur ; `name == "Fatima Benali"`.
  - `test_create_client_missing_required_fields` : POST `{}` → 422 ; `details[*].field` contient `last_name`, `first_name`, `phone`, `acquisition_channel`.
  - `test_create_client_rejects_unknown_channel` : `acquisition_channel="tv"` → 422.
  - `test_legacy_client_response_has_new_fields_null` : `make_client(name="Ancien Client", last_name=None)` → GET → `name == "Ancien Client"`, `first_name is None`, `acquisition_channel is None`, 200.
  - `test_update_recomputes_name` : PUT `{"first_name": "Amine"}` sur un client `last_name="Benali"` → `name == "Amine Benali"`.
  - `test_update_can_clear_optional_field` : client avec `maiden_name="X"` → PUT `{"maiden_name": null}` → GET → `maiden_name is None`.
  - `test_details_include_profile_fields` : GET `/api/clients/{id}/details` → contient `acquisition_channel`, `address_abroad`, `acte_address`.
- [ ] **Step 2: Lancer → FAIL** (`cd backend && python -m pytest app/tests/integration/test_api/test_clients.py -v`).
- [ ] **Step 3: Implémenter** module de domaine, modèle, schémas, service (`_to_response`, création avec `name` calculé, mise à jour `exclude_unset` + `update_fields`), dict `get_details`, fabrique (`make_client` : `last_name` défaut = `name`).
- [ ] **Step 4: Migration 0017** (`revision="0017"`, `down_revision="0016"`) : `add_column` ×10 (`address` existant **non touché**) ; `UPDATE clients SET last_name = name WHERE last_name IS NULL` ; `create_check_constraint("valid_acte_address", "clients", "acte_address IS NULL OR acte_address IN ('morocco','abroad')")` et `valid_acquisition_channel` (5 valeurs) ; `create_index("ix_clients_last_name", ...)`. `downgrade` : supprime index, contraintes, colonnes ajoutées.
- [ ] **Step 5: Job CI `migrations`** dans `.github/workflows/ci.yml` : service `postgres:16` (user/password/db `lotis`), env `DATABASE_URL=postgresql+asyncpg://lotis:lotis@localhost:5432/lotis`, `ENVIRONMENT=development`, `SECRET_KEY` factice ; étapes : `pip install -e ".[dev]"`, `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head`.
- [ ] **Step 6: Vérifier** — `python -m pytest -q` (tout vert), `python -m ruff check .`, `python -m ruff format --check .`, YAML valide.
- [ ] **Step 7: Commit** — `feat: extend client profile model, schemas and migration 0017` (+ AVANCEMENT E2-T1 ✅).

---

### Task 2: Validation et doublons

**Files:**
- Modify: `backend/app/domain/client_profile.py`
- Modify: `backend/app/domain/schemas/client.py` (validators)
- Modify: `backend/app/services/client_service.py`
- Modify: `backend/app/infrastructure/database/repositories/client_repository.py`
- Modify: `backend/app/api/v1/endpoints/clients.py`
- Create: `backend/app/tests/unit/test_domain/test_client_profile.py`
- Modify: `backend/app/tests/integration/test_api/test_clients.py`

**Interfaces:**
- Consumes: Task 1.
- Produces (`client_profile.py`) :
  - `normalize_cin(value: str | None) -> str | None` — majuscules, espaces retirés ; `ValueError(<Message CIN>)` si la regex ne passe pas ; `None`/`""` → `None`.
  - `normalize_phone(value: str | None) -> str | None` — règles du tableau ; `ValueError(<Message téléphone>)`.
  - `validate_client_profile(state: dict) -> dict` — vérifie l'état complet et renvoie l'état éventuellement complété ; lève `app.core.exceptions.ValidationError(message, field=...)` sur la première règle violée :
    1. `last_name`, `first_name`, `phone`, `acquisition_channel` non vides (`"Champ obligatoire"`) ;
    2. `acquisition_channel in ("recommandation", "samsar")` → `acquisition_referrer` requis (`"Indiquez qui"`) ;
    3. `acquisition_channel == "samsar"` → `acquisition_date` requis (`"Indiquez quand"`) ;
    4. les deux adresses remplies → `acte_address` requis (`"Choisissez l'adresse utilisée pour les actes"`) ;
    5. une seule adresse remplie et `acte_address` vide → `acte_address` déduit (`morocco` ou `abroad`) ;
    6. `acte_address` pointe vers une adresse vide → erreur sur `acte_address`.
- Produces (repository) : `find_duplicates(cin: str | None, email: str | None, exclude_id: int | None) -> list[ClientModel]` — CIN comparé normalisé, email insensible à la casse.
- Produces (API) : `GET /api/clients/duplicates?cin=&email=&exclude_id=` → `list[ClientResponse]` (route déclarée **avant** `/{client_id}`).

- [ ] **Step 1: Tests unitaires** (`test_client_profile.py`) :
  - `normalize_cin` : `"ab 123456"` → `"AB123456"` ; `"A1"` → `"A1"` ; `"123456"`, `"ABC12"`, `"AB1234567"` → `ValueError`.
  - `normalize_phone` paramétré : `"06 12 34 56 78"`→`"+212612345678"` ; `"0612-345-678"`→`"+212612345678"` ; `"+33 6 12 34 56 78"`→`"+33612345678"` ; `"00212612345678"`→`"+212612345678"` ; `"12345"`, `"abc"` → `ValueError`.
  - `validate_client_profile` : un test par règle 1-6 (champ fautif attendu dans `exc.field`).
- [ ] **Step 2: Tests API** (`test_clients.py`) : création avec CIN `"ab 123456"` → réponse `"AB123456"` ; téléphone invalide → 422 `field` se terminant par `phone` ; samsar sans date → 422 `acquisition_date` ; deux adresses sans `acte_address` → 422 ; mise à jour d'un client legacy sans renseigner `first_name` → 422 `first_name` ; `test_duplicates_by_cin_and_email` (casse/espaces différents → trouvé) ; `test_duplicates_excludes_given_id`.
- [ ] **Step 3: Lancer → FAIL.**
- [ ] **Step 4: Implémenter** : `field_validator` sur `cin`, `phone`, `whatsapp` (création et mise à jour) appelant les normaliseurs ; `model_validator(mode="after")` sur `ClientCreate` appelant `validate_client_profile` (convertir la `ValidationError` en `ValueError` portant le champ, ou valider dans le service — au choix, mais la réponse doit avoir `details[0].field` = le champ) ; mise à jour : le service fusionne l'état existant + `exclude_unset` puis appelle `validate_client_profile` avant d'écrire ; repository + endpoint doublons.
- [ ] **Step 5: Vérifier** — suite complète verte, ruff propre.
- [ ] **Step 6: Commit** — `feat: validate client profile and detect duplicates` (+ AVANCEMENT E2-T2 ✅).

---

### Task 3: Formulaire client unique (frontend)

**Files:**
- Modify: `frontend/src/utils/api.js` (l'`Error` levée porte `.status` et `.details`)
- Create: `frontend/src/utils/clientProfile.js`
- Create: `frontend/src/components/clients/ClientForm.jsx`
- Create: `frontend/src/components/clients/__tests__/ClientForm.test.jsx`
- Modify: `frontend/src/components/ClientsPage.jsx` (modal de création → `ClientForm`)
- Modify: `frontend/src/components/ClientDetailPage.jsx` (édition → `ClientForm`)
- Modify: `frontend/src/components/LotDetailModal.jsx` (`AddClientPanel` → `ClientForm` en mode compact)

**Interfaces:**
- Consumes: API des Tasks 1-2 (`POST/PUT /api/clients`, `GET /api/clients/duplicates`).
- Produces (`utils/clientProfile.js`) : `ACQUISITION_CHANNEL_LABELS` (objet valeur → libellé du tableau), `NOTIFICATION_CHANNEL_LABELS` (`email`→`Email`, `sms`→`SMS`, `whatsapp`→`WhatsApp`), `normalizeCin(v)`, `normalizePhone(v)` (mêmes règles que le backend, renvoient `{ value, error }`), `validateClientForm(values) -> { [field]: message }` (règles 1-6 de Task 2, mêmes messages), `fieldErrorsFromApi(error) -> { [field]: message }` (dernier segment de `details[].field`).
- Produces (`ClientForm`) : `<ClientForm initialValues? onSubmit={(payload) => Promise<client>} onCancel? submitLabel? compact? excludeId? />` — `payload` = champs de l'API (vides → `null`) ; affiche les erreurs serveur sous les champs ; ne gère pas le toast (l'appelant le fait).

- [ ] **Step 1: Tests** (`ClientForm.test.jsx`, `renderWithProviders`) :
  - `renders fields in spec order` : libellés dans l'ordre Nom*, Nom de jeune fille, Prénom*, CIN, Téléphone*, WhatsApp, Email, Adresse Maroc, Adresse étranger.
  - `shows referrer for recommandation and referrer+date for samsar`.
  - `asks acte address only when both addresses are filled`.
  - `prefills whatsapp from phone` (case « Même numéro que le téléphone » cochée par défaut si WhatsApp vide).
  - `blocks submit and shows required errors` (onSubmit non appelé).
  - `maps server field errors under fields` (onSubmit rejette une erreur avec `details: [{field: "body.cin", message: "Format CIN invalide (ex. AB123456)"}]`).
  - `shows non-blocking duplicate warning with link` (`apiGet` simulé → `[{id: 7, name: "Fatima Benali"}]` ; lien `/clients/7` ; le bouton Enregistrer reste actif).
  - `legacy client opens in edit form` (`initialValues` avec `last_name` seulement → Prénom et Canal signalés à l'envoi).
- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter** `api.js`, `clientProfile.js`, `ClientForm` (sections Identité / Coordonnées / Adresses / Canal d'acquisition / Préférences de notification ; obligatoires marqués `*` ; vérification de doublons au `blur` de CIN et Email, avec `exclude_id`).
- [ ] **Step 4: Brancher** les trois écrans sur `ClientForm` et supprimer leurs anciens états de formulaire (`form`, `editForm`, `newClient`, `AddClientPanel`) ; toast `Client créé avec succès` / `Client mis à jour` chez l'appelant.
- [ ] **Step 5: Vérifier** — `npx vitest run`, `npx eslint src` (0), `npm run build`.
- [ ] **Step 6: Commit** — `feat: add shared client form with validation and duplicate check` (+ AVANCEMENT E2-T3 ✅).

---

### Task 4: Affichage, recherche, adresse d'acte dans les documents

**Files:**
- Modify: `backend/app/domain/client_profile.py` (`acte_address_of`)
- Modify: `backend/app/infrastructure/database/repositories/client_repository.py` (recherche)
- Modify: `backend/app/infrastructure/database/repositories/reservation_repository.py:141` (`client_address`)
- Modify: `frontend/src/components/ClientDetailPage.jsx` (affichage des nouveaux champs)
- Modify: `frontend/src/components/ClientsPage.jsx` (recherche locale + carte client)
- Tests: `backend/app/tests/unit/test_domain/test_client_profile.py`, `backend/app/tests/integration/test_api/test_clients.py`, `frontend/src/components/__tests__/ClientDetailPage.test.jsx`

**Interfaces:**
- Produces: `acte_address_of(client) -> str | None` — `address_abroad` si `acte_address == "abroad"`, `address_morocco` si `"morocco"`, sinon la seule adresse remplie, sinon `None`.

- [ ] **Step 1: Tests** :
  - unitaire `acte_address_of` (4 cas) ;
  - API `test_search_by_first_name_and_email` (`GET /api/clients?search=fatima` et `?search=@exemple.ma`) ;
  - `test_reservation_details_use_acte_address` : client `acte_address="abroad"` avec réservation (`make_*` + transition `direct-reservation`) → `GET /api/reservations/{id}` détails ou le dict `reservation_repository.get_details` → `client_address == address_abroad` ;
  - frontend `ClientDetailPage` : affiche « Canal : Samsar — Karim (01/10/2026) » et les adresses avec l'indication « utilisée pour les actes ».
- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter** : recherche backend sur `name`, `first_name`, `last_name`, `maiden_name`, `phone`, `whatsapp`, `cin`, `email` ; `client_address` = `acte_address_of(client)` ; fiche client : sections Identité, Coordonnées, Adresses (badge « Actes »), Canal, Préférences ; liste : recherche locale sur les mêmes champs.
- [ ] **Step 4: Vérifier** — suites backend + frontend vertes, lint 0, build OK.
- [ ] **Step 5: Commit** — `feat: show full client profile and use acte address in documents` (+ AVANCEMENT E2-T4 ✅, ligne E2 de la vue d'ensemble).

---

### Task 5: Ville des adresses, adresse obligatoire, notice « acte » (demande utilisateur du 2026-10-25, recette)

**Décisions utilisateur :** au moins une adresse (Maroc ou étranger) est obligatoire ; chaque adresse a une **ville** ; une notice indique que l'adresse choisie figurera sur les actes.

**Files:**
- Create: `backend/alembic/versions/0018_add_client_cities.py` (0017 est déjà appliquée sur Supabase : ne pas la modifier)
- Modify: `backend/app/infrastructure/database/models.py` (`ClientModel.city_morocco`, `city_abroad` — `String(100)`, nullable)
- Modify: `backend/app/domain/client_profile.py` (`validate_client_profile` règles 7-8, `acte_address_of`)
- Modify: `backend/app/domain/schemas/client.py` (champs `city_morocco`, `city_abroad` dans Create / Update / Response)
- Modify: `backend/app/infrastructure/database/repositories/client_repository.py` (dict détails ; recherche inclut les villes)
- Modify: `backend/app/api/error_handlers.py` (message de haut niveau des 422 : `"Request validation failed"` → `"Certains champs sont invalides"`)
- Modify: `frontend/src/utils/clientProfile.js`, `frontend/src/components/clients/ClientForm.jsx`, `frontend/src/components/ClientDetailPage.jsx`
- Tests: `backend/app/tests/unit/test_domain/test_client_profile.py`, `backend/app/tests/integration/test_api/test_clients.py`, `backend/app/tests/unit/test_client_model.py`, `frontend/src/components/clients/__tests__/ClientForm.test.jsx`, `frontend/src/utils/__tests__/clientProfile.test.js`

**Règles ajoutées à `validate_client_profile` (après la règle 1, avant les règles d'adresse) :**
- Règle 7 : aucune adresse remplie → `ValidationError("Renseignez au moins une adresse (Maroc ou étranger)", field="address_morocco")`.
- Règle 8 : `address_morocco` remplie et `city_morocco` vide → `"Indiquez la ville"` sur `city_morocco` ; idem `address_abroad` / `city_abroad`.

**`acte_address_of(client)`** renvoie désormais `"<adresse>, <ville>"` (la ville seule est omise si vide, pour les anciennes fiches).

**UI (`ClientForm`)** — ordre de la section Adresses : Adresse Maroc · Ville (Maroc) · Adresse à l'étranger · Ville (étranger) · choix de l'adresse d'acte (si les deux) ; la ville est marquée `*` dès que son adresse est remplie ; libellé de section « Adresses * (au moins une) ». **Notice** sous la section, toujours visible : `ℹ L'adresse utilisée pour les actes figurera sur l'acte de réservation et l'acte final.` ; quand l'adresse d'acte est déterminée, ajouter la ligne `Adresse imprimée : <adresse>, <ville>`. Mêmes messages côté client que côté serveur.

**Fiche (`ClientDetailPage`)** : chaque adresse affichée avec sa ville ; badge « Actes » inchangé.

- [ ] **Step 1: Tests** — unitaires règles 7 et 8 (champ + message exacts) et `acte_address_of` avec ville ; API : création sans aucune adresse → 422 `address_morocco` + message ; adresse étrangère sans ville → 422 `city_abroad` ; création complète → villes renvoyées ; `GET /api/clients?search=<ville>` trouve le client ; PDF/réservation : `client_address == "4 rue des murgers, Paris"` ; message de haut niveau d'un 422 = `"Certains champs sont invalides"` ; garde de modèle : longueur 100 des deux villes ; frontend : ordre des champs, ville obligatoire conditionnelle, erreur « au moins une adresse », notice visible, ligne « Adresse imprimée : … ».
- [ ] **Step 2: Lancer → FAIL** (consigner la sortie RED).
- [ ] **Step 3: Implémenter** migration 0018 (`down_revision="0017"`, deux `add_column`, downgrade symétrique), modèle, schémas, règles, `acte_address_of`, recherche, handler, UI.
- [ ] **Step 4: Vérifier** — backend (venv CI), ruff, `alembic upgrade 0017:0018 --sql` ; frontend vitest, eslint 0, build.
- [ ] **Step 5: Commit** — `feat: require an address, add cities and acte notice` (+ AVANCEMENT : ligne E2-T5 ajoutée ✅).
