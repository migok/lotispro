"""Client management endpoints."""

from fastapi import APIRouter, Query, status

from app.api.dependencies import ClientServiceDep, CurrentUser, OptionalUser
from app.domain.schemas.client import (
    ClientCreate,
    ClientDetails,
    ClientResponse,
    ClientUpdate,
)

router = APIRouter()


@router.get(
    "",
    response_model=list[ClientResponse],
    summary="List clients",
    description="Get clients with optional search filter",
)
async def list_clients(
    current_user: CurrentUser,
    client_service: ClientServiceDep,
    search: str | None = Query(default=None, description="Search by name, phone, or CIN"),
) -> list[ClientResponse]:
    """List all clients with optional search."""
    return await client_service.get_clients(search=search)


@router.get(
    "/{client_id}",
    response_model=ClientResponse,
    summary="Get client",
    description="Get client by ID",
)
async def get_client(
    client_id: int,
    current_user: CurrentUser,
    client_service: ClientServiceDep,
) -> ClientResponse:
    """Get client by ID."""
    return await client_service.get_client(client_id)


@router.get(
    "/{client_id}/details",
    response_model=ClientDetails,
    summary="Get client details",
    description="Get client with full history and stats",
)
async def get_client_details(
    client_id: int,
    current_user: CurrentUser,
    client_service: ClientServiceDep,
) -> ClientDetails:
    """Get detailed client info including sales/reservations history."""
    return await client_service.get_client_details(client_id)


@router.post(
    "",
    response_model=ClientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create client",
    description="Create a new client",
)
async def create_client(
    data: ClientCreate,
    current_user: CurrentUser,
    client_service: ClientServiceDep,
) -> ClientResponse:
    """Create a new client."""
    return await client_service.create_client(data, user_id=current_user.id)


@router.put(
    "/{client_id}",
    response_model=ClientResponse,
    summary="Update client",
    description="Update client details",
)
async def update_client(
    client_id: int,
    data: ClientUpdate,
    current_user: CurrentUser,
    client_service: ClientServiceDep,
) -> ClientResponse:
    """Update a client."""
    return await client_service.update_client(client_id, data)
