"""Add sale_price, promotion_amount, promotion_paid_timing, promotion_received to reservations

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column("sale_price", sa.Float(), nullable=True))
    op.add_column("reservations", sa.Column("promotion_amount", sa.Float(), nullable=True))
    op.add_column("reservations", sa.Column("promotion_paid_timing", sa.String(10), nullable=True))
    op.add_column(
        "reservations",
        sa.Column("promotion_received", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("reservations", "promotion_received")
    op.drop_column("reservations", "promotion_paid_timing")
    op.drop_column("reservations", "promotion_amount")
    op.drop_column("reservations", "sale_price")
