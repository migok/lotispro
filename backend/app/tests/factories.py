"""Async factories that persist ORM rows for tests.

Every factory takes the ``AsyncSession`` first, then ``add`` + ``commit`` +
``refresh`` so the returned instance is fully loaded (ids, defaults).
"""

import itertools
from datetime import UTC, date, datetime, timedelta
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.infrastructure.database.models import (
    AssignmentModel,
    ClientModel,
    LotModel,
    LotStatusHistoryModel,
    NotaireModel,
    ProjectModel,
    ReservationModel,
    ReservationPaymentModel,
    UserModel,
)

# Plain-text password shared by every user created through ``make_user``.
TEST_PASSWORD = "testpassword123"

_sequence = itertools.count(1)

T = TypeVar("T")


async def _persist(session: AsyncSession, instance: T) -> T:
    session.add(instance)
    await session.commit()
    await session.refresh(instance)
    return instance


async def make_user(
    session: AsyncSession,
    role: str = "commercial",
    email: str | None = None,
) -> UserModel:
    n = next(_sequence)
    return await _persist(
        session,
        UserModel(
            email=email or f"{role}{n}@example.com",
            password_hash=hash_password(TEST_PASSWORD),
            name=f"Test {role.capitalize()} {n}",
            role=role,
        ),
    )


async def make_project(
    session: AsyncSession, created_by: UserModel, **overrides: Any
) -> ProjectModel:
    n = next(_sequence)
    fields: dict[str, Any] = {
        "name": f"Test Project {n}",
        "description": "A test project",
        "visibility": "private",
        "created_by": created_by.id,
    }
    return await _persist(session, ProjectModel(**{**fields, **overrides}))


async def make_lot(
    session: AsyncSession,
    project: ProjectModel,
    status: str = "available",
    price: float | None = 500000.0,
    surface: float | None = 200.0,
    numero: str | None = None,
    **overrides: Any,
) -> LotModel:
    fields: dict[str, Any] = {
        "project_id": project.id,
        "numero": numero or f"LOT-{next(_sequence):03d}",
        "status": status,
        "price": price,
        "surface": surface,
    }
    return await _persist(session, LotModel(**{**fields, **overrides}))


async def make_client(
    session: AsyncSession,
    created_by: UserModel | None = None,
    **overrides: Any,
) -> ClientModel:
    n = next(_sequence)
    name = overrides.get("name", f"Test Client {n}")
    fields: dict[str, Any] = {
        "name": name,
        "last_name": name,
        "phone": "+212600000000",
        "email": f"client{n}@example.com",
        "client_type": "investisseur",
        "created_by_user_id": created_by.id if created_by else None,
    }
    return await _persist(session, ClientModel(**{**fields, **overrides}))


async def make_notaire(session: AsyncSession, **overrides: Any) -> NotaireModel:
    fields: dict[str, Any] = {
        "nom": "Notaire",
        "prenom": "Test",
        "telephone": "+212600000000",
    }
    return await _persist(session, NotaireModel(**{**fields, **overrides}))


async def assign(
    session: AsyncSession, user: UserModel, project: ProjectModel
) -> AssignmentModel:
    return await _persist(
        session,
        AssignmentModel(user_id=user.id, project_id=project.id, assigned_by=user.id),
    )


async def make_reservation(
    session: AsyncSession,
    lot: LotModel,
    client: ClientModel,
    *,
    user: UserModel | None = None,
    reservation_date: datetime | None = None,
    agreed_total_price: float | None = None,
    sale_price: float | None = None,
    **overrides: Any,
) -> ReservationModel:
    reserved_on = reservation_date or datetime.now(UTC)
    fields: dict[str, Any] = {
        "project_id": lot.project_id,
        "lot_id": lot.id,
        "client_id": client.id,
        "reserved_by_user_id": user.id if user else None,
        "reservation_date": reserved_on,
        "expiration_date": reserved_on + timedelta(days=30),
        "agreed_total_price": agreed_total_price,
        "sale_price": sale_price,
    }
    return await _persist(session, ReservationModel(**{**fields, **overrides}))


async def make_status_change(
    session: AsyncSession,
    lot: LotModel,
    to_status: str,
    changed_at: datetime,
    *,
    from_status: str = "available",
    reservation: ReservationModel | None = None,
    transition: str = "test",
) -> LotStatusHistoryModel:
    """A ``lot_status_history`` row only (the lot itself is left unchanged)."""
    return await _persist(
        session,
        LotStatusHistoryModel(
            lot_id=lot.id,
            from_status=from_status,
            to_status=to_status,
            transition=transition,
            reservation_id=reservation.id if reservation else None,
            changed_at=changed_at,
        ),
    )


async def make_reservation_payment(
    session: AsyncSession,
    reservation: ReservationModel,
    amount: float,
    paid_on: date,
    method: str = "transfer",
) -> ReservationPaymentModel:
    return await _persist(
        session,
        ReservationPaymentModel(
            reservation_id=reservation.id,
            amount=amount,
            paid_on=paid_on,
            method=method,
        ),
    )
