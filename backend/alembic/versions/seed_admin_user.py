"""Seed initial admin user (optional data migration).

Revision ID: seed_admin_user
Revises: 684589f25b1f
Create Date: 2026-02-04

This is an optional migration. Only run if you want to create
the initial admin user via Alembic instead of the script.
"""

import os

from alembic import op
from passlib.context import CryptContext
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "seed_admin_user"
down_revision = "684589f25b1f"
branch_labels = None
depends_on = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    """Create initial admin user if environment variables are set."""
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_name = os.getenv("ADMIN_NAME", "System Administrator")

    # Skip if credentials not provided
    if not admin_email or not admin_password:
        print("ℹ️  Skipping admin user creation (ADMIN_EMAIL/ADMIN_PASSWORD not set)")
        return

    # Hash the password
    password_hash = pwd_context.hash(admin_password)

    # Insert admin user (only if email doesn't exist)
    op.execute(
        text(
            """
            INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
            SELECT :email, :password_hash, :name, 'manager', NOW(), NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM users WHERE email = :email
            )
            """
        ).bindparams(
            email=admin_email,
            password_hash=password_hash,
            name=admin_name,
        )
    )

    print(f"✅ Admin user '{admin_email}' created or already exists")


def downgrade() -> None:
    """Remove the admin user (optional - be careful in production)."""
    admin_email = os.getenv("ADMIN_EMAIL")

    if admin_email:
        op.execute(
            text("DELETE FROM users WHERE email = :email").bindparams(email=admin_email)
        )
