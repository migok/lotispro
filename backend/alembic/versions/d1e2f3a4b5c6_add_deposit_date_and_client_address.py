"""add_deposit_date_to_reservations_and_address_to_clients

Revision ID: d1e2f3a4b5c6
Revises: bff6f4db3ded
Create Date: 2026-03-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "bff6f4db3ded"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deposit_date to reservations and address to clients."""
    op.add_column(
        "reservations",
        sa.Column("deposit_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("address", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    """Remove deposit_date from reservations and address from clients."""
    op.drop_column("reservations", "deposit_date")
    op.drop_column("clients", "address")
