"""Add lot_pricing_configs table

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, Sequence[str], None] = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lot_pricing_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("zone", sa.String(50), nullable=True),
        sa.Column("type_lot", sa.String(50), nullable=True),
        sa.Column("type_maison", sa.String(50), nullable=True),
        sa.Column("emplacement", sa.String(50), nullable=True),
        sa.Column("prix_m2_acte", sa.Float(), nullable=False),
        sa.Column("prix_m2_catalogue", sa.Float(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "zone",
            "type_lot",
            "type_maison",
            "emplacement",
            name="uq_lot_pricing_config_combination",
        ),
    )
    op.create_index(
        "ix_lot_pricing_configs_project",
        "lot_pricing_configs",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lot_pricing_configs_project", table_name="lot_pricing_configs")
    op.drop_table("lot_pricing_configs")
