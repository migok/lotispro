"""Add closed_at to reservations

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, Sequence[str], None] = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservations",
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reservations", "closed_at")
