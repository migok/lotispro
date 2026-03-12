"""Integration tests for authentication endpoints."""

import pytest
from httpx import AsyncClient

from app.infrastructure.database.models import UserModel


class TestAuthLogin:
    """Tests for POST /api/auth/login."""

    @pytest.mark.integration
    async def test_login_success(
        self, client: AsyncClient, test_user: UserModel
    ) -> None:
        """Test successful login."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "testpassword123",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert data["user"]["email"] == test_user.email

    @pytest.mark.integration
    async def test_login_wrong_password(
        self, client: AsyncClient, test_user: UserModel
    ) -> None:
        """Test login fails with wrong password."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    @pytest.mark.integration
    async def test_login_nonexistent_user(self, client: AsyncClient) -> None:
        """Test login fails for non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@test.com",
                "password": "somepassword",
            },
        )

        assert response.status_code == 401


class TestAuthMe:
    """Tests for GET /api/auth/me."""

    @pytest.mark.integration
    async def test_get_current_user(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: UserModel,
    ) -> None:
        """Test getting current user info."""
        response = await client.get("/api/auth/me", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["name"] == test_user.name

    @pytest.mark.integration
    async def test_get_current_user_unauthorized(self, client: AsyncClient) -> None:
        """Test getting current user without token."""
        response = await client.get("/api/auth/me")

        assert response.status_code == 403  # HTTPBearer returns 403 when missing

    @pytest.mark.integration
    async def test_get_current_user_invalid_token(self, client: AsyncClient) -> None:
        """Test getting current user with invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid-token"},
        )

        assert response.status_code == 401
