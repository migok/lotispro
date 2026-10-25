"""Add city columns to client addresses

Additive migration: nullable city for the Moroccan and the foreign address.
Existing rows stay NULL (the cities are required by the API from now on).

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, Sequence[str], None] = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("city_morocco", sa.String(100), nullable=True))
    op.add_column("clients", sa.Column("city_abroad", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "city_abroad")
    op.drop_column("clients", "city_morocco")
