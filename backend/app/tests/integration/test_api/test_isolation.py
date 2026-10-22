"""Guards the per-test database isolation provided by conftest.py."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import UserModel
from app.tests.factories import make_user


@pytest.mark.integration
@pytest.mark.parametrize("run", [1, 2])
async def test_isolation_users_table_empty_at_start(
    db_session: AsyncSession,
    run: int,  # noqa: ARG001
) -> None:
    """Each test starts on a fresh database and may reuse the same email."""
    count = (
        await db_session.execute(select(func.count()).select_from(UserModel))
    ).scalar_one()
    assert count == 0

    await make_user(db_session, email="same@example.com")
