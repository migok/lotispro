"""Add price_per_sqm_acte to lots

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, Sequence[str], None] = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lots", sa.Column("price_per_sqm_acte", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("lots", "price_per_sqm_acte")
