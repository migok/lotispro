"""Add ai_conversations table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-14 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create ai_conversations table for AI Assistant."""
    # Create ai_conversations table
    op.create_table(
        'ai_conversations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('messages', sa.JSON, nullable=False, default=list),
        sa.Column('language', sa.String(10), nullable=False, server_default='fr'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create index for faster queries
    op.create_index(
        'ix_ai_conversations_user_updated',
        'ai_conversations',
        ['user_id', 'updated_at']
    )


def downgrade() -> None:
    """Drop ai_conversations table."""
    op.drop_index('ix_ai_conversations_user_updated', table_name='ai_conversations')
    op.drop_table('ai_conversations')
