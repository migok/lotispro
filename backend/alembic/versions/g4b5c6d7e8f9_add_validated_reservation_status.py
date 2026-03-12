"""add_validated_reservation_status

Revision ID: g4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g4b5c6d7e8f9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL enforces CHECK constraints — drop and recreate with 'validated' added.
    # SQLite doesn't support ALTER CONSTRAINT so we skip for SQLite.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("valid_reservation_status", "reservations", type_="check")
        op.create_check_constraint(
            "valid_reservation_status",
            "reservations",
            "status IN ('active', 'validated', 'expired', 'released', 'converted')",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("valid_reservation_status", "reservations", type_="check")
        op.create_check_constraint(
            "valid_reservation_status",
            "reservations",
            "status IN ('active', 'expired', 'released', 'converted')",
        )
