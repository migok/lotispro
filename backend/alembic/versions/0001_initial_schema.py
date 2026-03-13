"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("address", sa.String(255), nullable=True),
        sa.Column("company", sa.String(150), nullable=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("invitation_token", sa.String(128), nullable=True),
        sa.Column("invitation_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('manager', 'commercial', 'client')", name="valid_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("invitation_token"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_invitation_token", "users", ["invitation_token"])

    # --- projects ---
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("visibility", sa.String(20), nullable=False),
        sa.Column("total_lots", sa.Integer(), nullable=False),
        sa.Column("sold_lots", sa.Integer(), nullable=False),
        sa.Column("ca_objectif", sa.Float(), nullable=True),
        sa.Column("geojson_file_url", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("visibility IN ('public', 'private')", name="valid_visibility"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- assignments ---
    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_by", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assigned_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "project_id", name="unique_assignment"),
    )
    op.create_index("ix_assignments_user_project", "assignments", ["user_id", "project_id"])

    # --- lots ---
    op.create_table(
        "lots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.String(50), nullable=False),
        sa.Column("zone", sa.String(50), nullable=True),
        sa.Column("surface", sa.Float(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("current_reservation_id", sa.Integer(), nullable=True),
        sa.Column("geometry", sa.Text(), nullable=True),
        sa.Column("type_lot", sa.String(50), nullable=True),
        sa.Column("emplacement", sa.String(50), nullable=True),
        sa.Column("type_maison", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('available', 'reserved', 'sold', 'blocked')",
            name="valid_lot_status",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "numero", name="unique_lot_numero"),
    )
    op.create_index("ix_lots_project_status", "lots", ["project_id", "status"])

    # --- clients ---
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("cin", sa.String(20), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("client_type", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "client_type IN ('proprietaire', 'revendeur', 'investisseur', 'autre')",
            name="valid_client_type",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_clients_name", "clients", ["name"])
    op.create_index("ix_clients_phone", "clients", ["phone"])
    op.create_index("ix_clients_cin", "clients", ["cin"])

    # --- reservations ---
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("reserved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reservation_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expiration_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deposit", sa.Float(), nullable=False),
        sa.Column("deposit_date", sa.Date(), nullable=True),
        sa.Column("deposit_refund_amount", sa.Float(), nullable=True),
        sa.Column("deposit_refund_date", sa.Date(), nullable=True),
        sa.Column("release_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'validated', 'expired', 'released', 'converted')",
            name="valid_reservation_status",
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["reserved_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reservations_status", "reservations", ["status"])
    op.create_index("ix_reservations_expiration", "reservations", ["expiration_date"])

    # --- sales ---
    op.create_table(
        "sales",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=True),
        sa.Column("sold_by_user_id", sa.Integer(), nullable=True),
        sa.Column("sale_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"]),
        sa.ForeignKeyConstraint(["sold_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_date", "sales", ["sale_date"])

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(50), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("user_id", sa.String(50), nullable=True),
        sa.Column("old_data", sa.Text(), nullable=True),
        sa.Column("new_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("ix_audit_created", "audit_logs", ["created_at"])

    # --- payment_schedules ---
    op.create_table(
        "payment_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("lot_price", sa.Float(), nullable=False),
        sa.Column("deposit_pct", sa.Float(), nullable=False),
        sa.Column("balance_pct", sa.Float(), nullable=False),
        sa.Column("deposit_total", sa.Float(), nullable=False),
        sa.Column("balance_total", sa.Float(), nullable=False),
        sa.Column("balance_delay_months", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reservation_id"),
    )
    op.create_index("ix_payment_schedules_reservation", "payment_schedules", ["reservation_id"])

    # --- payment_installments ---
    op.create_table(
        "payment_installments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=False),
        sa.Column("payment_type", sa.String(20), nullable=False),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("paid_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("payment_type IN ('deposit', 'balance')", name="valid_payment_type"),
        sa.CheckConstraint("status IN ('pending', 'paid')", name="valid_installment_status"),
        sa.ForeignKeyConstraint(["schedule_id"], ["payment_schedules.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_installments_schedule", "payment_installments", ["schedule_id"])
    op.create_index("ix_installments_due_date", "payment_installments", ["due_date"])


def downgrade() -> None:
    op.drop_table("payment_installments")
    op.drop_table("payment_schedules")
    op.drop_table("audit_logs")
    op.drop_table("sales")
    op.drop_table("reservations")
    op.drop_table("clients")
    op.drop_table("lots")
    op.drop_table("assignments")
    op.drop_table("projects")
    op.drop_table("users")
