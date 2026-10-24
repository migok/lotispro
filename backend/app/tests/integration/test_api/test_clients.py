"""Integration tests for the client profile (fiche client) endpoints."""

from collections.abc import Callable
from typing import Any

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


async def make_complete_client(db_session: AsyncSession, **overrides: Any):
    """A client satisfying every required-field rule (valid to edit)."""
    return await make_client(
        db_session,
        **{"first_name": "Fatima", "acquisition_channel": "smap", **overrides},
    )


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
        existing = await make_complete_client(db_session, last_name="Benali")

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
        existing = await make_complete_client(db_session, maiden_name="X")

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
            json={"first_name": "Amine", "acquisition_channel": "smap"},
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

    @pytest.mark.integration
    async def test_update_rejects_composed_name_too_long(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_complete_client(db_session, last_name="Benali")

        response = await client.put(
            f"/api/clients/{existing.id}",
            json={"first_name": "A" * 100, "last_name": "B" * 150},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("first_name")
        assert "Nom complet trop long (200 caractères max)" in detail["message"]


class TestClientValidation:
    """Normalisation, profile rules and duplicate detection."""

    @pytest.mark.integration
    async def test_create_normalizes_cin(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "cin": "ab 123456"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 201
        assert response.json()["cin"] == "AB123456"

    @pytest.mark.integration
    async def test_create_rejects_invalid_phone(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "phone": "12345"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["field"].endswith("phone")

    @pytest.mark.integration
    async def test_create_samsar_requires_date(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        payload = {k: v for k, v in FULL_PAYLOAD.items() if k != "acquisition_date"}
        response = await client.post(
            "/api/clients", json=payload, headers=auth_headers(commercial)
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["field"].endswith("acquisition_date")

    @pytest.mark.integration
    async def test_create_two_addresses_require_acte_address(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        payload = {k: v for k, v in FULL_PAYLOAD.items() if k != "acte_address"}
        response = await client.post(
            "/api/clients", json=payload, headers=auth_headers(commercial)
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["field"].endswith("acte_address")

    @pytest.mark.integration
    async def test_create_infers_acte_address_from_single_address(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        payload = {**FULL_PAYLOAD, "address_abroad": None, "acte_address": None}
        response = await client.post(
            "/api/clients", json=payload, headers=auth_headers(commercial)
        )

        assert response.status_code == 201
        assert response.json()["acte_address"] == "morocco"

    @pytest.mark.integration
    async def test_update_legacy_client_requires_first_name(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        legacy = await make_client(db_session, name="Ancien Client", last_name=None)

        response = await client.put(
            f"/api/clients/{legacy.id}",
            json={"notes": "x"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["field"] == "first_name"

    @pytest.mark.integration
    async def test_duplicates_by_cin_and_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        by_cin = await make_client(db_session, cin="AB123456")
        by_email = await make_client(db_session, email="Jean@Example.com")
        await make_client(db_session, cin="ZZ999999", email="autre@example.com")

        response = await client.get(
            "/api/clients/duplicates",
            params={"cin": "ab 123456", "email": " jean@example.COM "},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 200
        assert {c["id"] for c in response.json()} == {by_cin.id, by_email.id}

    @pytest.mark.integration
    async def test_duplicates_excludes_given_id(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        own = await make_client(db_session, cin="AB123456")
        other = await make_client(db_session, cin="AB123456")

        response = await client.get(
            "/api/clients/duplicates",
            params={"cin": "AB123456", "exclude_id": own.id},
            headers=auth_headers(commercial),
        )

        assert [c["id"] for c in response.json()] == [other.id]

    @pytest.mark.integration
    async def test_duplicates_without_criteria_is_empty(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        await make_client(db_session)

        response = await client.get(
            "/api/clients/duplicates", headers=auth_headers(commercial)
        )

        assert response.status_code == 200
        assert response.json() == []
