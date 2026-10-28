"""Engaged reservation finance: agreed price, gap, payments, changes

Additive migration (E4-T5):
- ``reservations``: ``agreed_total_price`` (prix total convenu),
  ``gap_due_timing`` (``debut | fin | date``) and ``gap_due_date`` of the
  « écart à régulariser » installment.
- ``projects.acte_min_paid_pct``: share of the agreed total price to collect
  before the deed is issued (default 10 %).
- ``payment_installments``: new type ``gap`` and status ``partial``.
- ``reservation_payments``: money actually received (never updated nor
  deleted); ``installment_id`` NULL = first payment at engagement.
- ``reservation_changes``: audit trail of engaged reservation edits.

``promotion_amount`` / ``promotion_received`` / ``promotion_paid_timing`` are
kept but no longer read nor written (no data conversion: nothing in
production).

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: Union[str, Sequence[str], None] = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservations", sa.Column("agreed_total_price", sa.Float(), nullable=True)
    )
    op.add_column(
        "reservations",
        sa.Column("gap_due_timing", sa.String(length=10), nullable=True),
    )
    op.add_column("reservations", sa.Column("gap_due_date", sa.Date(), nullable=True))
    op.create_check_constraint(
        "valid_gap_due_timing",
        "reservations",
        "gap_due_timing IN ('debut', 'fin', 'date')",
    )

    op.add_column(
        "projects",
        sa.Column(
            "acte_min_paid_pct",
            sa.Float(),
            nullable=False,
            server_default=sa.text("10"),
        ),
    )
    op.create_check_constraint(
        "valid_acte_min_paid_pct",
        "projects",
        "acte_min_paid_pct >= 0 AND acte_min_paid_pct <= 100",
    )

    op.drop_constraint("valid_payment_type", "payment_installments", type_="check")
    op.create_check_constraint(
        "valid_payment_type",
        "payment_installments",
        "payment_type IN ('deposit', 'balance', 'gap')",
    )
    op.drop_constraint(
        "valid_installment_status", "payment_installments", type_="check"
    )
    op.create_check_constraint(
        "valid_installment_status",
        "payment_installments",
        "status IN ('pending', 'partial', 'paid')",
    )

    op.create_table(
        "reservation_payments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("installment_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("document_id", sa.Integer(), nullable=True),
        sa.Column("recorded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"]),
        sa.ForeignKeyConstraint(["installment_id"], ["payment_installments.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["lot_documents.id"]),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("amount > 0", name="valid_reservation_payment_amount"),
        sa.CheckConstraint(
            "method IN ('cash', 'card', 'check', 'transfer')",
            name="valid_reservation_payment_method",
        ),
    )
    op.create_index(
        "ix_reservation_payments_reservation",
        "reservation_payments",
        ["reservation_id"],
    )

    op.create_table(
        "reservation_changes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reservation_changes_reservation",
        "reservation_changes",
        ["reservation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reservation_changes_reservation", table_name="reservation_changes"
    )
    op.drop_table("reservation_changes")
    op.drop_index(
        "ix_reservation_payments_reservation", table_name="reservation_payments"
    )
    op.drop_table("reservation_payments")

    # Rows using the new values must go before the narrower constraints.
    op.execute("DELETE FROM payment_installments WHERE payment_type = 'gap'")
    op.execute(
        "UPDATE payment_installments SET status = 'pending' WHERE status = 'partial'"
    )
    op.drop_constraint(
        "valid_installment_status", "payment_installments", type_="check"
    )
    op.create_check_constraint(
        "valid_installment_status",
        "payment_installments",
        "status IN ('pending', 'paid')",
    )
    op.drop_constraint("valid_payment_type", "payment_installments", type_="check")
    op.create_check_constraint(
        "valid_payment_type",
        "payment_installments",
        "payment_type IN ('deposit', 'balance')",
    )

    op.drop_constraint("valid_acte_min_paid_pct", "projects", type_="check")
    op.drop_column("projects", "acte_min_paid_pct")

    op.drop_constraint("valid_gap_due_timing", "reservations", type_="check")
    op.drop_column("reservations", "gap_due_date")
    op.drop_column("reservations", "gap_due_timing")
    op.drop_column("reservations", "agreed_total_price")
