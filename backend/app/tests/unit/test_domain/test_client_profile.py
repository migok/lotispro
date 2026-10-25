"""Unit tests for client profile normalisation and validation."""

from types import SimpleNamespace

import pytest

from app.core.exceptions import ValidationError
from app.domain.client_profile import (
    acte_address_of,
    normalize_cin,
    normalize_phone,
    validate_client_profile,
)

VALID = {
    "last_name": "Benali",
    "first_name": "Fatima",
    "phone": "+212612345678",
    "acquisition_channel": "smap",
}


class TestNormalizeCin:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("ab 123456", "AB123456"), ("A1", "A1"), ("", None), (None, None)],
    )
    def test_valid(self, raw: str | None, expected: str | None) -> None:
        assert normalize_cin(raw) == expected

    @pytest.mark.parametrize("raw", ["123456", "ABC12", "AB1234567", "AB١٢٣"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(ValueError, match="Format CIN invalide"):
            normalize_cin(raw)


class TestNormalizePhone:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("06 12 34 56 78", "+212612345678"),
            ("0612-345-678", "+212612345678"),
            ("06.12.34.56.78", "+212612345678"),
            ("+33 6 12 34 56 78", "+33612345678"),
            ("00212612345678", "+212612345678"),
            ("", None),
            (None, None),
        ],
    )
    def test_valid(self, raw: str | None, expected: str | None) -> None:
        assert normalize_phone(raw) == expected

    @pytest.mark.parametrize("raw", ["12345", "abc", "+2١٢612345678", "٠٦١٢٣٤٥٦٧٨"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(ValueError, match="Numéro invalide"):
            normalize_phone(raw)


class TestValidateClientProfile:
    @pytest.mark.parametrize(
        "field", ["last_name", "first_name", "phone", "acquisition_channel"]
    )
    def test_rule1_required_fields(self, field: str) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_client_profile({**VALID, field: "  "})
        assert exc.value.details["field"] == field
        assert exc.value.message == "Champ obligatoire"

    @pytest.mark.parametrize("channel", ["recommandation", "samsar"])
    def test_rule2_referrer_required(self, channel: str) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_client_profile({**VALID, "acquisition_channel": channel})
        assert exc.value.details["field"] == "acquisition_referrer"

    def test_rule3_samsar_requires_date(self) -> None:
        state = {
            **VALID,
            "acquisition_channel": "samsar",
            "acquisition_referrer": "Karim",
        }
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "acquisition_date"

    def test_rule4_two_addresses_require_acte_address(self) -> None:
        state = {
            **VALID,
            "address_morocco": "Casa",
            "city_morocco": "Casablanca",
            "address_abroad": "Lyon",
            "city_abroad": "Lyon",
            "country_abroad": "France",
        }
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "acte_address"

    @pytest.mark.parametrize(
        ("address_field", "expected"),
        [("address_morocco", "morocco"), ("address_abroad", "abroad")],
    )
    def test_rule5_single_address_infers_acte_address(
        self, address_field: str, expected: str
    ) -> None:
        city_field = address_field.replace("address", "city")
        result = validate_client_profile(
            {
                **VALID,
                address_field: "Quelque part",
                city_field: "Ville",
                "country_abroad": "France",
            }
        )
        assert result["acte_address"] == expected

    def test_rule6_acte_address_points_to_empty_address(self) -> None:
        state = {
            **VALID,
            "address_morocco": "Casa",
            "city_morocco": "Casablanca",
            "acte_address": "abroad",
        }
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "acte_address"

    @pytest.mark.parametrize("blank", [None, "", "  "])
    def test_rule7_requires_at_least_one_address(self, blank: str | None) -> None:
        state = {**VALID, "address_morocco": blank, "address_abroad": blank}
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "address_morocco"
        assert (
            exc.value.message == "Renseignez au moins une adresse (Maroc ou étranger)"
        )

    @pytest.mark.parametrize("address_field", ["address_morocco", "address_abroad"])
    @pytest.mark.parametrize("blank", [None, "  "])
    def test_rule8_city_required_with_address(
        self, address_field: str, blank: str | None
    ) -> None:
        city_field = address_field.replace("address", "city")
        state = {**VALID, address_field: "Quelque part", city_field: blank}
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == city_field
        assert exc.value.message == "Indiquez la ville"

    @pytest.mark.parametrize("blank", [None, "  "])
    def test_rule8_country_required_with_abroad_address(
        self, blank: str | None
    ) -> None:
        state = {
            **VALID,
            "address_abroad": "Quelque part",
            "city_abroad": "Lyon",
            "country_abroad": blank,
        }
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "country_abroad"
        assert exc.value.message == "Indiquez le pays"

    def test_rule8_city_is_checked_before_country(self) -> None:
        state = {**VALID, "address_abroad": "Quelque part"}
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "city_abroad"

    def test_country_not_required_without_abroad_address(self) -> None:
        state = {**VALID, "address_morocco": "Casa", "city_morocco": "Casablanca"}
        assert validate_client_profile(state)["acte_address"] == "morocco"

    def test_valid_state_with_city_is_returned_completed(self) -> None:
        state = {
            **VALID,
            "address_abroad": "Lyon",
            "city_abroad": "Lyon",
            "country_abroad": "France",
        }
        assert validate_client_profile(state) == {**state, "acte_address": "abroad"}


class TestActeAddressOf:
    @staticmethod
    def _client(**fields: str | None) -> SimpleNamespace:
        defaults = {
            "address_morocco": None,
            "address_abroad": None,
            "city_morocco": None,
            "city_abroad": None,
            "country_abroad": None,
            "acte_address": None,
        }
        return SimpleNamespace(**{**defaults, **fields})

    def test_abroad_choice(self) -> None:
        client = self._client(
            address_morocco="Casa", address_abroad="Lyon", acte_address="abroad"
        )
        assert acte_address_of(client) == "Lyon"

    def test_morocco_choice(self) -> None:
        client = self._client(
            address_morocco="Casa", address_abroad="Lyon", acte_address="morocco"
        )
        assert acte_address_of(client) == "Casa"

    def test_single_address_without_choice(self) -> None:
        assert acte_address_of(self._client(address_abroad="Lyon")) == "Lyon"
        assert acte_address_of(self._client(address_morocco="Casa")) == "Casa"

    def test_no_address(self) -> None:
        assert acte_address_of(self._client()) is None
        assert acte_address_of(self._client(address_morocco="  ")) is None

    def test_city_is_appended(self) -> None:
        client = self._client(
            address_morocco="Casa",
            city_morocco="Casablanca",
            address_abroad="Lyon",
            city_abroad="Paris",
            country_abroad="France",
            acte_address="abroad",
        )
        assert acte_address_of(client) == "Lyon, Paris, France"
        client.acte_address = "morocco"
        assert acte_address_of(client) == "Casa, Casablanca"

    def test_missing_city_is_omitted(self) -> None:
        assert acte_address_of(self._client(address_morocco="Casa")) == "Casa"
        assert (
            acte_address_of(self._client(address_morocco="Casa", city_morocco=" "))
            == "Casa"
        )

    def test_legacy_abroad_address_without_country_is_omitted(self) -> None:
        client = self._client(address_abroad="Lyon", city_abroad="Paris")
        assert acte_address_of(client) == "Lyon, Paris"
        client.country_abroad = "  "
        assert acte_address_of(client) == "Lyon, Paris"

    def test_country_only_applies_to_the_abroad_address(self) -> None:
        client = self._client(
            address_morocco="Casa",
            city_morocco="Casablanca",
            country_abroad="France",
            acte_address="morocco",
        )
        assert acte_address_of(client) == "Casa, Casablanca"
