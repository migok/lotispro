"""Add notaires table and notaire_id FK on reservations

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    if "notaires" not in existing_tables:
        op.create_table(
            "notaires",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("nom", sa.String(100), nullable=False),
            sa.Column("prenom", sa.String(100), nullable=False),
            sa.Column("telephone", sa.String(30), nullable=False),
            sa.Column("email", sa.String(255), nullable=True),
            sa.Column("ville", sa.String(100), nullable=True),
            sa.Column("adresse", sa.String(500), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("notaires")} if "notaires" in existing_tables else set()
    if "ix_notaires_nom" not in existing_indexes:
        op.create_index("ix_notaires_nom", "notaires", ["nom"])
    if "ix_notaires_telephone" not in existing_indexes:
        op.create_index("ix_notaires_telephone", "notaires", ["telephone"])

    existing_columns = {col["name"] for col in inspector.get_columns("reservations")}
    if "notaire_id" not in existing_columns:
        op.add_column(
            "reservations",
            sa.Column("notaire_id", sa.Integer(), nullable=True),
        )

    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("reservations")}
    if "fk_reservations_notaire_id" not in existing_fks:
        op.create_foreign_key(
            "fk_reservations_notaire_id",
            "reservations",
            "notaires",
            ["notaire_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.drop_constraint("fk_reservations_notaire_id", "reservations", type_="foreignkey")
    op.drop_column("reservations", "notaire_id")
    op.drop_index("ix_notaires_telephone", table_name="notaires")
    op.drop_index("ix_notaires_nom", table_name="notaires")
    op.drop_table("notaires")
