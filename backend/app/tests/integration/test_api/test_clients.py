"""Integration tests for the client profile (fiche client) endpoints."""

from collections.abc import Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import UserModel
from app.tests.factories import make_client

FULL_PAYLOAD = {
    "last_name": "Benali",
    "first_name": "Fatima",
    "maiden_name": "Alaoui",
    "phone": "+212612345678",
    "whatsapp": "+212612345679",
    "email": "fatima@example.com",
    "address_morocco": "12 rue des Orangers, Casablanca",
    "address_abroad": "5 avenue de Paris, Lyon",
    "acte_address": "abroad",
    "acquisition_channel": "samsar",
    "acquisition_referrer": "Karim",
    "acquisition_date": "2026-10-01",
    "notification_channels": ["email", "whatsapp"],
}


class TestClientProfile:
    """Tests for the extended client profile."""

    @pytest.mark.integration
    async def test_create_client_with_full_profile(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients", json=FULL_PAYLOAD, headers=auth_headers(commercial)
        )

        assert response.status_code == 201
        data = response.json()
        for key, value in FULL_PAYLOAD.items():
            assert data[key] == value
        assert data["name"] == "Fatima Benali"

    @pytest.mark.integration
    async def test_create_client_missing_required_fields(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients", json={}, headers=auth_headers(commercial)
        )

        assert response.status_code == 422
        fields = " ".join(d["field"] for d in response.json()["details"])
        for required in ("last_name", "first_name", "phone", "acquisition_channel"):
            assert required in fields

    @pytest.mark.integration
    async def test_create_client_rejects_unknown_channel(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "acquisition_channel": "tv"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422

    @pytest.mark.integration
    async def test_legacy_client_response_has_new_fields_null(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        legacy = await make_client(db_session, name="Ancien Client", last_name=None)

        response = await client.get(
            f"/api/clients/{legacy.id}", headers=auth_headers(commercial)
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Ancien Client"
        assert data["first_name"] is None
        assert data["acquisition_channel"] is None

    @pytest.mark.integration
    async def test_update_recomputes_name(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_client(db_session, last_name="Benali")

        response = await client.put(
            f"/api/clients/{existing.id}",
            json={"first_name": "Amine"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Amine Benali"

    @pytest.mark.integration
    async def test_update_can_clear_optional_field(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_client(db_session, maiden_name="X")

        put = await client.put(
            f"/api/clients/{existing.id}",
            json={"maiden_name": None},
            headers=auth_headers(commercial),
        )
        assert put.status_code == 200

        response = await client.get(
            f"/api/clients/{existing.id}", headers=auth_headers(commercial)
        )
        assert response.json()["maiden_name"] is None

    @pytest.mark.integration
    async def test_details_include_profile_fields(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_client(
            db_session,
            acquisition_channel="smap",
            address_abroad="Lyon",
            acte_address="abroad",
        )

        response = await client.get(
            f"/api/clients/{existing.id}/details", headers=auth_headers(commercial)
        )

        assert response.status_code == 200
        data = response.json()
        assert data["acquisition_channel"] == "smap"
        assert data["address_abroad"] == "Lyon"
        assert data["acte_address"] == "abroad"

    @pytest.mark.integration
    async def test_update_legacy_client_keeps_name_as_last_name(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        legacy = await make_client(db_session, name="Ancien Client", last_name=None)

        response = await client.put(
            f"/api/clients/{legacy.id}",
            json={"first_name": "Amine"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Amine Ancien Client"

    @pytest.mark.integration
    async def test_create_rejects_composed_name_too_long(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "first_name": "A" * 100, "last_name": "B" * 150},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
