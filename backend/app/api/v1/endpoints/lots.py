"""Lot management endpoints with CRUD + pagination example."""

from typing import Literal

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, LotServiceDep
from app.domain.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.domain.schemas.lot import LotCreate, LotFilter, LotResponse, LotUpdate

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[LotResponse],
    summary="List lots",
    description="Get lots with optional filtering and pagination",
)
async def list_lots(
    current_user: CurrentUser,
    lot_service: LotServiceDep,
    # Pagination
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    # Filters
    project_id: int | None = Query(default=None, description="Filter by project"),
    numero: str | None = Query(default=None, description="Search by lot number"),
    zone: str | None = Query(default=None, description="Filter by zone"),
    status: Literal["available", "reserved", "sold", "blocked"] | None = Query(
        default=None, description="Filter by status"
    ),
    surface_min: float | None = Query(default=None, ge=0, description="Min surface"),
    surface_max: float | None = Query(default=None, ge=0, description="Max surface"),
) -> PaginatedResponse[LotResponse]:
    """List lots with filtering and pagination.

    Example request: GET /api/lots?page=1&page_size=10&status=available&project_id=1

    Example response:
    ```json
    {
        "items": [...],
        "total": 100,
        "page": 1,
        "page_size": 10,
        "total_pages": 10
    }
    ```
    """
    # Build pagination params
    pagination = PaginationParams(page=page, page_size=page_size)

    # Build filters
    filters = LotFilter(
        project_id=project_id,
        numero=numero,
        zone=zone,
        status=status,
        surface_min=surface_min,
        surface_max=surface_max,
    )

    # Get filtered lots
    lots = await lot_service.get_lots(
        filters=filters,
        offset=pagination.offset,
        limit=pagination.limit,
    )

    # For total count, we'd need a separate count query
    # In production, add count method to service
    total = len(lots)  # Simplified - should query actual count

    return PaginatedResponse.create(
        items=lots,
        total=total,
        pagination=pagination,
    )


@router.get(
    "/{lot_id}",
    response_model=LotResponse,
    summary="Get lot",
    description="Get lot by ID",
)
async def get_lot(
    lot_id: int,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> LotResponse:
    """Get lot by ID."""
    return await lot_service.get_lot(lot_id)


@router.post(
    "",
    response_model=LotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create lot",
    description="Create a new lot (manually, without GeoJSON)",
)
async def create_lot(
    data: LotCreate,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> LotResponse:
    """Create a new lot."""
    return await lot_service.create_lot(data)


@router.put(
    "/{lot_id}",
    response_model=LotResponse,
    summary="Update lot",
    description="Update lot details",
)
async def update_lot(
    lot_id: int,
    data: LotUpdate,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> LotResponse:
    """Update a lot."""
    return await lot_service.update_lot(lot_id, data)


@router.delete(
    "/{lot_id}",
    response_model=MessageResponse,
    summary="Delete lot",
    description="Delete a lot (only if not reserved or sold)",
)
async def delete_lot(
    lot_id: int,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> MessageResponse:
    """Delete a lot."""
    await lot_service.delete_lot(lot_id)
    return MessageResponse(message="Lot deleted successfully")
