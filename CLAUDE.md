# LotisPro - Real Estate Lot Management

Full-stack web application for managing real estate projects, lots, reservations, and sales.

- **Backend:** FastAPI + SQLAlchemy (async) + PostgreSQL/SQLite
- **Frontend:** React 19 + Vite + Leaflet (maps)
- **Storage:** Supabase (GeoJSON files)
- **Auth:** JWT with RBAC (manager > commercial > client)

---

## Project Structure

```
lot_webapp/
├── backend/          # FastAPI REST API (Python 3.13)
│   ├── app/
│   │   ├── api/v1/endpoints/   # Route handlers (16 modules)
│   │   ├── core/               # Config, security, logging, middlewares
│   │   ├── domain/             # Schemas (Pydantic) + interfaces
│   │   ├── infrastructure/     # DB models, repositories, Supabase storage
│   │   └── services/           # Business logic (15 services)
│   ├── alembic/      # DB migrations (0001 → 0016)
│   └── scripts/      # Utility scripts (create_admin.py)
├── .github/workflows/ci.yml   # CI (backend ruff + pytest, frontend eslint + vitest + build)
├── docs/AVANCEMENT.md         # Suivi de la roadmap (epic → tâche → statut → issue → PR)
├── frontend/         # React SPA
│   └── src/
│       ├── components/         # React components + useTheme.js hook
│       ├── contexts/           # AuthContext.jsx, ToastContext.jsx (providers only) + authHooks.js (useAuth), toastHooks.js (useToast)
│       ├── services/           # API service layer
│       └── utils/              # api.js, config.js, constants.js
└── CLAUDE.md
```

---

## Development Setup

### Backend

```bash
cd backend

# Install dependencies
pip install -e ".[dev]"

# Copy and configure environment
cp .env.example .env

# Run with SQLite (development default)
uvicorn app.main:app --reload --port 8000

# Run with Docker + PostgreSQL
docker-compose up

# Run with Supabase
docker-compose -f docker-compose.supabase.yml up
```

API available at `http://localhost:8000`
Swagger docs at `http://localhost:8000/docs` (development only)

### Frontend

```bash
cd frontend
npm install
npm run dev   # Starts at http://localhost:5173
```

---

## Key Commands

### Backend

```bash
# Tests (pytest, in-memory SQLite per test, no DB service needed;
# factories in app/tests/factories.py). CI runs: python -m pytest -q
# `SECRET_KEY` must be set (via .env or environment) for Settings to load.
pytest

# Linting (CI runs ruff check . and ruff format --check .)
ruff check .
ruff format .

# Type checking
mypy .

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "description"

# Create admin user
python scripts/create_admin.py
```

### Frontend

```bash
npm run dev       # Dev server
npm run build     # Production build
npm run lint      # ESLint
npm test          # Vitest (jsdom) + Testing Library; helper renderWithProviders
npm run preview   # Preview production build
```

---

## Architecture Patterns

### Backend - Clean Architecture

```
Endpoint → Service → Repository → DB Model
              ↕
          Domain Schema (Pydantic)
```

- **Endpoints** (`api/v1/endpoints/`): HTTP layer only, delegate to services
- **Services** (`services/`): Business logic, orchestrate repositories
- **Repositories** (`infrastructure/database/repositories/`): Data access, extend `BaseRepository`
- **Models** (`infrastructure/database/models.py`): SQLAlchemy ORM
- **Schemas** (`domain/schemas/`): Pydantic request/response models

### Frontend - Component Architecture

- `AuthContext` manages JWT token (stored in localStorage); `useAuth` lives in `contexts/authHooks.js`
- `ToastContext` provides global notifications; `useToast` lives in `contexts/toastHooks.js`
- `utils/api.js` is the central fetch wrapper — handles JWT headers and 401 errors
- All API calls go through `utils/api.js`, not direct fetch
- `useTheme.js` (in `components/`) manages dark/light theme via `localStorage` + `data-theme` on `<html>`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | DB connection string | SQLite (`./lots.db`) |
| `SECRET_KEY` | JWT signing key (min 32 chars) | — |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |
| `ENVIRONMENT` | `development`/`staging`/`production` | `development` |
| `LOG_LEVEL` | `DEBUG`/`INFO`/`WARNING`/`ERROR` | `INFO` |
| `SUPABASE_URL` | Supabase project URL | — |
| `SUPABASE_SECRET_KEY` | Supabase service role key | — |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL (configured in `utils/config.js`) |

---

## Database Models

| Model | Table | Key Fields |
|-------|-------|------------|
| `UserModel` | `users` | email, password_hash, role |
| `ProjectModel` | `projects` | name, geojson_file_url, KPI fields |
| `LotModel` | `lots` | numero, zone, surface, price, price_per_sqm, status, geometry |
| `ClientModel` | `clients` | name, email, phone |
| `NotaireModel` | `notaires` | name, email, phone, address |
| `ReservationModel` | `reservations` | status, deposit, expiration, sale_price, promotion, refund_payment_type, wants_notaire, notaire_id |
| `SaleModel` | `sales` | price, from reservation or direct |
| `AuditLogModel` | `audit_logs` | user, action, entity |
| `AssignmentModel` | `assignments` | commercial ↔ project |
| `PaymentScheduleModel` | `payment_schedules` | reservation_id, total_amount |
| `PaymentInstallmentModel` | `payment_installments` | schedule_id, amount, due_date, status |
| `LotDocumentModel` | `lot_documents` | lot_id, name, file_url, document_type |
| `AIConversationModel` | `ai_conversations` | user_id, messages (JSONB) |

**Lot status workflow (9 values):**
`creation` → `available` → `option` → `reservation_a_finaliser` → `reservation_engagee` → `reservation_soldee` → `chez_notaire` → `chez_proprietaire` | `blocked`

**User roles:** `manager` | `commercial` | `client`

---

## Workflow de statuts

Les transitions de statut d'un lot sont exposées par `backend/app/api/v1/endpoints/lot_transitions.py`
(16 routes, préfixe `POST /api/lots/{lot_id}/transitions/…`, sauf mention `PUT`). Elles sont épinglées
par des tests de caractérisation : `backend/app/tests/integration/test_api/test_lot_transitions.py`
(comportement actuel, y compris les anomalies listées dans `docs/AVANCEMENT.md`).

| # | Route | De | Vers |
|---|-------|----|------|
| 1 | `activate` | `creation` | `available` |
| 2 | `start-option` | `available` | `option` |
| 3 | `cancel-option` | `option` | `available` |
| 4 | `extend-option` | `option` ou `reservation_a_finaliser` | inchangé (prolonge l'expiration) |
| 5 | `direct-reservation` | `available` | `reservation_a_finaliser` |
| 6 | `to-reservation` | `option` | `reservation_a_finaliser` |
| 7 | `refund` | `reservation_a_finaliser` | `available` |
| 8 | `direct-engage` | `available` | `reservation_engagee` |
| 9 | `engage` | `reservation_a_finaliser` | `reservation_engagee` |
| 10 | `solde` | `reservation_engagee` | `reservation_soldee` (crée la vente) |
| 11 | `set-notaire-intent` | `reservation_soldee` | inchangé (tag `wants_notaire`) |
| 12 | `notaire` (POST) | `reservation_soldee` | `chez_notaire` |
| 13 | `notaire` (PUT) | `chez_notaire` | inchangé (met à jour les infos notaire) |
| 14 | `proprietaire` | `chez_notaire` | `chez_proprietaire` (manager uniquement, renseigne `closed_at`) |
| 15 | `block` | tout statut sauf `blocked` et `chez_proprietaire` | `blocked` (motif dans `blocked_reason`) |
| 16 | `unblock` | `blocked` | `available` (manager uniquement) |

Refus : une transition appelée depuis un autre statut est refusée en HTTP 400 (règle
`invalid_lot_status` ou `lot_not_available` ; `activate` utilise `lot_must_be_in_creation`). Un lot
inexistant donne 404, un rôle non autorisé 403.

---

## API Endpoints

Base prefix: `/api` (`API_V1_PREFIX` in `app/core/config.py`)

| Module | Prefix | Notes |
|--------|--------|-------|
| Auth | `/auth` | Login → returns JWT |
| Users | `/users` | Manager only |
| Projects | `/projects` | GeoJSON upload via multipart |
| Lots | `/lots` | CRUD + status management |
| Lot Transitions | `/lots` | Status workflow transitions (separate router) |
| Documents | `/lots` | Lot document upload/download (notaire workflow) |
| Clients | `/clients` | Manager + commercial |
| Notaires | `/notaires` | Notaire CRUD |
| Reservations | `/reservations` | Lifecycle + deposit + notaire assignment |
| Sales | `/sales` | Direct or from reservation |
| Payments | `/payments` | Payment schedules + installments |
| Dashboard | `/dashboard` | KPIs and analytics |
| Audit | `/audit-logs` | Manager only |
| Health | `/health` | No auth required |

---

## Définition de Terminé

Niveau senior — pour chaque tâche :

1. Test écrit avant le code (superpowers:test-driven-development), il échoue puis passe.
2. ruff + eslint propres sur les fichiers touchés ; CI verte.
3. Revue de code avant merge (code-review / pr-review-toolkit) ; les remarques sont traitées ou
   justifiées.
4. Vérification dans l'application lancée (superpowers:verification-before-completion) contre les
   critères d'acceptance du ticket.
5. Migration testée en `upgrade` **et** `downgrade` sur une copie des données.

**Branches** : une branche par epic `feature/eN-<slug>` depuis `dev`, une PR par epic (ou par tâche
si l'epic est gros), merge dans `dev` ; `dev → main` à la fin de chaque epic validé.

**Suivi** : `docs/AVANCEMENT.md` (tableau epic → tâche → statut → issue → PR → date) est mis à jour
dans le même commit que la tâche ; le GitHub Project « LotisPro — Roadmap » fait foi en cas d'écart.
Design de référence : `docs/superpowers/specs/2026-10-22-roadmap-lotispro-design.md` (§6).

---

## Adding New Features

### New API endpoint

1. Create schema in `backend/app/domain/schemas/`
2. Add repository method in `backend/app/infrastructure/database/repositories/`
3. Implement service in `backend/app/services/`
4. Create endpoint in `backend/app/api/v1/endpoints/`
5. Register route in `backend/app/api/v1/router.py`

### New frontend page

1. Create component in `frontend/src/components/`
2. Add route in `frontend/src/App.jsx`
3. Use `useApi` or `api.js` for API calls — never raw `fetch`
4. Use `useToast` for user feedback

---

## Code Conventions

### Backend

- **Async everywhere:** all DB operations use `async/await`
- **Type hints required:** MyPy strict mode enabled
- **Structured logging:** use `get_logger(__name__)`, log with context kwargs
- **Custom exceptions:** raise from `app/core/exceptions.py`, not generic `HTTPException`
- **Ruff rules:** E, W, F, I, B, C4, UP, ARG, SIM, TCH, PTH, ERA, PL, RUF (see `[tool.ruff.lint]` in `backend/pyproject.toml` for the ignored ones)

### Frontend

- **No direct fetch:** always use `utils/api.js` wrapper
- **Toast for feedback:** use `useToast()` from `contexts/toastHooks` (`ToastContext.jsx` only exports `ToastProvider`; likewise `useAuth` comes from `contexts/authHooks`, `AuthContext.jsx` only exports `AuthProvider`)
- **Role checks:** use `ProtectedRoute` for route-level, check `user.role` in components
- **Styling:** custom CSS in `styles.css`, no UI framework
- **Theme:** `useTheme.js` in `components/` — reads/writes `localStorage('lotispro-theme')`, sets `data-theme` on `<html>`

---

## Supabase Storage

GeoJSON files are uploaded to Supabase Storage bucket. The `geojson_file_url` on `ProjectModel` stores the public URL. The `infrastructure/storage/supabase_storage.py` module handles uploads.

To enable: set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` in `.env`.

---

## Design System

**Palette Obsidian Navy + Warm Brass** — premium B2B real estate SaaS.

Dark (default): `#090d16` bg + `#d4973a` brass primary  
Light (`data-theme="light"`): `#f4f5f0` warm stone + `#b87728` deep brass

**Status colors (map polygons + badges):**

| Status | Color |
|--------|-------|
| available | `#10b981` emerald |
| option / reserved | `#f59e0b` amber |
| validated | `#8b5cf6` violet |
| sold / chez_proprietaire | `#ef4444` red |
| blocked | `#6b7280` gray |

**Typography:** Cormorant Garamond (display) + DM Sans (body) + DM Mono (mono)  
Numbers use `font-variant-numeric: tabular-nums lining-nums` — `.num` utility class available.
