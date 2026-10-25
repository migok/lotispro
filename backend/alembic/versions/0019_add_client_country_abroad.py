"""Add country column to the foreign client address

Additive migration: nullable country for the foreign address.
Existing rows stay NULL (the country is required by the API from now on).

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, Sequence[str], None] = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("country_abroad", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "country_abroad")
