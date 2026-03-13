"""Create initial admin user for production.

Usage:
    python scripts/create_admin.py

Environment variables required:
    ADMIN_EMAIL: Email for the admin user
    ADMIN_PASSWORD: Password for the admin user (will be hashed)
    ADMIN_NAME: Name of the admin user
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.infrastructure.database.models import UserModel


async def create_admin_user() -> None:
    """Create an admin user if it doesn't exist."""
    # Get admin credentials from environment
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_name = os.getenv("ADMIN_NAME", "System Administrator")

    if not admin_email or not admin_password:
        print("[WARN] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin creation.")
        return

    # Create async engine and session
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        # Check if admin already exists
        result = await session.execute(
            select(UserModel).where(UserModel.email == admin_email)
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"[INFO] User {admin_email} already exists (role: {existing_user.role}). Skipping.")
            return

        # Create new admin user
        password_hash = hash_password(admin_password)
        admin_user = UserModel(
            email=admin_email,
            password_hash=password_hash,
            name=admin_name,
            role="manager",  # manager is the admin role
        )

        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        print("[SUCCESS] Admin user created successfully!")
        print(f"   ID: {admin_user.id}")
        print(f"   Email: {admin_user.email}")
        print(f"   Name: {admin_user.name}")
        print(f"   Role: {admin_user.role}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_admin_user())
