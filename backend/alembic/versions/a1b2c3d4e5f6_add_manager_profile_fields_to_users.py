"""add_manager_profile_fields_to_users

Revision ID: a1b2c3d4e5f6
Revises: 6f25fe56abef
Create Date: 2026-03-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '6f25fe56abef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add manager profile fields to users table."""
    op.add_column('users', sa.Column('first_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('address', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('company', sa.String(150), nullable=True))


def downgrade() -> None:
    """Remove manager profile fields from users table."""
    op.drop_column('users', 'company')
    op.drop_column('users', 'address')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
