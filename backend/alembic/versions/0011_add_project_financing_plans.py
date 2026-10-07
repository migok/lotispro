"""Add project_financing_plans table

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_financing_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("deposit_pct", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("deposit_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deposit_periodicity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("balance_delay_months", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("balance_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("balance_periodicity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_financing_plans_project",
        "project_financing_plans",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_financing_plans_project", table_name="project_financing_plans")
    op.drop_table("project_financing_plans")
