"""User-related schemas for API requests and responses."""

from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.domain.schemas.common import BaseSchema


class UserCreate(BaseSchema):
    """Schema for user registration."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(
        min_length=6,
        max_length=128,
        description="User password (min 6 characters)",
    )
    name: str = Field(min_length=1, max_length=100, description="User display name")
    role: Literal["manager", "commercial", "client"] = Field(
        default="client",
        description="User role in the system",
    )


class UserLogin(BaseSchema):
    """Schema for user login."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(description="User password")


class UserResponse(BaseSchema):
    """Schema for user data in responses."""

    id: int
    email: str
    name: str
    role: str
    created_at: datetime
    updated_at: datetime


class UserBrief(BaseSchema):
    """Minimal user info for embedding in other responses."""

    id: int
    name: str
    email: str


class TokenResponse(BaseSchema):
    """Schema for authentication token response."""

    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(description="Token expiration time in seconds")
    user: UserResponse = Field(description="Authenticated user details")
