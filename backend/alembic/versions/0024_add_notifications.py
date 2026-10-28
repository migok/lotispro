"""Add notifications history and users.phone

Additive migration (E4-T2):
- ``notifications``: one row per channel each time a client (or a
  commercial) is notified about a reservation, with the delivery status.
  ``deadline_at`` is the deadline mentioned in the message; with
  ``(reservation_id, kind)`` it lets the expiration reminders stay idempotent.
- ``users.phone``: the commercial's phone, shown in client notifications.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, Sequence[str], None] = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=30), nullable=True))

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("recipient", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["reservation_id"], ["reservations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["sent_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "recipient IN ('client', 'commercial')",
            name="valid_notification_recipient",
        ),
        sa.CheckConstraint(
            "channel IN ('email', 'sms', 'whatsapp')",
            name="valid_notification_channel",
        ),
        sa.CheckConstraint(
            "kind IN ('option_confirmee', 'reservation_a_finaliser', "
            "'reservation_engagee', 'rappel_expiration')",
            name="valid_notification_kind",
        ),
        sa.CheckConstraint(
            "status IN ('sent', 'failed', 'not_configured')",
            name="valid_notification_status",
        ),
    )
    op.create_index("ix_notifications_client", "notifications", ["client_id"])
    op.create_index("ix_notifications_lot", "notifications", ["lot_id"])
    op.create_index(
        "ix_notifications_reservation_kind_deadline",
        "notifications",
        ["reservation_id", "kind", "deadline_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notifications_reservation_kind_deadline", table_name="notifications"
    )
    op.drop_index("ix_notifications_lot", table_name="notifications")
    op.drop_index("ix_notifications_client", table_name="notifications")
    op.drop_table("notifications")
    op.drop_column("users", "phone")
