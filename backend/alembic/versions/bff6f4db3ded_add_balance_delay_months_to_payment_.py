"""add_balance_delay_months_to_payment_schedules

Revision ID: bff6f4db3ded
Revises: 089b9494afe9
Create Date: 2026-03-09 16:30:54.968441

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bff6f4db3ded'
down_revision: Union[str, Sequence[str], None] = '089b9494afe9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add missing balance_delay_months column to payment_schedules."""
    op.add_column(
        'payment_schedules',
        sa.Column('balance_delay_months', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    """Remove balance_delay_months column from payment_schedules."""
    op.drop_column('payment_schedules', 'balance_delay_months')
