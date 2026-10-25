"""Extend client profile (identity, addresses, acquisition, notifications)

Additive migration: new nullable columns on clients, backfill of last_name from
the legacy name column, CHECK constraints and an index on last_name.
The existing "address" column is kept (it now holds the Moroccan address).

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, Sequence[str], None] = "0016"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    sa.Column("last_name", sa.String(length=200), nullable=True),
    sa.Column("first_name", sa.String(length=100), nullable=True),
    sa.Column("maiden_name", sa.String(length=100), nullable=True),
    sa.Column("whatsapp", sa.String(length=20), nullable=True),
    sa.Column("address_abroad", sa.String(length=500), nullable=True),
    sa.Column("acte_address", sa.String(length=10), nullable=True),
    sa.Column("acquisition_channel", sa.String(length=20), nullable=True),
    sa.Column("acquisition_referrer", sa.String(length=200), nullable=True),
    sa.Column("acquisition_date", sa.Date(), nullable=True),
    sa.Column("notification_channels", sa.JSON(), nullable=True),
]


def upgrade() -> None:
    for column in NEW_COLUMNS:
        op.add_column("clients", column)

    # Legacy clients only have a single "name": keep it as the last name.
    op.execute("UPDATE clients SET last_name = name WHERE last_name IS NULL")

    # Default notification channel for existing clients that have an email.
    op.execute(
        "UPDATE clients SET notification_channels = '[\"email\"]' "
        "WHERE email IS NOT NULL AND email <> ''"
    )

    op.create_check_constraint(
        "valid_acte_address",
        "clients",
        "acte_address IS NULL OR acte_address IN ('morocco', 'abroad')",
    )
    op.create_check_constraint(
        "valid_acquisition_channel",
        "clients",
        "acquisition_channel IS NULL OR acquisition_channel IN "
        "('smap', 'bureau_vente', 'reseaux_sociaux', 'recommandation', 'samsar')",
    )
    op.create_index("ix_clients_last_name", "clients", ["last_name"])


def downgrade() -> None:
    op.drop_index("ix_clients_last_name", table_name="clients")
    op.drop_constraint("valid_acquisition_channel", "clients", type_="check")
    op.drop_constraint("valid_acte_address", "clients", type_="check")
    for column in reversed(NEW_COLUMNS):
        op.drop_column("clients", column.name)
