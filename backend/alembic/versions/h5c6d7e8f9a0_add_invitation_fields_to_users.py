"""add_invitation_fields_to_users

Revision ID: h5c6d7e8f9a0
Revises: g4b5c6d7e8f9
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h5c6d7e8f9a0"
down_revision: Union[str, Sequence[str], None] = "g4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add invitation_token and invitation_expires_at to users."""
    op.add_column(
        "users",
        sa.Column("invitation_token", sa.String(128), nullable=True, unique=True),
    )
    op.add_column(
        "users",
        sa.Column("invitation_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_invitation_token", "users", ["invitation_token"], unique=True)


def downgrade() -> None:
    """Remove invitation fields from users."""
    op.drop_index("ix_users_invitation_token", table_name="users")
    op.drop_column("users", "invitation_expires_at")
    op.drop_column("users", "invitation_token")
