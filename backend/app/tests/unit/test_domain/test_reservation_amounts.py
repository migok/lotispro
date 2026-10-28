"""Engaged reservation amounts (E4-T5): pure rules, compared to the cent."""

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain.reservation_amounts import (
    format_mad,
    gap_amount,
    gap_installment_amount,
    installment_status,
    remaining,
    split_schedule,
    to_cents,
    validate_amounts,
)


class TestToCents:
    def test_rounds_to_the_cent(self) -> None:
        assert to_cents(0.1 + 0.2) == 30
        assert to_cents(1234.567) == 123457
        assert to_cents(0) == 0


class TestGapAmount:
    def test_reference_example(self) -> None:
        assert gap_amount(500000, 450000) == 50000

    def test_never_negative(self) -> None:
        assert gap_amount(450000, 450000) == 0
        assert gap_amount(400000, 450000) == 0

    def test_exact_to_the_cent(self) -> None:
        assert gap_amount(100000.3, 100000.1) == 0.2


class TestSplitSchedule:
    def test_reference_example(self) -> None:
        assert split_schedule(500000, 100000, 50000, 50, "fin") == (150000, 200000)

    def test_without_plan_everything_goes_to_balance(self) -> None:
        assert split_schedule(500000, 100000, 50000, None, "fin") == (0, 350000)

    def test_gap_at_start_counts_in_the_deposit_part(self) -> None:
        # 500 000 x 50 % - 100 000 - 50 000 (gap paid at the start)
        assert split_schedule(500000, 100000, 50000, 50, "debut") == (100000, 250000)

    def test_gap_at_a_date_does_not_count_in_the_deposit_part(self) -> None:
        assert split_schedule(500000, 100000, 50000, 50, "date") == (150000, 200000)

    def test_first_payment_above_deposit_part_gives_no_deposit(self) -> None:
        assert split_schedule(500000, 300000, 0, 50, "fin") == (0, 200000)

    def test_deposit_capped_by_what_is_left(self) -> None:
        assert split_schedule(500000, 100000, 50000, 100, "fin") == (350000, 0)

    def test_parts_always_sum_to_agreed_minus_first_minus_gap(self) -> None:
        deposit, balance = split_schedule(333333.33, 11111.11, 2222.22, 33.3, "fin")
        assert to_cents(deposit) + to_cents(balance) == to_cents(
            333333.33 - 11111.11 - 2222.22
        )

    def test_first_payment_covering_part_of_the_gap_leaves_nothing_else(
        self,
    ) -> None:
        assert split_schedule(500000, 480000, 50000, 50, "fin") == (0, 0)


class TestGapInstallmentAmount:
    def test_whole_gap_when_first_payment_is_below_the_acte_price(self) -> None:
        assert gap_installment_amount(500000, 100000, 50000) == 50000

    def test_capped_by_what_is_left_to_pay(self) -> None:
        assert gap_installment_amount(500000, 480000, 50000) == 20000

    def test_nothing_left(self) -> None:
        assert gap_installment_amount(500000, 500000, 50000) == 0


class TestInstallmentStatus:
    def test_pending_partial_paid(self) -> None:
        assert installment_status(50000, 0) == "pending"
        assert installment_status(50000, 20000) == "partial"
        assert installment_status(50000, 50000) == "paid"

    def test_compared_to_the_cent(self) -> None:
        assert installment_status(0.3, 0.1 + 0.2) == "paid"
        assert installment_status(50000, 49999.99) == "partial"
        assert installment_status(50000, 0.004) == "pending"


class TestRemaining:
    def test_reference_example(self) -> None:
        assert remaining(500000, 100000) == 400000
        assert remaining(500000, 450000) == 50000
        assert remaining(500000, 500000) == 0

    def test_exact_to_the_cent_and_never_negative(self) -> None:
        assert remaining(0.3, 0.1 + 0.2) == 0
        assert remaining(500000, 500001) == 0


class TestValidateAmounts:
    def test_valid_amounts_pass(self) -> None:
        validate_amounts(500000, 450000, 100000)
        validate_amounts(500000, 500000, 500000)

    def test_acte_price_above_agreed(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            validate_amounts(400000, 450000, 100000)
        assert exc.value.message == (
            "Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu."
        )
        assert exc.value.rule == "acte_price_above_agreed"

    def test_first_payment_above_agreed(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            validate_amounts(500000, 450000, 500000.01)
        assert exc.value.message == (
            "Le premier acompte reçu ne peut pas dépasser le prix total convenu."
        )
        assert exc.value.rule == "first_payment_above_agreed"


class TestFormatMad:
    def test_french_thousands_separator(self) -> None:
        assert format_mad(400000) == "400 000"
        assert format_mad(1234567) == "1 234 567"
        assert format_mad(0) == "0"

    def test_cents_only_when_needed(self) -> None:
        assert format_mad(50000.5) == "50 000,50"
        assert format_mad(0.1 + 0.2) == "0,30"
