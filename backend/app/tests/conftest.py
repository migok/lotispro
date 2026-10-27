"""Pytest configuration and fixtures.

Each test gets its own in-memory SQLite database, so no state can leak
between tests (or between runs, in any order).
"""

from collections.abc import AsyncGenerator, Callable

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token
from app.infrastructure.database import get_session
from app.infrastructure.database.models import Base, UserModel
from app.main import create_app
from app.tests.factories import make_user

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Fresh in-memory database and session for each test."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=StaticPool,  # one shared connection: the in-memory DB survives it
        connect_args={"check_same_thread": False},
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, expire_on_commit=False, autoflush=False
    )
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def app(db_session: AsyncSession) -> FastAPI:
    """Application whose ``get_session`` dependency uses the test session."""
    app = create_app()

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client bound to the test application."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as http_client:
        yield http_client


class FakeStorage:
    """In-memory stand-in for the Supabase storage client (documents)."""

    def __init__(self) -> None:
        self.files: dict[tuple[str, str], bytes] = {}

    def upload_bytes(
        self,
        bucket: str,
        path: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        self.files[(bucket, path)] = content

    def download_bytes(self, bucket: str, path: str) -> bytes:
        return self.files[(bucket, path)]

    def delete_from_bucket(self, bucket: str, path: str) -> None:
        self.files.pop((bucket, path), None)


@pytest.fixture(autouse=True)
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorage:
    """Documents never reach Supabase in tests.

    Every engagement now archives the reservation deed, so without this a
    developer ``.env`` would upload test PDFs to the real bucket.
    """
    storage = FakeStorage()
    monkeypatch.setattr(
        "app.services.document_service.get_storage_client", lambda: storage
    )
    return storage


@pytest.fixture
async def manager(db_session: AsyncSession) -> UserModel:
    return await make_user(db_session, role="manager", email="manager@example.com")


@pytest.fixture
async def commercial(db_session: AsyncSession) -> UserModel:
    return await make_user(
        db_session, role="commercial", email="commercial@example.com"
    )


@pytest.fixture
async def other_commercial(db_session: AsyncSession) -> UserModel:
    return await make_user(
        db_session, role="commercial", email="other.commercial@example.com"
    )


@pytest.fixture
def auth_headers() -> Callable[[UserModel], dict[str, str]]:
    """Return a function building the ``Authorization`` header for a user."""

    def _auth_headers(user: UserModel) -> dict[str, str]:
        token = create_access_token(subject=user.id)
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers
