"""Integration tests for authentication endpoints."""

import pytest
from httpx import AsyncClient

from app.tests.conftest import make_user_data


class TestAuthRegister:
    """Tests for POST /api/auth/register."""

    @pytest.mark.integration
    async def test_register_success(self, client: AsyncClient) -> None:
        """Test successful user registration."""
        user_data = make_user_data(email="register@test.com")

        response = await client.post("/api/auth/register", json=user_data)

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["name"] == user_data["name"]
        assert data["role"] == user_data["role"]
        assert "id" in data
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.integration
    async def test_register_duplicate_email(self, client: AsyncClient) -> None:
        """Test registration fails with duplicate email."""
        user_data = make_user_data(email="duplicate@test.com")

        # First registration
        await client.post("/api/auth/register", json=user_data)

        # Second registration with same email
        response = await client.post("/api/auth/register", json=user_data)

        assert response.status_code == 409
        assert "already exists" in response.json()["message"].lower()

    @pytest.mark.integration
    async def test_register_invalid_email(self, client: AsyncClient) -> None:
        """Test registration fails with invalid email."""
        user_data = make_user_data(email="not-an-email")

        response = await client.post("/api/auth/register", json=user_data)

        assert response.status_code == 422

    @pytest.mark.integration
    async def test_register_short_password(self, client: AsyncClient) -> None:
        """Test registration fails with short password."""
        user_data = make_user_data(password="12345")

        response = await client.post("/api/auth/register", json=user_data)

        assert response.status_code == 422


class TestAuthLogin:
    """Tests for POST /api/auth/login."""

    @pytest.mark.integration
    async def test_login_success(self, client: AsyncClient) -> None:
        """Test successful login."""
        # First register user
        user_data = make_user_data(email="login@test.com")
        await client.post("/api/auth/register", json=user_data)

        # Then login
        response = await client.post(
            "/api/auth/login",
            json={
                "email": user_data["email"],
                "password": user_data["password"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert data["user"]["email"] == user_data["email"]

    @pytest.mark.integration
    async def test_login_wrong_password(self, client: AsyncClient) -> None:
        """Test login fails with wrong password."""
        # First register user
        user_data = make_user_data(email="wrongpass@test.com")
        await client.post("/api/auth/register", json=user_data)

        # Then try login with wrong password
        response = await client.post(
            "/api/auth/login",
            json={
                "email": user_data["email"],
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
        test_user,
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
