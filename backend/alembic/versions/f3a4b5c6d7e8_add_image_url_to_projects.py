"""add_image_url_to_projects

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-03-11 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add image_url column to projects table."""
    op.add_column("projects", sa.Column("image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove image_url column from projects table."""
    op.drop_column("projects", "image_url")
