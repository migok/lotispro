"""add_geojson_file_url_to_projects

Revision ID: 6f25fe56abef
Revises: seed_admin_user
Create Date: 2026-02-21 15:08:42.116702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f25fe56abef'
down_revision: Union[str, Sequence[str], None] = 'seed_admin_user'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add geojson_file_url column to projects table
    op.add_column(
        'projects',
        sa.Column('geojson_file_url', sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove geojson_file_url column from projects table
    op.drop_column('projects', 'geojson_file_url')
