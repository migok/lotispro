"""add_deposit_refund_to_reservations

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column("deposit_refund_amount", sa.Float(), nullable=True))
    op.add_column("reservations", sa.Column("deposit_refund_date", sa.Date(), nullable=True))
    op.add_column("reservations", sa.Column("release_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservations", "release_reason")
    op.drop_column("reservations", "deposit_refund_date")
    op.drop_column("reservations", "deposit_refund_amount")
