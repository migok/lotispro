"""Add projects.enabled_optional_statuses

Additive migration: each project chooses which optional lot statuses it uses
("option", "reservation_a_finaliser", "edl"). Existing projects keep today's
behaviour (option and reservation_a_finaliser on, EDL off) through the
server default.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: Union[str, Sequence[str], None] = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "enabled_optional_statuses",
            sa.JSON(),
            nullable=False,
            server_default=sa.text('\'["option","reservation_a_finaliser"]\''),
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "enabled_optional_statuses")
