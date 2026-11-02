"""Period KPIs of the dashboard (E6): flows over a period, state at its end.

Definitions: ``docs/superpowers/specs/epics/E6-dashboard-periode.md``
(« Définitions des KPIs »). Timestamp columns are compared with aware UTC
bounds from ``utc_bounds``; values read back go through ``to_business_date``
(SQLite returns them naive, in UTC). Date grouping is done in Python.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.dashboard_period import (
    Granularity,
    Period,
    bucket_key,
    bucket_keys,
    granularity_for,
    previous_period,
    to_business_date,
    utc_bounds,
    variation,
)
from app.domain.schemas.dashboard import (
    FlowKpis,
    FlowVariations,
    PeriodBucket,
    PeriodRange,
    StateKpis,
)
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    LotStatusHistoryModel,
    ReservationModel,
    ReservationPaymentModel,
    UserModel,
)

ENGAGED_STATUS = "reservation_engagee"


@dataclass(frozen=True)
class SoldLot:
    """One reservation engaged during a period (a « lot vendu »)."""

    reservation_id: int
    lot_id: int
    lot_numero: str
    zone: str | None
    type_lot: str | None
    surface: float | None
    client_name: str | None
    commercial_name: str | None
    engaged_on: date
    # Prix total convenu, falling back to the lot price (0 if absent).
    agreed_total_price: float
    # Prix acte (reservations.sale_price).
    deed_price: float | None
    lot_status: str


def _as_utc(moment: datetime) -> datetime:
    """Aware UTC datetime (SQLite returns naive UTC values)."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)


def _range(period: Period) -> PeriodRange:
    return PeriodRange(date_from=period.date_from, date_to=period.date_to)


class DashboardPeriodService:
    """Queries behind the period KPIs of ``/dashboard/stats``."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def sold_lots(
        self, period: Period, project_id: int | None, user_id: int | None
    ) -> list[SoldLot]:
        """Reservations whose lot entered ``reservation_engagee`` in the period.

        One row per reservation (its earliest engagement row of the period);
        history rows without a reservation are ignored.
        """
        start, end = utc_bounds(period)
        query = (
            select(
                LotStatusHistoryModel.changed_at,
                ReservationModel,
                LotModel,
                ClientModel.name.label("client_name"),
                UserModel.name.label("commercial_name"),
            )
            .join(
                ReservationModel,
                ReservationModel.id == LotStatusHistoryModel.reservation_id,
            )
            .join(LotModel, LotModel.id == LotStatusHistoryModel.lot_id)
            .outerjoin(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(
                LotStatusHistoryModel.to_status == ENGAGED_STATUS,
                LotStatusHistoryModel.changed_at >= start,
                LotStatusHistoryModel.changed_at < end,
            )
            .order_by(LotStatusHistoryModel.changed_at, LotStatusHistoryModel.id)
        )
        if project_id is not None:
            query = query.where(LotModel.project_id == project_id)
        if user_id is not None:
            query = query.where(ReservationModel.reserved_by_user_id == user_id)

        sold: dict[int, SoldLot] = {}
        for changed_at, reservation, lot, client_name, commercial_name in (
            await self.session.execute(query)
        ).all():
            if reservation.id in sold:
                continue
            agreed = reservation.agreed_total_price
            if agreed is None:
                agreed = lot.price if lot.price is not None else 0.0
            sold[reservation.id] = SoldLot(
                reservation_id=reservation.id,
                lot_id=lot.id,
                lot_numero=lot.numero,
                zone=lot.zone,
                type_lot=lot.type_lot,
                surface=lot.surface,
                client_name=client_name,
                commercial_name=commercial_name,
                engaged_on=to_business_date(changed_at),
                agreed_total_price=float(agreed),
                deed_price=reservation.sale_price,
                lot_status=lot.status,
            )
        return sorted(sold.values(), key=lambda row: (row.engaged_on, row.lot_numero))

    async def flow(
        self, period: Period, project_id: int | None, user_id: int | None
    ) -> FlowKpis:
        """Flow KPIs of the period (filters: project, commercial)."""
        sold = await self.sold_lots(period, project_id, user_id)
        created = (
            await self.session.execute(
                self._created_query(
                    select(func.count(ReservationModel.id)),
                    period,
                    project_id,
                    user_id,
                )
            )
        ).scalar_one()
        paid = (
            await self.session.execute(
                self._paid_query(
                    select(func.coalesce(func.sum(ReservationPaymentModel.amount), 0)),
                    period,
                    project_id,
                    user_id,
                )
            )
        ).scalar_one()
        sold_count = len(sold)
        return FlowKpis(
            lots_vendus=sold_count,
            ca=round(sum(row.agreed_total_price for row in sold), 2),
            reservations_creees=created,
            taux_conversion=round(sold_count / created * 100, 1) if created else 0,
            encaissements=round(float(paid), 2),
        )

    @staticmethod
    def _created_query(
        query: Select[Any], period: Period, project_id: int | None, user_id: int | None
    ) -> Select[Any]:
        """Restrict a ``reservations`` query to those created in the period."""
        start, end = utc_bounds(period)
        query = query.where(
            ReservationModel.reservation_date >= start,
            ReservationModel.reservation_date < end,
        )
        if project_id is not None:
            query = query.where(ReservationModel.project_id == project_id)
        if user_id is not None:
            query = query.where(ReservationModel.reserved_by_user_id == user_id)
        return query

    @staticmethod
    def _paid_query(
        query: Select[Any], period: Period, project_id: int | None, user_id: int | None
    ) -> Select[Any]:
        """Restrict a payments query to those paid in the period (joins reservations)."""
        query = query.join(
            ReservationModel,
            ReservationModel.id == ReservationPaymentModel.reservation_id,
        ).where(
            ReservationPaymentModel.paid_on >= period.date_from,
            ReservationPaymentModel.paid_on <= period.date_to,
        )
        if project_id is not None:
            query = query.where(ReservationModel.project_id == project_id)
        if user_id is not None:
            query = query.where(ReservationModel.reserved_by_user_id == user_id)
        return query

    async def series(
        self, period: Period, project_id: int | None, user_id: int | None
    ) -> tuple[Granularity, list[PeriodBucket]]:
        """Flow KPIs per bucket (empty buckets included) over the period."""
        granularity = granularity_for(period)
        buckets = {
            key: PeriodBucket(key=key) for key in bucket_keys(period, granularity)
        }

        for sold in await self.sold_lots(period, project_id, user_id):
            bucket = buckets[bucket_key(sold.engaged_on, granularity)]
            bucket.lots_vendus += 1
            bucket.ca += sold.agreed_total_price

        created_dates = await self.session.execute(
            self._created_query(
                select(ReservationModel.reservation_date), period, project_id, user_id
            )
        )
        for (reserved_at,) in created_dates.all():
            buckets[
                bucket_key(to_business_date(reserved_at), granularity)
            ].reservations_creees += 1

        payments = await self.session.execute(
            self._paid_query(
                select(ReservationPaymentModel.paid_on, ReservationPaymentModel.amount),
                period,
                project_id,
                user_id,
            )
        )
        for paid_on, amount in payments.all():
            buckets[bucket_key(paid_on, granularity)].encaissements += float(amount)

        for bucket in buckets.values():
            bucket.ca = round(bucket.ca, 2)
            bucket.encaissements = round(bucket.encaissements, 2)
        return granularity, list(buckets.values())

    async def state_at(self, day: date, project_id: int | None) -> StateKpis:
        """Available / option lot counts at the end of ``day`` (no user filter).

        A lot's status at that moment is the arrival status of its last history
        row before it, else the departure status of its first later row, else
        its current status. Lots created after that moment are ignored.
        """
        _, end = utc_bounds(Period(day, day))

        lots_query = select(LotModel.id, LotModel.status).where(
            LotModel.created_at < end
        )
        history_query = (
            select(
                LotStatusHistoryModel.lot_id,
                LotStatusHistoryModel.from_status,
                LotStatusHistoryModel.to_status,
                LotStatusHistoryModel.changed_at,
            )
            .join(LotModel, LotModel.id == LotStatusHistoryModel.lot_id)
            .where(LotModel.created_at < end)
            .order_by(
                LotStatusHistoryModel.lot_id,
                LotStatusHistoryModel.changed_at,
                LotStatusHistoryModel.id,
            )
        )
        if project_id is not None:
            lots_query = lots_query.where(LotModel.project_id == project_id)
            history_query = history_query.where(LotModel.project_id == project_id)

        history: dict[int, list[tuple[str, str, datetime]]] = defaultdict(list)
        for lot_id, from_status, to_status, changed_at in (
            await self.session.execute(history_query)
        ).all():
            history[lot_id].append((from_status, to_status, _as_utc(changed_at)))

        statuses: list[str] = []
        for lot_id, current_status in (await self.session.execute(lots_query)).all():
            rows = history.get(lot_id, [])
            before = [row for row in rows if row[2] < end]
            if before:
                statuses.append(before[-1][1])
            elif rows:
                statuses.append(rows[0][0])
            else:
                statuses.append(current_status)

        return StateKpis(
            available=statuses.count("available"), option=statuses.count("option")
        )

    async def history_start(self) -> date | None:
        """Business date of the first ``lot_status_history`` row (whole table)."""
        first = (
            await self.session.execute(
                select(func.min(LotStatusHistoryModel.changed_at))
            )
        ).scalar_one()
        return to_business_date(first) if first is not None else None

    async def period_stats(
        self,
        period: Period,
        project_id: int | None,
        user_id: int | None,
        today: date,
    ) -> dict[str, Any]:
        """The period fields of ``DashboardStats``."""
        previous = previous_period(period)
        start = await self.history_start()
        flow = await self.flow(period, project_id, user_id)
        flow_previous = await self.flow(previous, project_id, user_id)

        if start is not None and previous.date_from < start:
            variations = FlowVariations()
        else:
            variations = FlowVariations(
                **{
                    name: variation(getattr(flow, name), getattr(flow_previous, name))
                    for name in FlowKpis.model_fields
                }
            )

        return {
            "period": _range(period),
            "previous_period": _range(previous),
            "flow": flow,
            "flow_previous": flow_previous,
            "variations": variations,
            "state": await self.state_at(period.date_to, project_id),
            "state_kpis_available": (
                start is None or period.date_to >= start or period.date_to >= today
            ),
            "flow_kpis_available": start is None or period.date_from >= start,
            "history_start": start,
        }
