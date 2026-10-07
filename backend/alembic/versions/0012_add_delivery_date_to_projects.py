"""Add delivery_date to projects table

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("delivery_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "delivery_date")
