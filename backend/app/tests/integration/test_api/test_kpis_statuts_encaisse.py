"""KPIs on the E3 lot statuses and amounts actually received (E4).

Rules (user decisions of 2026-11-07):
- a lot is *sold* once ``chez_proprietaire``; ``option`` → ``chez_notaire`` are *in progress*;
- a reservation's received amount is the sum of its ``reservation_payments``
  once engaged, else the option deposit + the guarantee;
- the project « Encaissé » card covers the in-progress reservations only.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import (
    ClientModel,
    ProjectModel,
    SaleModel,
    UserModel,
)
from app.tests.factories import (
    _persist,
    assign,
    make_client,
    make_lot,
    make_project,
    make_reservation,
    make_reservation_payment,
)

PAID_ON = date(2026, 10, 1)


@dataclass
class Scenario:
    project: ProjectModel
    client: ClientModel


async def _sale(
    db: AsyncSession, lot, reservation, client, user: UserModel, price: float
) -> None:
    await _persist(
        db,
        SaleModel(
            project_id=lot.project_id,
            lot_id=lot.id,
            client_id=client.id,
            reservation_id=reservation.id,
            sold_by_user_id=user.id,
            sale_date=datetime.now(UTC),
            price=price,
        ),
    )


async def _scenario(
    db: AsyncSession, manager: UserModel, commercial: UserModel
) -> Scenario:
    """7 lots, one per stage; every reservation is the commercial's.

    - L1 available, L7 blocked;
    - L2 option: deposit 10 000 (client A);
    - L3 à finaliser: deposit 5 000 + guarantee 20 000 (client B);
    - L4 engagée: payments 10 000 + 90 000, deposit 10 000 kept (client A);
    - L5 soldée: sale 700 000, payments 700 000 (client B);
    - L6 chez le propriétaire, 250 m²: sale 800 000, payments 800 000 (client A).
    """
    project = await make_project(db, manager)
    await assign(db, commercial, project)
    client_a = await make_client(db, commercial)
    client_b = await make_client(db, commercial)

    await make_lot(db, project, status="available", numero="L1")
    await make_lot(db, project, status="blocked", numero="L7")

    l2 = await make_lot(db, project, status="option", numero="L2")
    r2 = await make_reservation(db, l2, client_a, user=commercial, deposit=10_000)
    l2.current_reservation_id = r2.id

    l3 = await make_lot(db, project, status="reservation_a_finaliser", numero="L3")
    r3 = await make_reservation(
        db, l3, client_b, user=commercial, deposit=5_000, guarantee_amount=20_000
    )
    l3.current_reservation_id = r3.id

    l4 = await make_lot(db, project, status="reservation_engagee", numero="L4")
    r4 = await make_reservation(
        db, l4, client_a, user=commercial, deposit=10_000, agreed_total_price=600_000
    )
    l4.current_reservation_id = r4.id
    await make_reservation_payment(db, r4, 10_000, PAID_ON)
    await make_reservation_payment(db, r4, 90_000, PAID_ON)

    l5 = await make_lot(db, project, status="reservation_soldee", numero="L5")
    r5 = await make_reservation(
        db,
        l5,
        client_b,
        user=commercial,
        status="converted",
        agreed_total_price=700_000,
    )
    l5.current_reservation_id = r5.id
    await make_reservation_payment(db, r5, 700_000, PAID_ON)
    await _sale(db, l5, r5, client_b, commercial, 700_000)

    l6 = await make_lot(
        db, project, status="chez_proprietaire", numero="L6", surface=250.0
    )
    r6 = await make_reservation(
        db,
        l6,
        client_a,
        user=commercial,
        status="converted",
        agreed_total_price=800_000,
    )
    l6.current_reservation_id = r6.id
    await make_reservation_payment(db, r6, 800_000, PAID_ON)
    await _sale(db, l6, r6, client_a, commercial, 800_000)

    await db.commit()
    return Scenario(project=project, client=client_a)


@pytest.mark.integration
class TestProjectKpis:
    async def test_counts_use_the_e3_statuses(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            f"/api/projects/{s.project.id}/kpis", headers=auth_headers(manager)
        )

        assert resp.status_code == 200, resp.json()
        kpis = resp.json()
        assert kpis["total_lots"] == 7
        assert kpis["available_lots"] == 1
        assert kpis["blocked_lots"] == 1
        assert kpis["sold_lots"] == 1
        assert kpis["reserved_lots"] == 4
        assert kpis["surface_vendue"] == 250
        assert kpis["surface_reservee"] == 800
        assert kpis["taux_vente"] == pytest.approx(14.29)
        assert kpis["taux_reservation"] == pytest.approx(57.14)
        # Average prices on the sales of the lots handed over only
        assert kpis["prix_moyen_lot"] == 800_000
        assert kpis["prix_moyen_m2"] == 3_200

    async def test_total_deposits_is_received_on_in_progress_reservations(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            f"/api/projects/{s.project.id}/kpis", headers=auth_headers(manager)
        )

        # option 10 000 + à finaliser 5 000 + 20 000 + engagée 100 000
        assert resp.json()["total_deposits"] == 135_000

    async def test_commercial_filter_uses_the_same_rules(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            f"/api/projects/{s.project.id}/kpis",
            headers=auth_headers(manager),
            params={"user_id": commercial.id},
        )

        assert resp.status_code == 200, resp.json()
        kpis = resp.json()
        assert kpis["sold_lots"] == 1
        assert kpis["reserved_lots"] == 4
        assert kpis["surface_vendue"] == 250
        assert kpis["surface_reservee"] == 800
        assert kpis["prix_moyen_lot"] == 800_000
        assert kpis["prix_moyen_m2"] == 3_200
        assert kpis["total_deposits"] == 135_000


@pytest.mark.integration
class TestProjectList:
    async def test_list_and_detail_count_lots_by_e3_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)
        headers = auth_headers(manager)

        listed = await client.get("/api/projects", headers=headers)
        detail = await client.get(f"/api/projects/{s.project.id}", headers=headers)

        row = next(p for p in listed.json() if p["id"] == s.project.id)
        for body in (row, detail.json()):
            assert body["total_lots"] == 7
            assert body["available_lots"] == 1
            assert body["reserved_lots"] == 4
            assert body["sold_lots"] == 1


@pytest.mark.integration
class TestDashboard:
    async def test_en_cours_excludes_lots_handed_over(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            "/api/dashboard/stats",
            headers=auth_headers(manager),
            params={"project_id": s.project.id},
        )

        body = resp.json()
        assert body["counts"]["en_cours"] == 4
        assert body["counts"]["chez_proprietaire"] == 1
        assert body["surfaces"]["en_cours"] == 800
        assert body["percentages"]["en_cours"] == pytest.approx(57.14)

    async def test_commercial_stats_deposits_are_received_amounts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            "/api/dashboard/commercial-stats",
            headers=auth_headers(manager),
            params={"project_id": s.project.id},
        )

        row = next(r for r in resp.json() if r["commercial_id"] == commercial.id)
        assert row["total_deposits"] == 135_000

    async def test_clients_pipeline_deposit_is_received_amount(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            "/api/dashboard/clients-pipeline", headers=auth_headers(manager)
        )

        row = next(r for r in resp.json() if r["id"] == s.client.id)
        # option 10 000 + engagée 100 000 + chez le propriétaire 800 000
        assert row["total_deposit"] == 910_000


@pytest.mark.integration
class TestClientDetail:
    async def test_reservations_carry_their_received_amount(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        s = await _scenario(db_session, manager, commercial)

        resp = await client.get(
            f"/api/clients/{s.client.id}/details", headers=auth_headers(manager)
        )

        assert resp.status_code == 200, resp.json()
        body = resp.json()
        received = sorted(r["amount_received"] for r in body["reservations_history"])
        assert received == [10_000, 100_000, 800_000]
        assert body["stats"]["total_deposit"] == 910_000
