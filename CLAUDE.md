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
│   │   ├── api/v1/endpoints/   # Route handlers (10 modules)
│   │   ├── core/               # Config, security, logging, middlewares
│   │   ├── domain/             # Schemas (Pydantic) + interfaces
│   │   ├── infrastructure/     # DB models, repositories, Supabase storage
│   │   └── services/           # Business logic (9 services)
│   ├── alembic/      # DB migrations
│   └── scripts/      # Utility scripts (seed_users.py)
├── frontend/         # React SPA
│   └── src/
│       ├── components/   # 13 React components
│       ├── contexts/     # AuthContext, ToastContext
│       ├── services/     # API service layer
│       └── utils/        # api.js, config.js, constants.js
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
# Tests (requires 80% coverage)
pytest

# Linting
ruff check .
ruff format .

# Type checking
mypy .

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "description"

# Seed admin user
python scripts/seed_users.py
```

### Frontend

```bash
npm run dev       # Dev server
npm run build     # Production build
npm run lint      # ESLint
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

- `AuthContext` manages JWT token (stored in localStorage)
- `ToastContext` provides global notifications
- `utils/api.js` is the central fetch wrapper — handles JWT headers and 401 errors
- All API calls go through `utils/api.js`, not direct fetch

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
| `LotModel` | `lots` | numero, zone, surface, price, status, geometry |
| `ClientModel` | `clients` | name, email, phone |
| `ReservationModel` | `reservations` | status, deposit, expiration |
| `SaleModel` | `sales` | price, from reservation or direct |
| `AuditLogModel` | `audit_logs` | user, action, entity |
| `AssignmentModel` | `assignments` | commercial ↔ project |

**Lot status values:** `available` | `reserved` | `sold` | `blocked`
**User roles:** `manager` | `commercial` | `client`

---

## API Endpoints

Base prefix: `/api/v1`

| Module | Prefix | Notes |
|--------|--------|-------|
| Auth | `/auth` | Login → returns JWT |
| Users | `/users` | Manager only |
| Projects | `/projects` | GeoJSON upload via multipart |
| Lots | `/lots` | Status management |
| Clients | `/clients` | Manager + commercial |
| Reservations | `/reservations` | Lifecycle + deposit |
| Sales | `/sales` | Direct or from reservation |
| Dashboard | `/dashboard` | KPIs and analytics |
| Audit | `/audit` | Manager only |
| Health | `/health` | No auth required |

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
- **Ruff rules:** E, W, F, I, B, C4, UP, ARG, SIM, PTH, PL, RUF

### Frontend

- **No direct fetch:** always use `utils/api.js` wrapper
- **Toast for feedback:** use `useToast()` from `ToastContext`
- **Role checks:** use `ProtectedRoute` for route-level, check `user.role` in components
- **Styling:** custom CSS in `styles.css`, no UI framework

---

## Supabase Storage

GeoJSON files are uploaded to Supabase Storage bucket. The `geojson_file_url` on `ProjectModel` stores the public URL. The `infrastructure/storage/supabase_storage.py` module handles uploads.

To enable: set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` in `.env`.
