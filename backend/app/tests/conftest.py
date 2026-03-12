"""Pytest configuration and fixtures."""

import asyncio
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.infrastructure.database import get_session
from app.infrastructure.database.models import Base, UserModel
from app.main import create_app

# Test database URL (SQLite for tests)
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_lots.db"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create database session for each test."""
    async_session_factory = sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async with async_session_factory() as session:
        yield session
        await session.rollback()


@pytest.fixture
def app(db_session: AsyncSession) -> FastAPI:
    """Create test application with overridden dependencies."""
    app = create_app()

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create async HTTP client for API testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture
async def test_user(db_session: AsyncSession) -> UserModel:
    """Create a test user."""
    user = UserModel(
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        name="Test User",
        role="commercial",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_manager(db_session: AsyncSession) -> UserModel:
    """Create a test manager user."""
    user = UserModel(
        email="manager@example.com",
        password_hash=hash_password("managerpassword123"),
        name="Test Manager",
        role="manager",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def user_token(test_user: UserModel) -> str:
    """Generate JWT token for test user."""
    return create_access_token(subject=test_user.id)


@pytest.fixture
def manager_token(test_manager: UserModel) -> str:
    """Generate JWT token for test manager."""
    return create_access_token(subject=test_manager.id)


@pytest.fixture
def auth_headers(user_token: str) -> dict[str, str]:
    """Generate authorization headers for test user."""
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture
def manager_auth_headers(manager_token: str) -> dict[str, str]:
    """Generate authorization headers for test manager."""
    return {"Authorization": f"Bearer {manager_token}"}


# ============================================
# Test Data Factories
# ============================================


def make_user_data(**overrides: Any) -> dict[str, Any]:
    """Generate user registration data."""
    defaults = {
        "email": "newuser@example.com",
        "password": "securepassword123",
        "name": "New User",
        "role": "commercial",
    }
    return {**defaults, **overrides}


def make_project_data(**overrides: Any) -> dict[str, Any]:
    """Generate project creation data."""
    defaults = {
        "name": "Test Project",
        "description": "A test project",
        "visibility": "private",
        "ca_objectif": 1000000.0,
    }
    return {**defaults, **overrides}


def make_lot_data(project_id: int, **overrides: Any) -> dict[str, Any]:
    """Generate lot creation data."""
    defaults = {
        "project_id": project_id,
        "numero": "LOT-001",
        "zone": "Zone A",
        "surface": 500.0,
        "price": 150000.0,
        "status": "available",
    }
    return {**defaults, **overrides}


def make_client_data(**overrides: Any) -> dict[str, Any]:
    """Generate client creation data."""
    defaults = {
        "name": "Test Client",
        "phone": "+212600000000",
        "email": "client@example.com",
        "cin": "AB123456",
        "client_type": "investisseur",
    }
    return {**defaults, **overrides}
