"""Add deposit_refund_payment_type to reservations

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservations",
        sa.Column("deposit_refund_payment_type", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reservations", "deposit_refund_payment_type")
