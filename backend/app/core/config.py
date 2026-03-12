"""Application configuration using Pydantic Settings.

Environment variables are loaded from .env file and can be overridden.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Lots API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"

    # API
    API_V1_PREFIX: str = "/api"

    # Security
    SECRET_KEY: str = Field(
        ...,
        min_length=32,
        description="Secret key for JWT encoding. Must be at least 32 characters.",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/lots_db",
        description="Database connection string (PostgreSQL or SQLite)",
    )
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    CORS_ALLOW_HEADERS: list[str] = ["Authorization", "Content-Type", "X-Request-ID"]

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # File Storage
    DATA_DIR: Path = Path(__file__).resolve().parent.parent.parent / "data"
    MAX_UPLOAD_SIZE_MB: int = 10

    # Supabase Configuration
    SUPABASE_URL: str | None = None
    SUPABASE_PUBLIC_URL: str | None = None  # External URL for public file links (browser-accessible)
    SUPABASE_PUBLISHABLE_KEY: str | None = None
    SUPABASE_SECRET_KEY: str | None = None
    SUPABASE_STORAGE_URL: str | None = None
    SUPABASE_STORAGE_BUCKET: str = "geojson-files"
    SUPABASE_IMAGES_BUCKET: str = "project-images"

    @property
    def supabase_public_base_url(self) -> str | None:
        """URL accessible by the browser for public storage links.

        Defaults to SUPABASE_URL. Override with SUPABASE_PUBLIC_URL when
        the backend connects via an internal Docker hostname but the browser
        needs to access files via the host-mapped port (e.g. 127.0.0.1:54321).
        """
        return (self.SUPABASE_PUBLIC_URL or self.SUPABASE_URL or "").rstrip("/")

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # Email (Resend)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "LotisPro <noreply@resend.dev>"
    INVITATION_EXPIRE_HOURS: int = 48

    # Logging
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    LOG_FORMAT: Literal["json", "console"] = "json"

    # Health Check
    HEALTH_CHECK_PATH: str = "/health"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("DATA_DIR", mode="before")
    @classmethod
    def ensure_data_dir(cls, v: str | Path) -> Path:
        """Ensure data directory exists."""
        path = Path(v)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
