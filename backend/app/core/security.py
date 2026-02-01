"""Security utilities: password hashing, JWT tokens, and OAuth2 scheme.

Provides secure authentication primitives for the application.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# OAuth2 scheme for Swagger UI
security_scheme = HTTPBearer(
    scheme_name="JWT Bearer Token",
    description="Enter the JWT token obtained from /api/auth/login",
    auto_error=True,
)


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    sub: str  # Subject (user ID)
    exp: datetime  # Expiration time
    iat: datetime  # Issued at
    type: str = "access"  # Token type


class TokenData(BaseModel):
    """Decoded token data."""

    user_id: int
    expires_at: datetime


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Stored password hash

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        logger.warning("Password verification failed due to invalid hash format")
        return False


def create_access_token(
    subject: str | int,
    expires_delta: timedelta | None = None,
    additional_claims: dict[str, Any] | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        subject: Token subject (typically user ID)
        expires_delta: Custom expiration time
        additional_claims: Extra claims to include in token

    Returns:
        Encoded JWT token string
    """
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "access",
    }

    if additional_claims:
        payload.update(additional_claims)

    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    logger.debug(
        "Access token created",
        subject=str(subject),
        expires_at=expire.isoformat(),
    )

    return token


def decode_access_token(token: str) -> TokenData:
    """Decode and validate a JWT access token.

    Args:
        token: JWT token string

    Returns:
        TokenData with user_id and expiration

    Raises:
        HTTPException: If token is invalid or expired
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            logger.warning("Token missing subject claim")
            raise credentials_exception

        exp = payload.get("exp")
        if exp is None:
            logger.warning("Token missing expiration claim")
            raise credentials_exception

        return TokenData(
            user_id=int(user_id_str),
            expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
        )

    except jwt.ExpiredSignatureError:
        logger.info("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token", error=str(e))
        raise credentials_exception
    except ValueError:
        logger.warning("Invalid user ID in token")
        raise credentials_exception


def validate_credentials(
    credentials: HTTPAuthorizationCredentials,
) -> TokenData:
    """Validate HTTP Bearer credentials.

    Args:
        credentials: HTTP Authorization credentials

    Returns:
        Decoded token data

    Raises:
        HTTPException: If credentials are invalid
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_access_token(credentials.credentials)


class RoleChecker:
    """Dependency for role-based access control.

    Usage:
        @router.get("/admin")
        async def admin_endpoint(
            user = Depends(RoleChecker(["manager"]))
        ):
            ...
    """

    def __init__(self, allowed_roles: list[str]):
        """Initialize with list of allowed roles.

        Args:
            allowed_roles: List of role names that can access the endpoint
        """
        self.allowed_roles = allowed_roles

    def __call__(self, user_role: str) -> bool:
        """Check if user role is in allowed roles.

        Args:
            user_role: Current user's role

        Returns:
            True if authorized

        Raises:
            HTTPException: If user role not in allowed roles
        """
        if user_role not in self.allowed_roles:
            logger.warning(
                "Access denied - insufficient role",
                user_role=user_role,
                required_roles=self.allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(self.allowed_roles)}",
            )
        return True
