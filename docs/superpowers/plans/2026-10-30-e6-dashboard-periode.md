# E6 — Tableau de bord par période — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager or commercial pick a period on the project dashboard and see flow KPIs (lots vendus, CA, réservations créées, conversion, encaissements) with variation vs the previous period, state KPIs at the end date, a chart over the period, and an Excel export.

**Architecture:** A pure domain module computes periods, bounds (Africa/Casablanca → UTC), variations and chart buckets. A new `DashboardPeriodService` reads `lot_status_history`, `reservations` and `reservation_payments` and is called by the existing `DashboardService` (`/stats`, `/performance`) and by a new `/export` endpoint. The frontend adds `components/dashboard/` (period utils, `PeriodPicker`, `KpiCards`, `MonthlyChart`, extracted sections) and `Dashboard.jsx` keeps only orchestration.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, pytest (SQLite in-memory), openpyxl (new); React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/epics/E6-dashboard-periode.md` (definitions revised 2026-10-30, validated by the user). Parent design: `docs/superpowers/specs/2026-10-22-roadmap-lotispro-design.md` §5 E6.

## Global Constraints

- Worktree `../lot_webapp-e6`, branch `feature/e6-dashboard-periode` (from `dev`); never touch `../lot_webapp`, `../lot_webapp-e5`.
- No migration in E6 (no schema change).
- UI text and API messages in French; commits in English, conventional, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never amend, never force-push.
- Backend: `ruff check .` and `ruff format --check .` = 0 (ruff 0.15.x); tests `python -m pytest -q` from `backend/` in a venv (`pip install -e ".[dev]"`, `SECRET_KEY` set, e.g. `SECRET_KEY=test-secret-key-at-least-32-characters-long`). Frontend: `npm run lint` = 0, `npm test`, `npm run build`.
- Tests never send real email (autouse `no_resend` fixture exists; do not bypass it).
- Business time zone: `settings.REMINDER_TIMEZONE` (`Africa/Casablanca`), UTC fallback on `ZoneInfoNotFoundError` (same rule as `business_today()` in `app/domain/schemas/reservation_payment.py`).
- Periods: inclusive bounds `[date_from 00:00, date_to+1 00:00)` local time, converted to UTC for timestamp columns; `reservation_payments.paid_on` (a `date`) is compared directly.
- Default period = calendar month containing business today.
- KPI definitions = spec table (CA = `coalesce(agreed_total_price, lots.price, 0)`; never `reservations.sale_price`, which is the deed price).
- Exact French messages:
  - inverted period (422): `La date de début doit être antérieure ou égale à la date de fin.`
  - only one bound given (422): `Indiquez la date de début et la date de fin.`
  - period longer than 3 660 days (422): `La période ne peut pas dépasser 10 ans.`
  - no access to project (403 via `AuthorizationError`): `Vous n'avez pas accès à ce projet.`
- `docs/AVANCEMENT.md` updated in the same commit as each task (E6 row + task rows: 🟦 while in progress, 🟨 when reviewed, ✅ only after the user's recette). The controller moves issues on GitHub Project #4.
- Existing response fields of `/dashboard/stats` and `/dashboard/performance` are kept (additive change; `GlobalDashboard.jsx` uses `/stats`).

## Review Focus

1. **Event close to midnight, Casablanca time** — an engagement at 23:30 local on `date_to` (22:30 UTC) and one at 00:30 local on `date_from` (23:30 UTC the day before) both count; one at 00:30 local the day after `date_to` does not. Test in Task 2 (`test_flow_bounds_use_business_time_zone`).
2. **Same reservation with two engagement rows** (lot engaged, blocked, unblocked, engaged again through history) — counted once, CA once. Test in Task 2 (`test_engagement_counted_once_per_reservation`).
3. **Empty period / previous value 0** — all flows 0, conversion 0, variations `null`, no division error. Test in Task 2 (`test_empty_period_returns_zeros_and_null_variations`).
4. **Fast period changes in the UI** — a slow response for an older period must not overwrite the newer one. Test in Task 4 (`ignores a stale response after a newer period`).
5. **`sessionStorage` missing, throwing or corrupted** — dashboard falls back to the current month without crashing. Test in Task 4 (`loadPeriod falls back to the current month`).

---

## File map

Backend (`backend/app/`):
- Create `domain/dashboard_period.py` — pure period maths (Task 1).
- Modify `domain/schemas/dashboard.py` — period schemas, new optional fields (Tasks 2, 3).
- Create `services/dashboard_period_service.py` — queries for flows, state, history start, series, sold lots (Tasks 2, 3).
- Modify `services/dashboard_service.py` — `get_dashboard_stats` / `get_performance_data` accept a `Period` and delegate (Tasks 2, 3).
- Modify `api/v1/endpoints/dashboard.py` — `date_from` / `date_to` on `/stats`, `/performance`; new `/export` (Tasks 2, 3, 6).
- Create `services/dashboard_export.py` — workbook + filename (Task 6).
- Modify `core/middlewares.py` — expose `Content-Disposition` (Task 6).
- Modify `tests/factories.py` — `make_reservation`, `make_status_change`, `make_reservation_payment` (Task 2).
- Tests: `tests/unit/test_dashboard_period.py`, `tests/integration/test_api/test_dashboard_period.py`, `tests/integration/test_api/test_dashboard_series.py`, `tests/integration/test_api/test_dashboard_export.py`.
- Dependencies (Task 6): `backend/pyproject.toml`, `backend/requirements.txt`, `backend/Dockerfile`.

Frontend (`frontend/src/components/dashboard/`):
- Create `period.js` — shortcuts, sessionStorage, labels, query string (Task 4).
- Create `PeriodPicker.jsx`, `KpiCards.jsx`, `MonthlyChart.jsx`, `usePeriodData.js` (Task 4).
- Create `CumulativeKpis.jsx`, `LotStockSection.jsx`, `CategoryBreakdown.jsx`, `OptionsTrackingTab.jsx`, `OverviewPanels.jsx` (Task 5).
- Create `exportDashboard.js` + « Exporter » button (Task 6).
- Modify `components/Dashboard.jsx` (Tasks 4, 5, 6).
- Tests in `components/dashboard/__tests__/`.

---

### Task 1: Period domain module (E6-T1, issue #39)

**Files:**
- Create: `backend/app/domain/dashboard_period.py`
- Test: `backend/app/tests/unit/test_dashboard_period.py`

**Interfaces:**
- Produces (all pure, no DB):
  - `@dataclass(frozen=True) class Period: date_from: date; date_to: date` with property `days -> int` (inclusive count).
  - `MAX_PERIOD_DAYS = 3660`
  - `business_tz() -> tzinfo` — `ZoneInfo(settings.REMINDER_TIMEZONE)`, `UTC` on `ZoneInfoNotFoundError`.
  - `business_today() -> date` — move the existing function here and re-export it from `app/domain/schemas/reservation_payment.py` (`from app.domain.dashboard_period import business_today` keeps its callers working).
  - `resolve_period(date_from: date | None, date_to: date | None, today: date) -> Period` — both `None` → calendar month of `today`; raises `ValidationError` (from `app.core.exceptions`, → HTTP 422) with the three exact messages of Global Constraints (`field="date_from"`).
  - `previous_period(period: Period) -> Period` — same `days`, ending the day before `period.date_from`.
  - `utc_bounds(period: Period) -> tuple[datetime, datetime]` — aware UTC `[start, end)`.
  - `to_business_date(moment: datetime) -> date` — naive values are treated as UTC.
  - `variation(current: float, previous: float) -> float | None` — `round((c - p) / p * 100, 1)`, `None` when `p == 0`.
  - `Granularity = Literal["day", "week", "month"]`; `granularity_for(period) -> Granularity` — `day` if `days <= 31`, `week` if `days <= 92`, else `month`.
  - `bucket_key(day: date, granularity) -> str` — `"2026-10-05"`, ISO week `"2026-W41"`, `"2026-10"`.
  - `bucket_keys(period, granularity) -> list[str]` — every key covering the period, in order, no duplicates.

- [ ] **Step 1: Write the failing tests** (`test_dashboard_period.py`), at least:

```python
def test_default_period_is_month_of_today():
    assert resolve_period(None, None, date(2026, 10, 30)) == Period(date(2026, 10, 1), date(2026, 10, 31))

def test_inverted_period_rejected():
    with pytest.raises(ValidationError, match="La date de début doit être antérieure ou égale à la date de fin."):
        resolve_period(date(2026, 10, 2), date(2026, 10, 1), date(2026, 10, 30))

def test_single_bound_rejected():  # message « Indiquez la date de début et la date de fin. »
def test_too_long_period_rejected():  # 3661 days → « La période ne peut pas dépasser 10 ans. »; 3660 accepted
def test_previous_period_same_length():
    assert previous_period(Period(date(2026, 10, 1), date(2026, 10, 31))) == Period(date(2026, 8, 31), date(2026, 9, 30))

def test_utc_bounds_casablanca():  # Period(2026-10-30, 2026-10-30) → start 2026-10-29T23:00Z, end 2026-10-30T23:00Z (UTC+1 on that date)
def test_utc_bounds_fallback_utc(monkeypatch):  # business_tz patched to raise ZoneInfoNotFoundError path → bounds at 00:00Z
def test_variation():
    assert variation(15, 10) == 50.0
    assert variation(5, 10) == -50.0
    assert variation(3, 0) is None

def test_granularity_thresholds():  # 31 days → day, 32 → week, 92 → week, 93 → month
def test_bucket_keys_week_and_month():  # Period(2026-10-01, 2026-10-31) week → ["2026-W40", ..., "2026-W44"]; year → 12 month keys
```

- [ ] **Step 2: Run, verify FAIL** — `python -m pytest app/tests/unit/test_dashboard_period.py -q` → `ModuleNotFoundError: app.domain.dashboard_period`.
- [ ] **Step 3: Implement `app/domain/dashboard_period.py`** with the interfaces above; move `business_today`.
- [ ] **Step 4: Run, verify PASS** — same command, then full `python -m pytest -q` (the payment tests still pass through the re-export) and `ruff check . && ruff format --check .`.
- [ ] **Step 5: Commit** — `docs/AVANCEMENT.md`: E6 row 🟦, E6-T1 🟦.

```bash
git add backend/app/domain/dashboard_period.py backend/app/domain/schemas/reservation_payment.py backend/app/tests/unit/test_dashboard_period.py docs/AVANCEMENT.md
git commit -m "feat: dashboard period domain module"
```

---

### Task 2: Flow and state KPIs on `/dashboard/stats` (E6-T1, issue #39)

**Files:**
- Create: `backend/app/services/dashboard_period_service.py`
- Modify: `backend/app/domain/schemas/dashboard.py`, `backend/app/services/dashboard_service.py` (`get_dashboard_stats`), `backend/app/api/v1/endpoints/dashboard.py` (`/stats`), `backend/app/tests/factories.py`
- Test: `backend/app/tests/integration/test_api/test_dashboard_period.py`

**Interfaces:**
- Consumes: Task 1 (`Period`, `resolve_period`, `previous_period`, `utc_bounds`, `to_business_date`, `variation`, `business_today`).
- Produces:
  - Schemas (`dashboard.py`):
    - `PeriodRange(BaseSchema): date_from: date; date_to: date`
    - `FlowKpis(BaseSchema): lots_vendus: int = 0; ca: float = 0; reservations_creees: int = 0; taux_conversion: float = 0; encaissements: float = 0`
    - `FlowVariations(BaseSchema)`: same five names, each `float | None = None`
    - `StateKpis(BaseSchema): available: int = 0; option: int = 0`
    - New fields on `DashboardStats`, all optional with defaults: `period: PeriodRange | None`, `previous_period: PeriodRange | None`, `flow: FlowKpis | None`, `flow_previous: FlowKpis | None`, `variations: FlowVariations | None`, `state: StateKpis | None`, `state_kpis_available: bool = True`, `flow_kpis_available: bool = True`, `history_start: date | None = None`.
  - `@dataclass(frozen=True) class SoldLot` in `dashboard_period_service.py`: `reservation_id: int, lot_id: int, lot_numero: str, zone: str | None, type_lot: str | None, surface: float | None, client_name: str | None, commercial_name: str | None, engaged_on: date, agreed_total_price: float` (effective, fallback applied), `deed_price: float | None` (`reservations.sale_price`), `lot_status: str`.
  - `class DashboardPeriodService(session)`:
    - `async sold_lots(period, project_id: int | None, user_id: int | None) -> list[SoldLot]` — history rows `to_status == "reservation_engagee"` with `changed_at` in `utc_bounds`, joined to reservation, lot, client, user (outer); deduplicated by `reservation_id` keeping the earliest row; rows with `reservation_id IS NULL` ignored; ordered by `engaged_on`, then lot numero.
    - `async flow(period, project_id, user_id) -> FlowKpis` — `lots_vendus = len(sold)`, `ca = round(sum(agreed_total_price), 2)`, `reservations_creees` (by `reservation_date` in UTC bounds), `encaissements` (sum `reservation_payments.amount`, `paid_on` between dates, joined to reservation for filters), `taux_conversion = round(vendus / créées * 100, 1)` or 0.
    - `async state_at(day: date, project_id) -> StateKpis` — for each lot with `created_at < end(day)`: status = `to_status` of its last history row before `end(day)`, else `from_status` of its first later row, else current `status`; count `available` and `option`. Done in Python from two queries (lots, history of those lots ordered by `lot_id, changed_at`).
    - `async history_start() -> date | None` — `to_business_date(min(changed_at))` over the whole table.
    - `async period_stats(period, project_id, user_id, today) -> dict` — returns the nine new `DashboardStats` fields: availability rules exactly as in the spec; `variations` all `None` when the previous period's flows are not available (`previous.date_from < history_start`).
  - `DashboardService.get_dashboard_stats(project_id=None, user_id=None, period: Period | None = None)` — when `period` is `None` uses `resolve_period(None, None, business_today())`; merges `period_stats` into the returned `DashboardStats`. Existing fields unchanged.
  - Endpoint `/stats`: new query params `date_from: date | None`, `date_to: date | None` → `resolve_period(date_from, date_to, business_today())`.
  - Factories (`tests/factories.py`): `make_reservation(session, lot, client, *, user=None, reservation_date=None, agreed_total_price=None, sale_price=None, **overrides) -> ReservationModel` (default `expiration_date` = reservation_date + 30 days, `project_id` from lot); `make_status_change(session, lot, to_status, changed_at, *, from_status="available", reservation=None, transition="test") -> LotStatusHistoryModel`; `make_reservation_payment(session, reservation, amount, paid_on, method="transfer") -> ReservationPaymentModel`.

- [ ] **Step 1: Write the failing tests** (`test_dashboard_period.py`, call `GET /api/dashboard/stats?project_id=&date_from=&date_to=` as manager; build data with the factories, history rows dated explicitly):
  - `test_lots_vendus_and_ca_use_engagement_date_and_agreed_price` — reservation A engaged 2026-10-05 with `agreed_total_price=600000`, `sale_price=450000` → `flow.lots_vendus == 1`, `flow.ca == 600000.0`; reservation B engaged 2026-09-28 not counted.
  - `test_legacy_reservation_falls_back_to_lot_price` — `agreed_total_price=None`, lot price 500000 → `ca == 500000.0`; lot price `None` → 0.
  - `test_engagement_counted_once_per_reservation` (Review Focus 2).
  - `test_flow_bounds_use_business_time_zone` (Review Focus 1, timestamps in UTC: `2026-10-31T22:30Z` counts for October, `2026-09-30T23:30Z` counts for October, `2026-10-31T23:30Z` does not).
  - `test_reservations_creees_and_conversion` — 4 reservations created in period, 1 engaged → `reservations_creees == 4`, `taux_conversion == 25.0`; 1 created and 2 engaged (one created in September) → `taux_conversion == 200.0`; 0 created → `0`.
  - `test_encaissements_by_paid_on` — payments on 2026-10-01 and 2026-10-31 count, 2026-11-01 does not.
  - `test_user_filter_applies_to_flows_not_state` — `user_id=commercial.id` keeps only that commercial's sales/reservations/payments; `state` unchanged.
  - `test_state_at_date_to_from_history` — lot `option` today whose history says `available→option` on 2026-11-02 counts as `available` for `date_to=2026-10-31`; lot created 2026-11-05 not counted; lot without history counts with its current status.
  - `test_previous_period_and_variations` — October 2 sales, September 1 → `flow_previous.lots_vendus == 1`, `variations.lots_vendus == 100.0`, `previous_period == {"date_from": "2026-08-31", "date_to": "2026-09-30"}`.
  - `test_empty_period_returns_zeros_and_null_variations` (Review Focus 3).
  - `test_availability_flags_from_history_start` — first history row 2026-10-10: `date_from=2026-10-01` → `flow_kpis_available is False`, `history_start == "2026-10-10"`; `date_to=2026-10-05` (past) → `state_kpis_available is False`; no history at all → both `True`.
  - `test_default_period_is_current_month` — no dates → `period` = month of `business_today()`.
  - `test_invalid_periods_return_422` — inverted, single bound, 3 661 days → 422 with the exact French messages in `response.json()["message"]`.
  - `test_existing_fields_unchanged` — `counts`, `ca_realise`, `ca_total` still present.
- [ ] **Step 2: Run, verify FAIL** — `python -m pytest app/tests/integration/test_api/test_dashboard_period.py -q` → factories / fields missing.
- [ ] **Step 3: Implement** schemas, factories, `DashboardPeriodService`, `get_dashboard_stats(period=...)`, endpoint params.
- [ ] **Step 4: Run, verify PASS** — the file, then `python -m pytest -q`, `ruff check . && ruff format --check .`.
- [ ] **Step 5: Commit** — AVANCEMENT unchanged status (still 🟦).

```bash
git commit -m "feat: period flow and state KPIs on dashboard stats"
```

---

### Task 3: Period series on `/dashboard/performance` (E6-T1, issue #39)

**Files:**
- Modify: `backend/app/domain/schemas/dashboard.py`, `backend/app/services/dashboard_period_service.py`, `backend/app/services/dashboard_service.py` (`get_performance_data`), `backend/app/api/v1/endpoints/dashboard.py` (`/performance`)
- Test: `backend/app/tests/integration/test_api/test_dashboard_series.py`

**Interfaces:**
- Consumes: Task 1 (`granularity_for`, `bucket_key`, `bucket_keys`), Task 2 (`sold_lots`, filters).
- Produces:
  - `PeriodBucket(BaseSchema): key: str; lots_vendus: int = 0; ca: float = 0; reservations_creees: int = 0; encaissements: float = 0`
  - `PerformanceData` gains `period: PeriodRange | None = None`, `granularity: str | None = None`, `series: list[PeriodBucket] = []` (old fields kept).
  - `DashboardPeriodService.series(period, project_id, user_id) -> tuple[Granularity, list[PeriodBucket]]` — one bucket per `bucket_keys`, empty buckets included; sales bucketed by `engaged_on`, reservations by `to_business_date(reservation_date)`, payments by `paid_on`.
  - `/performance` accepts `date_from`, `date_to` (same resolution and 422s as `/stats`); `get_performance_data(..., period: Period | None = None)`.

- [ ] **Step 1: Write the failing tests**:
  - `test_series_daily_for_a_month` — October → `granularity == "day"`, 31 buckets, the 2026-10-05 bucket has `lots_vendus == 1`, `ca == 600000.0`.
  - `test_series_weekly_for_a_quarter` and `test_series_monthly_for_a_year` (12 keys `2026-01`..`2026-12`).
  - `test_series_totals_match_stats` — sums of `lots_vendus`, `ca`, `reservations_creees`, `encaissements` over buckets equal `/stats` `flow` for the same period and filters.
  - `test_performance_invalid_period_422`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify PASS** — file, full suite, ruff.
- [ ] **Step 5: Commit** — AVANCEMENT: E6-T1 🟨 (after task review; recette later).

```bash
git commit -m "feat: period series on dashboard performance"
```

---

### Task 4: Period picker, KPI cards and chart (E6-T2, issue #40)

**Files:**
- Create: `frontend/src/components/dashboard/period.js`, `PeriodPicker.jsx`, `KpiCards.jsx`, `MonthlyChart.jsx`, `usePeriodData.js`
- Modify: `frontend/src/components/Dashboard.jsx`, `frontend/src/styles.css` (skeleton + picker styles, reuse `kpis-*` classes)
- Test: `frontend/src/components/dashboard/__tests__/period.test.js`, `PeriodPicker.test.jsx`, `KpiCards.test.jsx`, `usePeriodData.test.jsx`

**Interfaces:**
- Consumes: Tasks 2-3 API (`/api/dashboard/stats`, `/api/dashboard/performance` with `date_from`, `date_to`, `project_id`, `user_id`).
- Produces:
  - `period.js`:
    - `PERIOD_STORAGE_KEY = 'lotispro-dashboard-period'`
    - `PERIOD_SHORTCUTS = [{ key: 'today', label: "Aujourd'hui" }, { key: 'week', label: 'Cette semaine' }, { key: 'month', label: 'Ce mois' }, { key: 'quarter', label: 'Ce trimestre' }, { key: 'year', label: 'Cette année' }]`
    - `shortcutRange(key, today: Date) -> { dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD' }` — full calendar periods; week = Monday → Sunday.
    - `loadPeriod(today) -> {dateFrom, dateTo}` — valid stored value, else `shortcutRange('month', today)` (catches storage exceptions and bad JSON / bad dates / inverted range).
    - `savePeriod(period)` — swallows storage exceptions.
    - `formatPeriodLabel(period) -> 'Période : du 01/10/2026 au 31/10/2026'`.
    - `periodParams(period) -> URLSearchParams` (`date_from`, `date_to`).
    - `formatVariation(value) -> { text: '▲ 12,5 %' | '▼ 3 %' | '—', trend: 'up' | 'down' | 'flat' | null }` (French decimal comma, 0 → `'= 0 %'` with `flat`).
  - `PeriodPicker({ value, onChange, children })` — two `<input type="date">` labelled « Du » / « Au », the five shortcut buttons (`aria-pressed` on the matching one), the active label always visible; when Du > Au shows « La date de début doit être antérieure ou égale à la date de fin. » and does not call `onChange`. `children` = right-hand actions slot (Task 6 « Exporter »).
  - `usePeriodData({ projectId, userId, period }) -> { stats, performance, loading, error }` — fetches both endpoints in parallel; ignores responses from superseded requests (request id ref).
  - `KpiCards({ stats, loading })` — skeleton (`aria-busy="true"`, 7 placeholder cards) while loading; flow cards: « Lots vendus », « CA », « Réservations créées », « Taux de conversion », « Encaissements », each with `formatVariation` and « vs période précédente »; state cards « Disponibles au {dd/mm/yyyy} », « En option au {dd/mm/yyyy} »; tooltips (exact): « Réservations engagées sur la période », « Prix total convenu des réservations engagées sur la période », « Réservations créées sur la période, toutes étapes », « Lots vendus ÷ réservations créées sur la même période (peut dépasser 100 %) », « Sommes reçues sur la période (versements à l'engagement et échéances) ». When `flow_kpis_available` is false the lots vendus / CA / conversion values are replaced by « Ventes, CA et conversion disponibles à partir du {date} »; when `state_kpis_available` is false, state values replaced by « Situation des lots disponible à partir du {date} ».
  - `MonthlyChart({ performance, loading })` — the existing chart markup and classes, fed by `performance.series` (title « Évolution sur la période »; bars « Vendus » = `lots_vendus`, « Réservés » = `reservations_creees`; « Montant » mode = `ca`); labels: day `05/10`, week `S41`, month `Oct 2026`; skeleton while loading; empty series → « Aucune donnée sur la période ».
  - `Dashboard.jsx`: period state initialised with `loadPeriod(new Date())`, saved on change; `PeriodPicker` rendered under the page header; `KpiCards` + `MonthlyChart` via `usePeriodData`; removes `setPerformance`, the `/performance` and `/monthly-breakdown` calls from `loadDashboardData`, `monthlyBreakdown` / `hoveredMonth` / `chartMode` state (moved into `MonthlyChart`), and the « Ventes ce Mois » / « CA ce Mois » hero cards; the remaining cumulative cards get the suffix « à ce jour » in their section titles (« Indicateurs clés — à ce jour », « Performance financière — à ce jour »). A period change does not show the full-page spinner.

- [ ] **Step 1: Write the failing tests**:
  - `period.test.js`: shortcut ranges for `today = 2026-10-30` (Thursday): today `2026-10-30/2026-10-30`, week `2026-10-26/2026-11-01`, month `2026-10-01/2026-10-31`, quarter `2026-10-01/2026-12-31`, year `2026-01-01/2026-12-31`; `loadPeriod falls back to the current month` when storage throws, holds `"{"`, holds an inverted range (Review Focus 5); round trip `savePeriod`/`loadPeriod`; `formatVariation(12.5).text === '▲ 12,5 %'`, `formatVariation(-3)` → `'▼ 3 %'`, `null` → `'—'`.
  - `PeriodPicker.test.jsx`: clicking « Ce trimestre » calls `onChange` with the quarter and the label updates; inverted manual dates show the error and no `onChange`.
  - `KpiCards.test.jsx`: renders values and « ▲ 100 % »; skeleton has `aria-busy`; unavailable flags render the two notices with `10/10/2026`.
  - `usePeriodData.test.jsx`: `ignores a stale response after a newer period` (Review Focus 4) — first `apiGet` promise resolved after the second; rendered stats are the second's.
- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/components/dashboard`.
- [ ] **Step 3: Implement** the files and wire `Dashboard.jsx`.
- [ ] **Step 4: Run, verify PASS** — `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** — AVANCEMENT: E6-T2 🟦.

```bash
git commit -m "feat: period picker, KPI cards and period chart on the dashboard"
```

---

### Task 5: Extract the remaining dashboard sections (E6-T2, issue #40)

Pure move, no behaviour change except removing the `[DEBUG options-tracking]` `console.log` / `console.error` lines.

**Files:**
- Create in `frontend/src/components/dashboard/`: `CumulativeKpis.jsx` (« Indicateurs clés — à ce jour » + « Performance financière — à ce jour »), `LotStockSection.jsx` (« Stock de Lots »), `CategoryBreakdown.jsx` (« Répartition par catégorie », owns `catRepTab`), `OptionsTrackingTab.jsx`, `OverviewPanels.jsx` (alerts, notaire alerts, late payments, lots table, clients pipeline; owns `clientSearchQuery`).
- Modify: `frontend/src/components/Dashboard.jsx` (target ≤ 400 lines: data loading, filters, tabs, composition).
- Test: `frontend/src/components/dashboard/__tests__/Dashboard.smoke.test.jsx`

**Interfaces:**
- Consumes: Task 4 components.
- Produces: each section takes its data and callbacks as props (`stats`, `projectKpis`, `allLots`, `lots`, `alerts`, `notaireAlerts`, `latePayments`, `clientsPipeline`, `optionsTracking`, `optionsTrackingError`, `onSelectLot`, `onNavigate`, `onReleaseAlert`, `isManager`, `isCommercial`) — names as in today's `Dashboard.jsx`.

- [ ] **Step 1: Write the failing smoke test** — render `Dashboard` with `projectId` as a manager, `apiGet` mocked per URL (fixtures for `/stats`, `/performance`, `/lots`, `/alerts`, `/clients-pipeline`, `/late-payments`, `/notaire-alerts`, `/options-tracking`, `/projects/{id}/kpis`, `/users`); assert the section titles « Lots vendus », « Stock de Lots », « Répartition par catégorie », « Indicateurs clés — à ce jour » render and switching to the options tab shows the options list. Write it against the current file first: it must pass before the move (characterisation), then keep passing.
- [ ] **Step 2: Run** — `npx vitest run src/components/dashboard/__tests__/Dashboard.smoke.test.jsx` → PASS on the Task 4 code (characterisation baseline).
- [ ] **Step 3: Move the sections** into the new files; no JSX or class change.
- [ ] **Step 4: Run, verify PASS** — smoke test, `npm test`, `npm run lint`, `npm run build`; `wc -l src/components/Dashboard.jsx` ≤ 400.
- [ ] **Step 5: Commit** — AVANCEMENT: E6-T2 🟨; in « Dette technique suivie » strike the `Dashboard.jsx` `setPerformance` / `loadDashboardData` item as resolved by E6-T2.

```bash
git commit -m "refactor: split Dashboard.jsx into dashboard sections"
```

---

### Task 6: Excel export (E6-T3, issue #41)

**Files:**
- Create: `backend/app/services/dashboard_export.py`, `frontend/src/components/dashboard/exportDashboard.js`
- Modify: `backend/app/api/v1/endpoints/dashboard.py` (`/export`), `backend/app/core/middlewares.py` (`expose_headers` += `"Content-Disposition"`), `backend/pyproject.toml` (`"openpyxl>=3.1"`), `backend/requirements.txt` (`openpyxl>=3.1`), `backend/Dockerfile` (wheel list += `openpyxl et-xmlfile` — wheels are built with `--no-deps`), `frontend/src/components/Dashboard.jsx` (« Exporter » in the `PeriodPicker` actions slot, only when a project is selected)
- Test: `backend/app/tests/integration/test_api/test_dashboard_export.py`, `backend/app/tests/unit/test_dashboard_export.py`, `frontend/src/components/dashboard/__tests__/exportDashboard.test.js`

If editing the Dockerfile is refused by the permission system, stop and report it; do not work around it.

**Interfaces:**
- Consumes: Task 2 (`DashboardPeriodService.period_stats`, `sold_lots`), Task 1 (`resolve_period`).
- Produces:
  - `slugify(name: str) -> str` — NFKD, ASCII, lower case, non-alphanumerics → `-`, collapsed and stripped, `"projet"` if empty.
  - `export_filename(project_name, period) -> str` — `dashboard_<slug>_<YYYY-MM-DD>_<YYYY-MM-DD>.xlsx`.
  - `build_dashboard_workbook(project_name: str, stats: DashboardStats, sold: list[SoldLot]) -> bytes`:
    - Sheet « KPIs »: rows 1-3 `Projet` / `Période` (`du 01/10/2026 au 31/10/2026`) / `Période précédente`; header row `Indicateur | Période | Période précédente | Variation (%)`; rows `Lots vendus`, `CA (MAD)`, `Réservations créées`, `Taux de conversion (%)`, `Encaissements (MAD)`, then `Lots disponibles au <dd/mm/yyyy>`, `Lots en option au <dd/mm/yyyy>` (previous/variation empty). Unavailable values written as the same French notices as the UI.
    - Sheet « Lots »: header `N° lot | Zone | Type de lot | Surface (m²) | Client | Commercial | Date d'engagement | Prix total convenu (MAD) | Prix acte (MAD) | Statut actuel` (status label from `STATUS_LABELS`), one row per `SoldLot`; numbers as numbers, dates as dates.
  - `GET /api/dashboard/export?project_id=&date_from=&date_to=&user_id=` — `project_id` required; `ProjectRepository.can_user_access` else `AuthorizationError("Vous n'avez pas accès à ce projet.")`; a commercial's `user_id` is forced to their own id; response `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment; filename="<export_filename>"`.
  - `exportDashboard({ projectId, userId, period }) -> Promise<void>` — `apiFetch`, `buildApiError` on non-OK, filename from `Content-Disposition` (fallback `dashboard_<date_from>_<date_to>.xlsx`), blob download like `ClientDetailPage.jsx`; the button shows « Export… » while running, toast « Échec de l'export » + API message on error.

- [ ] **Step 1: Write the failing tests**:
  - unit: `slugify("Résidence Al Amal / Tranche 2") == "residence-al-amal-tranche-2"`; `export_filename(...)`; workbook loaded back with `openpyxl.load_workbook(BytesIO(...))` has sheets `["KPIs", "Lots"]`, the header rows and values above.
  - integration: manager export → 200, content type, `filename="dashboard_<slug>_2026-10-01_2026-10-31.xlsx"`, « Lots » rows = sold lots of the period, KPI values equal `/stats` `flow`; commercial not assigned → 403 French message; commercial assigned with another `user_id` → their own sales only; missing `project_id` → 422; inverted dates → 422 French message; the CORS response of a preflight from an allowed origin lists `Content-Disposition` in `access-control-expose-headers` (or assert on the middleware config).
  - frontend: `exportDashboard` uses the header filename, falls back when absent, throws the API message on 403.
- [ ] **Step 2: Run, verify FAIL** — `ModuleNotFoundError: openpyxl` / missing route.
- [ ] **Step 3: Implement**; `pip install -e ".[dev]"` again for openpyxl.
- [ ] **Step 4: Run, verify PASS** — backend full suite + ruff; frontend `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** — AVANCEMENT: E6-T3 🟨.

```bash
git commit -m "feat: Excel export of the period dashboard"
```

---

## After the tasks (controller)

- Final whole-branch review on the most capable model; fix round if needed.
- Merge `origin/dev` into the branch if it moved (e.g. PR #56); push; open the PR « E6 — Tableau de bord par période » (base `dev`), CI green (backend, frontend, migrations).
- Recette servers from this worktree on free ports (not 8000, 8002, 5174, 5176, 64287), `SCHEDULER_ENABLED=false`, uvicorn without `--reload`, `VITE_API_URL` and `CORS_ORIGINS` set accordingly; the user does the recette, then statuses go ✅ / « Terminé ».
- No deployment, no merge without the user's request.
