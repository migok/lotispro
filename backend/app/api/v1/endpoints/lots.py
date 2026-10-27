"""Lot management endpoints with CRUD + pagination example."""

from fastapi import APIRouter, Query, status

from app.api.dependencies import (
    CurrentUser,
    EtatDesLieuxServiceDep,
    LotPricingServiceDep,
    LotServiceDep,
)
from app.domain.schemas.common import (
    MessageResponse,
    PaginatedResponse,
    PaginationParams,
)
from app.domain.schemas.etat_des_lieux import (
    EdlActionCreate,
    EdlActionResponse,
    EdlActionUpdate,
    EtatDesLieuxResponse,
)
from app.domain.schemas.lot import (
    LOT_STATUS,
    LotCreate,
    LotFilter,
    LotResponse,
    LotUpdate,
)
from app.domain.schemas.lot_status_history import LotStatusHistoryResponse

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
    status: LOT_STATUS | None = Query(default=None, description="Filter by status"),
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
    "/{lot_id}/pricing-config",
    summary="Get pricing config for a lot",
    description="Returns prix_m2_acte, prix_m2_catalogue and computed prices from the project pricing grid for this lot's combination.",
)
async def get_lot_pricing_config(
    lot_id: int,
    current_user: CurrentUser,
    pricing_service: LotPricingServiceDep,
) -> dict:
    """Return the matching pricing config for this lot, or empty dict if none."""
    result = await pricing_service.get_config_for_lot(lot_id)
    return result or {}


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


@router.get(
    "/{lot_id}/status-history",
    response_model=list[LotStatusHistoryResponse],
    summary="Historique des statuts du lot",
    description="Changements de statut du lot, du plus récent au plus ancien.",
)
async def get_lot_status_history(
    lot_id: int,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> list[LotStatusHistoryResponse]:
    """List the status changes of a lot, newest first."""
    return await lot_service.get_status_history(lot_id)


@router.get(
    "/{lot_id}/edl",
    response_model=EtatDesLieuxResponse,
    summary="État des lieux du lot",
    description="État des lieux de la réservation courante avec ses actions (404 si aucun).",
)
async def get_lot_edl(
    lot_id: int,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> EtatDesLieuxResponse:
    """Get the état des lieux of the lot's current reservation."""
    return await edl_service.get_for_lot(lot_id)


@router.post(
    "/{lot_id}/edl/actions",
    response_model=EdlActionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter une action d'état des lieux",
    description="Uniquement au statut « État des lieux réalisé ».",
)
async def add_edl_action(
    lot_id: int,
    data: EdlActionCreate,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> EdlActionResponse:
    """Add an open action to the état des lieux."""
    return await edl_service.add_action(lot_id, data)


@router.put(
    "/{lot_id}/edl/actions/{action_id}",
    response_model=EdlActionResponse,
    summary="Modifier une action d'état des lieux",
    description=(
        "Uniquement au statut « État des lieux réalisé ». status=faite renseigne "
        "la date de réalisation, status=ouverte la vide."
    ),
)
async def update_edl_action(
    lot_id: int,
    action_id: int,
    data: EdlActionUpdate,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> EdlActionResponse:
    """Edit an action of the état des lieux."""
    return await edl_service.update_action(lot_id, action_id, data)


@router.delete(
    "/{lot_id}/edl/actions/{action_id}",
    response_model=MessageResponse,
    summary="Supprimer une action d'état des lieux",
    description="Uniquement au statut « État des lieux réalisé ».",
)
async def delete_edl_action(
    lot_id: int,
    action_id: int,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> MessageResponse:
    """Remove an action of the état des lieux."""
    await edl_service.delete_action(lot_id, action_id)
    return MessageResponse(message="Action supprimée")


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
    return await lot_service.create_lot(data, user_id=current_user.id)


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
    return await lot_service.update_lot(lot_id, data, user_id=current_user.id)


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
