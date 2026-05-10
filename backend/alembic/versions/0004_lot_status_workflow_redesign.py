"""Lot status workflow redesign (9 statuses)

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels = None
depends_on = None

_NEW_LOT_STATUSES = (
    "creation",
    "available",
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "chez_notaire",
    "chez_proprietaire",
    "blocked",
)

_OLD_LOT_STATUSES = ("available", "reserved", "sold", "blocked")


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # 1. Add new columns to reservations
    op.add_column("reservations", sa.Column("payment_type", sa.String(20), nullable=True))
    op.add_column("reservations", sa.Column("guarantee_amount", sa.Float(), nullable=True))
    op.add_column("reservations", sa.Column("notary_name", sa.String(200), nullable=True))
    op.add_column("reservations", sa.Column("notary_date", sa.Date(), nullable=True))

    # 2. Drop old constraint + widen column (before data migration, so no constraint violation)
    if dialect == "postgresql":
        op.drop_constraint("valid_lot_status", "lots", type_="check")
        op.alter_column(
            "lots",
            "status",
            existing_type=sa.String(20),
            type_=sa.String(30),
            existing_nullable=False,
            server_default="creation",
        )
    else:
        # SQLite requires batch mode for ALTER TABLE
        with op.batch_alter_table("lots", recreate="always") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=sa.String(20),
                type_=sa.String(30),
                existing_nullable=False,
                server_default="creation",
            )
            batch_op.drop_constraint("valid_lot_status", type_="check")

    # 3. Data migration — safe now that old constraint is dropped
    if dialect == "postgresql":
        conn.execute(
            text(
                """
                UPDATE lots
                SET status = 'reservation_a_finaliser'
                FROM reservations r
                WHERE r.id = lots.current_reservation_id
                  AND r.status = 'validated'
                  AND lots.status = 'reserved'
                """
            )
        )
        conn.execute(
            text("UPDATE lots SET status = 'option' WHERE status = 'reserved'")
        )
        conn.execute(
            text("UPDATE lots SET status = 'reservation_soldee' WHERE status = 'sold'")
        )
    else:
        conn.execute(
            text(
                """
                UPDATE lots
                SET status = 'reservation_a_finaliser'
                WHERE lots.status = 'reserved'
                  AND lots.current_reservation_id IS NOT NULL
                  AND (
                      SELECT r.status FROM reservations r
                      WHERE r.id = lots.current_reservation_id
                  ) = 'validated'
                """
            )
        )
        conn.execute(
            text("UPDATE lots SET status = 'option' WHERE status = 'reserved'")
        )
        conn.execute(
            text("UPDATE lots SET status = 'reservation_soldee' WHERE status = 'sold'")
        )

    # 4. Add new constraint (data is now valid)
    if dialect == "postgresql":
        op.create_check_constraint(
            "valid_lot_status",
            "lots",
            "status IN ({})".format(", ".join(f"'{s}'" for s in _NEW_LOT_STATUSES)),
        )
    else:
        with op.batch_alter_table("lots", recreate="always") as batch_op:
            batch_op.create_check_constraint(
                "valid_lot_status",
                "status IN ({})".format(", ".join(f"'{s}'" for s in _NEW_LOT_STATUSES)),
            )

    # 5. Add composite index for alert queries
    op.create_index("ix_lots_status_updated", "lots", ["status", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_lots_status_updated", table_name="lots")

    # Revert data: reservation_soldee → sold, option/reservation_a_finaliser → reserved
    conn = op.get_bind()
    conn.execute(
        text("UPDATE lots SET status = 'sold' WHERE status = 'reservation_soldee'")
    )
    conn.execute(
        text(
            "UPDATE lots SET status = 'reserved' WHERE status IN "
            "('option', 'reservation_a_finaliser', 'reservation_engagee')"
        )
    )
    # Statuses beyond reservation_engagee had no prior equivalent — map to blocked
    conn.execute(
        text(
            "UPDATE lots SET status = 'blocked' WHERE status IN "
            "('chez_notaire', 'chez_proprietaire', 'creation')"
        )
    )

    with op.batch_alter_table("lots", recreate="auto") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(30),
            type_=sa.String(20),
            existing_nullable=False,
            server_default="available",
        )
        batch_op.drop_constraint("valid_lot_status", type_="check")
        batch_op.create_check_constraint(
            "valid_lot_status",
            "status IN ({})".format(", ".join(f"'{s}'" for s in _OLD_LOT_STATUSES)),
        )

    op.drop_column("reservations", "notary_date")
    op.drop_column("reservations", "notary_name")
    op.drop_column("reservations", "guarantee_amount")
    op.drop_column("reservations", "payment_type")
