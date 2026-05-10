"""Add price_per_sqm column to lots

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lots", sa.Column("price_per_sqm", sa.Float(), nullable=True))

    # Backfill: for lots that already have price and surface, compute price_per_sqm
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE lots SET price_per_sqm = price / surface "
            "WHERE price IS NOT NULL AND surface IS NOT NULL AND surface > 0"
        )
    )


def downgrade() -> None:
    op.drop_column("lots", "price_per_sqm")
