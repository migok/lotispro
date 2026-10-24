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
        state = {**VALID, "address_morocco": "Casa", "address_abroad": "Lyon"}
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
        result = validate_client_profile({**VALID, address_field: "Quelque part"})
        assert result["acte_address"] == expected

    def test_rule6_acte_address_points_to_empty_address(self) -> None:
        state = {**VALID, "address_morocco": "Casa", "acte_address": "abroad"}
        with pytest.raises(ValidationError) as exc:
            validate_client_profile(state)
        assert exc.value.details["field"] == "acte_address"

    def test_valid_state_without_addresses_is_returned_unchanged(self) -> None:
        assert validate_client_profile(VALID) == VALID


class TestActeAddressOf:
    @staticmethod
    def _client(**fields: str | None) -> SimpleNamespace:
        defaults = {
            "address_morocco": None,
            "address_abroad": None,
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
