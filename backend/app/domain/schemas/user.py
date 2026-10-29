"""User-related schemas for API requests and responses."""

from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator

from app.domain.client_profile import normalize_phone
from app.domain.schemas.common import BaseSchema


class _PhoneMixin(BaseSchema):
    """Normalise ``phone`` to E.164: international format only (``+`` or ``00``,
    country code, 8 to 15 digits; spaces, dots and dashes ignored). A local
    number such as ``06…`` is refused.
    """

    @field_validator("phone", check_fields=False)
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class UserInvite(_PhoneMixin):
    """Schema for inviting a new user (manager or commercial) via email."""

    email: EmailStr = Field(description="User email address")
    first_name: str = Field(min_length=1, max_length=100, description="First name")
    last_name: str = Field(min_length=1, max_length=100, description="Last name")
    address: str | None = Field(default=None, max_length=255, description="Address")
    company: str | None = Field(default=None, max_length=150, description="Company")
    phone: str | None = Field(default=None, description="Téléphone (optionnel)")
    role: Literal["manager", "commercial"] = Field(description="User role")


class UserUpdate(_PhoneMixin):
    """Fields a manager can edit on an existing user."""

    phone: str | None = Field(
        default=None, description="Téléphone ; null ou vide pour l'effacer"
    )


class SetPasswordRequest(BaseSchema):
    """Schema for setting password via invitation token."""

    token: str = Field(description="Invitation token from email")
    password: str = Field(min_length=6, max_length=128, description="New password")


class UserCreate(BaseSchema):
    """Schema for user registration (legacy / seed scripts)."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(
        min_length=6,
        max_length=128,
        description="User password (min 6 characters)",
    )
    name: str = Field(min_length=1, max_length=100, description="User display name")
    first_name: str | None = Field(
        default=None, max_length=100, description="First name"
    )
    last_name: str | None = Field(default=None, max_length=100, description="Last name")
    address: str | None = Field(default=None, max_length=255, description="Address")
    company: str | None = Field(default=None, max_length=150, description="Company")
    role: Literal["manager", "commercial", "client"] = Field(
        default="client",
        description="User role in the system",
    )


class ForgotPasswordRequest(BaseSchema):
    """Schema for requesting a password reset email."""

    email: EmailStr = Field(description="User email address")


class UserLogin(BaseSchema):
    """Schema for user login."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(description="User password")


class UserResponse(BaseSchema):
    """Schema for user data in responses."""

    id: int
    email: str
    name: str
    first_name: str | None = None
    last_name: str | None = None
    address: str | None = None
    company: str | None = None
    phone: str | None = None
    role: str
    is_pending: bool = False
    invitation_token: str | None = None
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseSchema):
    """Schema for authentication token response."""

    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(description="Token expiration time in seconds")
    user: UserResponse = Field(description="Authenticated user details")
