"""Add lot_documents.category

Additive migration: generated documents carry a category (the reservation
deed is ``acte_reservation``); documents uploaded by users keep NULL. The
index serves "latest deed of a reservation" lookups.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, Sequence[str], None] = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lot_documents",
        sa.Column("category", sa.String(length=30), nullable=True),
    )
    op.create_index(
        "ix_lot_documents_reservation_category",
        "lot_documents",
        ["reservation_id", "category"],
    )


def downgrade() -> None:
    op.drop_index("ix_lot_documents_reservation_category", table_name="lot_documents")
    op.drop_column("lot_documents", "category")
