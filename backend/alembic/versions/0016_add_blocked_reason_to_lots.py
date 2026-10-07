"""Add blocked_reason to lots

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, Sequence[str], None] = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lots", sa.Column("blocked_reason", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column("lots", "blocked_reason")
