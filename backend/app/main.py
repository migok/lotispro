"""FastAPI application factory and entry point.

This module provides the create_app factory function for creating
the FastAPI application instance with all configurations applied.
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app import __version__
from app.api.error_handlers import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.core.middlewares import setup_middlewares
from app.infrastructure.database import close_db, init_db

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager.

    Handles startup and shutdown events:
    - Startup: Initialize logging, database
    - Shutdown: Close database connections

    Args:
        app: FastAPI application instance
    """
    # Startup
    logger.info(
        "Starting application",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )

    # Initialize database
    await init_db()

    # Ensure data directory exists
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Application started successfully")

    yield

    # Shutdown
    logger.info("Shutting down application")
    await close_db()
    logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    This factory function creates a new FastAPI instance with:
    - Configured settings and metadata
    - Middleware stack (CORS, security headers, logging, rate limiting)
    - Exception handlers
    - API routers
    - OpenAPI documentation

    Returns:
        Configured FastAPI application instance

    Example:
        ```python
        app = create_app()
        uvicorn.run(app, host="0.0.0.0", port=8000)
        ```
    """
    # Setup logging before creating app
    setup_logging()

    # Create FastAPI app
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="""
## Lots API - Real Estate Management System

A comprehensive API for managing real estate lots, reservations, and sales.

### Features
- **Authentication**: JWT-based authentication with role-based access control
- **Projects**: Manage real estate projects with lot tracking
- **Lots**: Full CRUD operations with status management
- **Reservations**: Reservation lifecycle management with expiration handling
- **Sales**: Direct sales and reservation conversions
- **Dashboard**: Analytics and KPIs for business insights

### Authentication
Most endpoints require a valid JWT token. Obtain one via `/api/auth/login`.

Include the token in requests:
```
Authorization: Bearer <your_token>
```

### Roles
- **Manager**: Full access to all resources
- **Commercial**: Access to assigned projects and client management
- **Client**: Limited access to public projects only
        """,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        openapi_url="/openapi.json" if settings.is_development else None,
        lifespan=lifespan,
    )

    # Setup middlewares
    setup_middlewares(app)

    # Register exception handlers
    register_exception_handlers(app)

    # Include API routers
    app.include_router(
        api_router,
        prefix=settings.API_V1_PREFIX,
    )

    # Custom OpenAPI schema
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=settings.APP_NAME,
            version=settings.APP_VERSION,
            description=app.description,
            routes=app.routes,
        )

        # Add security scheme
        openapi_schema["components"]["securitySchemes"] = {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Enter the JWT token obtained from /api/auth/login",
            }
        }

        # Apply security globally
        openapi_schema["security"] = [{"BearerAuth": []}]

        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi

    logger.info(
        "Application created",
        cors_origins=settings.CORS_ORIGINS,
        debug=settings.DEBUG,
    )

    return app


# Create application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_level=settings.LOG_LEVEL.lower(),
    )
