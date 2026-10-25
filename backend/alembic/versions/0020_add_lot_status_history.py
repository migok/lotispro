"""Add lot_status_history table

Additive migration: one row per lot status change, written by every
workflow transition. Existing lots have no history (only their current
status is known before this migration).

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, Sequence[str], None] = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lot_status_history",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(30), nullable=False),
        sa.Column("to_status", sa.String(30), nullable=False),
        sa.Column("transition", sa.String(30), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("reservation_id", sa.Integer(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lot_status_history_lot_changed",
        "lot_status_history",
        ["lot_id", "changed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_lot_status_history_lot_changed", table_name="lot_status_history"
    )
    op.drop_table("lot_status_history")
