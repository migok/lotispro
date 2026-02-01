"""Add lot metadata fields (type_lot, emplacement, type_maison).

Revision ID: 001_lot_metadata
Revises:
Create Date: 2026-02-01
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001_lot_metadata"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add metadata columns to lots table."""
    op.add_column("lots", sa.Column("type_lot", sa.String(50), nullable=True))
    op.add_column("lots", sa.Column("emplacement", sa.String(50), nullable=True))
    op.add_column("lots", sa.Column("type_maison", sa.String(50), nullable=True))


def downgrade() -> None:
    """Remove metadata columns from lots table."""
    op.drop_column("lots", "type_maison")
    op.drop_column("lots", "emplacement")
    op.drop_column("lots", "type_lot")
