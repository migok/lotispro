"""Add language and status columns to ai_conversations

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-14 17:35:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: language and status were already created in migration 0002."""
    pass


def downgrade() -> None:
    """No-op: see upgrade."""
    pass
