"""Integration tests for the client profile (fiche client) endpoints."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import ReservationModel, UserModel
from app.infrastructure.database.repositories import ReservationRepository
from app.tests.factories import make_client, make_lot, make_project

FULL_PAYLOAD = {
    "last_name": "Benali",
    "first_name": "Fatima",
    "maiden_name": "Alaoui",
    "phone": "+212612345678",
    "whatsapp": "+212612345679",
    "email": "fatima@example.com",
    "address_morocco": "12 rue des Orangers",
    "city_morocco": "Casablanca",
    "address_abroad": "5 avenue de Paris",
    "city_abroad": "Lyon",
    "country_abroad": "France",
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
        **{
            "first_name": "Fatima",
            "acquisition_channel": "smap",
            "address_morocco": "12 rue des Orangers",
            "city_morocco": "Casablanca",
            **overrides,
        },
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
    @pytest.mark.parametrize(
        ("overrides", "expected"),
        [
            ({"notification_channels": None}, ["email"]),
            ({"notification_channels": None, "email": None}, None),
            ({"notification_channels": ["whatsapp"]}, ["whatsapp"]),
        ],
    )
    async def test_create_defaults_notification_channels(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
        overrides: dict[str, Any],
        expected: list[str] | None,
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, **overrides},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 201
        assert response.json()["notification_channels"] == expected

    @pytest.mark.integration
    async def test_invalid_notification_channel_is_not_an_email_error(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "notification_channels": ["fax"]},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["message"] != "Adresse email invalide"

    @pytest.mark.integration
    async def test_too_short_value_reports_min_length(
        self, client: AsyncClient
    ) -> None:
        response = await client.post(
            "/api/users/set-password", json={"token": "abc", "password": "123"}
        )

        assert response.status_code == 422
        details = {d["field"]: d["message"] for d in response.json()["details"]}
        assert details["body.password"] == "Trop court (6 caractères min)"

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
        assert {d["message"] for d in response.json()["details"]} == {
            "Champ obligatoire"
        }

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
        message = response.json()["details"][0]["message"]
        assert message.startswith("Canal d'acquisition invalide")

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
            city_abroad="Lyon",
            country_abroad="France",
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
        assert data["city_abroad"] == "Lyon"
        assert data["country_abroad"] == "France"

    @pytest.mark.integration
    async def test_update_legacy_client_keeps_name_as_last_name(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        legacy = await make_client(
            db_session,
            name="Ancien Client",
            last_name=None,
            address_morocco="1 rue X",
            city_morocco="Rabat",
        )

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
        detail = response.json()["details"][0]
        assert detail["field"].endswith("phone")
        assert detail["message"] == (
            "Numéro invalide (format international, ex. +212612345678)"
        )

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
        payload = {
            **FULL_PAYLOAD,
            "address_abroad": None,
            "city_abroad": None,
            "country_abroad": None,
            "acte_address": None,
        }
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

    @pytest.mark.integration
    async def test_create_rejects_invalid_cin_with_exact_message(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "cin": "123456"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("cin")
        assert detail["message"] == "Format CIN invalide (ex. AB123456)"

    @pytest.mark.integration
    async def test_create_accepts_spaced_numbers_beyond_20_raw_chars(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={
                **FULL_PAYLOAD,
                "phone": "+212 6 12 34 56 78",
                "whatsapp": "0 6 1 2 3 4 5 6 7 8",
                "cin": "A B 1 2 3 4 5 6",
            },
            headers=auth_headers(commercial),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["phone"] == "+212612345678"
        assert data["whatsapp"] == "+212612345678"
        assert data["cin"] == "AB123456"

    @pytest.mark.integration
    async def test_raw_whatsapp_normalised_on_create_and_update(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        headers = auth_headers(commercial)
        created = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "whatsapp": "06 12 34 56 78"},
            headers=headers,
        )
        assert created.json()["whatsapp"] == "+212612345678"

        updated = await client.put(
            f"/api/clients/{created.json()['id']}",
            json={
                "cin": "cd 654321",
                "phone": "0661-234-567",
                "whatsapp": "07 11 22 33 44",
            },
            headers=headers,
        )

        assert updated.status_code == 200
        data = (
            await client.get(f"/api/clients/{created.json()['id']}", headers=headers)
        ).json()
        assert data["cin"] == "CD654321"
        assert data["phone"] == "+212661234567"
        assert data["whatsapp"] == "+212711223344"

    @pytest.mark.integration
    async def test_update_single_address_infers_acte_address(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_complete_client(
            db_session,
            address_morocco=None,
            city_morocco=None,
            address_abroad="Lyon",
            city_abroad="Lyon",
            country_abroad="France",
        )
        headers = auth_headers(commercial)

        put = await client.put(
            f"/api/clients/{existing.id}",
            json={"address_abroad": "5 avenue de Paris", "city_abroad": "Paris"},
            headers=headers,
        )
        assert put.status_code == 200

        data = (await client.get(f"/api/clients/{existing.id}", headers=headers)).json()
        assert data["acte_address"] == "abroad"

    @pytest.mark.integration
    async def test_duplicates_match_legacy_unnormalised_cin(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        legacy = await make_client(db_session, cin="ab 123456")

        response = await client.get(
            "/api/clients/duplicates",
            params={"cin": "AB123456"},
            headers=auth_headers(commercial),
        )

        assert [c["id"] for c in response.json()] == [legacy.id]

    @pytest.mark.integration
    async def test_search_by_first_name_and_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        fatima = await make_complete_client(
            db_session,
            first_name="Fatima",
            last_name="Benali",
            name="Fatima Benali",
            email="fatima@exemple.ma",
        )
        await make_complete_client(
            db_session, name="Karim Autre", first_name="Karim", last_name="Autre"
        )

        by_first_name = await client.get(
            "/api/clients",
            params={"search": "fatima"},
            headers=auth_headers(commercial),
        )
        by_email = await client.get(
            "/api/clients",
            params={"search": "@exemple.ma"},
            headers=auth_headers(commercial),
        )

        assert [c["id"] for c in by_first_name.json()] == [fatima.id]
        assert [c["id"] for c in by_email.json()] == [fatima.id]

    @pytest.mark.integration
    async def test_create_rejects_invalid_email_in_french(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "email": "pas-un-email"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("email")
        assert detail["message"] == "Adresse email invalide"

    @pytest.mark.integration
    async def test_reservation_details_use_acte_address(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        buyer = await make_complete_client(
            db_session,
            address_morocco="12 rue des Orangers",
            city_morocco="Casablanca",
            address_abroad="4 rue des murgers",
            city_abroad="Paris",
            country_abroad="France",
            acte_address="abroad",
        )
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        headers = auth_headers(commercial)
        response = await client.post(
            f"/api/lots/{lot.id}/transitions/direct-reservation",
            headers=headers,
            json={
                "client_id": buyer.id,
                "guarantee_amount": 10000,
                "payment_type": get_args(PAYMENT_TYPE)[0],
                "finalization_date": (
                    datetime.now(UTC) + timedelta(days=15)
                ).isoformat(),
            },
        )
        assert response.status_code == 200
        reservation_id = (
            await db_session.execute(
                select(ReservationModel.id).where(ReservationModel.lot_id == lot.id)
            )
        ).scalar_one()

        details = await ReservationRepository(db_session).get_with_details(
            reservation_id
        )

        assert details is not None
        assert details["client_address"] == "4 rue des murgers, Paris, France"

    @pytest.mark.integration
    async def test_create_requires_at_least_one_address(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        address_keys = (
            "address_morocco",
            "city_morocco",
            "address_abroad",
            "city_abroad",
            "country_abroad",
        )
        payload = {k: v for k, v in FULL_PAYLOAD.items() if k not in address_keys}
        payload["acte_address"] = None
        response = await client.post(
            "/api/clients", json=payload, headers=auth_headers(commercial)
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("address_morocco")
        assert (
            detail["message"] == "Renseignez au moins une adresse (Maroc ou étranger)"
        )

    @pytest.mark.integration
    async def test_create_abroad_address_requires_city(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "city_abroad": None},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("city_abroad")
        assert detail["message"] == "Indiquez la ville"

    @pytest.mark.integration
    async def test_create_abroad_address_requires_country(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients",
            json={**FULL_PAYLOAD, "country_abroad": None},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        detail = response.json()["details"][0]
        assert detail["field"].endswith("country_abroad")
        assert detail["message"] == "Indiquez le pays"

    @pytest.mark.integration
    async def test_update_to_abroad_address_requires_country(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        existing = await make_complete_client(db_session)

        response = await client.put(
            f"/api/clients/{existing.id}",
            json={"address_abroad": "5 avenue de Paris", "city_abroad": "Paris"},
            headers=auth_headers(commercial),
        )

        assert response.status_code == 422
        assert response.json()["details"][0]["field"].endswith("country_abroad")

    @pytest.mark.integration
    async def test_create_returns_country_abroad(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients", json=FULL_PAYLOAD, headers=auth_headers(commercial)
        )

        assert response.status_code == 201
        assert response.json()["country_abroad"] == "France"

    @pytest.mark.integration
    async def test_search_by_country(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        target = await make_complete_client(
            db_session,
            address_abroad="Rue X",
            city_abroad="Lyon",
            country_abroad="Belgique",
        )
        await make_complete_client(db_session)

        response = await client.get(
            "/api/clients",
            params={"search": "belgi"},
            headers=auth_headers(commercial),
        )

        assert [c["id"] for c in response.json()] == [target.id]

    @pytest.mark.integration
    async def test_search_by_city(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        target = await make_complete_client(db_session, city_morocco="Tanger")
        await make_complete_client(db_session)

        response = await client.get(
            "/api/clients",
            params={"search": "tang"},
            headers=auth_headers(commercial),
        )

        assert [c["id"] for c in response.json()] == [target.id]

    @pytest.mark.integration
    async def test_validation_error_top_level_message_is_french(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Callable[[UserModel], dict[str, str]],
    ) -> None:
        response = await client.post(
            "/api/clients", json={}, headers=auth_headers(commercial)
        )

        assert response.status_code == 422
        body = response.json()
        assert body["error"] == "VALIDATION_ERROR"
        assert body["message"] == "Certains champs sont invalides"
