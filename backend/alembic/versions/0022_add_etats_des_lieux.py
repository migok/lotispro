"""Add etats_des_lieux / edl_actions and the three EDL lot statuses

Creates the état des lieux tables and widens the ``valid_lot_status``
constraint with ``edl_programme``, ``edl_realise`` and ``edl_finalise``
(drop + create, same name). Existing lots are untouched.

Downgrade refuses to run while a lot is in an EDL status (PostgreSQL), since
the narrower constraint could not be restored.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, Sequence[str], None] = "0021"
branch_labels = None
depends_on = None

_EDL_STATUSES = ("edl_programme", "edl_realise", "edl_finalise")
_STATUSES_BEFORE = (
    "creation",
    "available",
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "chez_notaire",
    "chez_proprietaire",
    "blocked",
)
_STATUSES_AFTER = (
    *_STATUSES_BEFORE[:6],
    *_EDL_STATUSES,
    *_STATUSES_BEFORE[6:],
)


_DOWNGRADE_REFUSED = (
    "Downgrade 0022 impossible : des lots sont en statut état des lieux. "
    "Changez leur statut avant de revenir en arrière."
)


def _in_list(statuses: tuple[str, ...]) -> str:
    return ", ".join(f"'{s}'" for s in statuses)


def _replace_lot_status_constraint(statuses: tuple[str, ...]) -> None:
    condition = f"status IN ({_in_list(statuses)})"
    if op.get_context().dialect.name == "postgresql":
        op.drop_constraint("valid_lot_status", "lots", type_="check")
        op.create_check_constraint("valid_lot_status", "lots", condition)
    else:
        with op.batch_alter_table("lots", recreate="always") as batch_op:
            batch_op.drop_constraint("valid_lot_status", type_="check")
            batch_op.create_check_constraint("valid_lot_status", condition)


def upgrade() -> None:
    op.create_table(
        "etats_des_lieux",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("intervenant", sa.String(200), nullable=False),
        sa.Column("schedule_note", sa.Text(), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_note", sa.Text(), nullable=True),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"]),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_etats_des_lieux_lot", "etats_des_lieux", ["lot_id"])
    op.create_index(
        "ix_etats_des_lieux_reservation", "etats_des_lieux", ["reservation_id"]
    )

    op.create_table(
        "edl_actions",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("etat_des_lieux_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("responsable", sa.String(200), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="ouverte"),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["etat_des_lieux_id"], ["etats_des_lieux.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('ouverte', 'faite')", name="valid_edl_action_status"
        ),
    )
    op.create_index(
        "ix_edl_actions_etat_des_lieux", "edl_actions", ["etat_des_lieux_id"]
    )

    _replace_lot_status_constraint(_STATUSES_AFTER)


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM lots WHERE status IN ({_in_list(_EDL_STATUSES)})
                ) THEN
                    RAISE EXCEPTION '{_DOWNGRADE_REFUSED}';
                END IF;
            END
            $$;
            """
        )

    _replace_lot_status_constraint(_STATUSES_BEFORE)

    op.drop_index("ix_edl_actions_etat_des_lieux", table_name="edl_actions")
    op.drop_table("edl_actions")
    op.drop_index("ix_etats_des_lieux_reservation", table_name="etats_des_lieux")
    op.drop_index("ix_etats_des_lieux_lot", table_name="etats_des_lieux")
    op.drop_table("etats_des_lieux")
