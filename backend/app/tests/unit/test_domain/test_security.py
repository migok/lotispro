"""Unit tests for security utilities."""

from datetime import timedelta

import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    """Tests for password hashing functions."""

    @pytest.mark.unit
    def test_hash_password(self) -> None:
        """Test password hashing creates hash."""
        password = "mysecurepassword"
        hashed = hash_password(password)

        assert hashed != password
        assert len(hashed) > 20
        assert hashed.startswith("$2b$")  # bcrypt prefix

    @pytest.mark.unit
    def test_verify_password_correct(self) -> None:
        """Test password verification with correct password."""
        password = "mysecurepassword"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    @pytest.mark.unit
    def test_verify_password_incorrect(self) -> None:
        """Test password verification with incorrect password."""
        password = "mysecurepassword"
        hashed = hash_password(password)

        assert verify_password("wrongpassword", hashed) is False

    @pytest.mark.unit
    def test_verify_password_invalid_hash(self) -> None:
        """Test password verification with invalid hash."""
        assert verify_password("anypassword", "invalid-hash") is False


class TestJWTToken:
    """Tests for JWT token functions."""

    @pytest.mark.unit
    def test_create_access_token(self) -> None:
        """Test access token creation."""
        user_id = 123
        token = create_access_token(subject=user_id)

        assert isinstance(token, str)
        assert len(token) > 50

    @pytest.mark.unit
    def test_decode_access_token(self) -> None:
        """Test access token decoding."""
        user_id = 456
        token = create_access_token(subject=user_id)

        decoded = decode_access_token(token)

        assert decoded.user_id == user_id
        assert decoded.expires_at is not None

    @pytest.mark.unit
    def test_decode_access_token_with_string_subject(self) -> None:
        """Test token decoding when subject is string."""
        user_id = "789"
        token = create_access_token(subject=user_id)

        decoded = decode_access_token(token)

        assert decoded.user_id == 789

    @pytest.mark.unit
    def test_decode_access_token_custom_expiration(self) -> None:
        """Test token with custom expiration."""
        user_id = 101
        token = create_access_token(
            subject=user_id,
            expires_delta=timedelta(hours=1),
        )

        decoded = decode_access_token(token)

        assert decoded.user_id == user_id

    @pytest.mark.unit
    def test_decode_invalid_token(self) -> None:
        """Test decoding invalid token raises exception."""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token("invalid-token")

        assert exc_info.value.status_code == 401
