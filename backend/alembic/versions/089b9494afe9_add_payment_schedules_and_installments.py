"""add payment schedules and installments

Revision ID: 089b9494afe9
Revises: a1b2c3d4e5f6
Create Date: 2026-03-09 14:37:35.540470

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '089b9494afe9'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create payment_schedules and payment_installments tables."""
    op.create_table(
        'payment_schedules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reservation_id', sa.Integer(), nullable=False),
        sa.Column('lot_price', sa.Float(), nullable=False),
        sa.Column('deposit_pct', sa.Float(), nullable=False, server_default='50.0'),
        sa.Column('balance_pct', sa.Float(), nullable=False, server_default='50.0'),
        sa.Column('deposit_total', sa.Float(), nullable=False),
        sa.Column('balance_total', sa.Float(), nullable=False),
        sa.Column('balance_delay_months', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['reservation_id'], ['reservations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reservation_id'),
    )
    op.create_index('ix_payment_schedules_reservation_id', 'payment_schedules', ['reservation_id'])

    op.create_table(
        'payment_installments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('schedule_id', sa.Integer(), nullable=False),
        sa.Column('payment_type', sa.String(length=20), nullable=False),
        sa.Column('installment_number', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('paid_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("payment_type IN ('deposit', 'balance')", name='ck_payment_installments_type'),
        sa.CheckConstraint("status IN ('pending', 'paid')", name='ck_payment_installments_status'),
        sa.ForeignKeyConstraint(['schedule_id'], ['payment_schedules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_payment_installments_schedule_id', 'payment_installments', ['schedule_id'])


def downgrade() -> None:
    """Drop payment tables."""
    op.drop_index('ix_payment_installments_schedule_id', table_name='payment_installments')
    op.drop_table('payment_installments')
    op.drop_index('ix_payment_schedules_reservation_id', table_name='payment_schedules')
    op.drop_table('payment_schedules')
