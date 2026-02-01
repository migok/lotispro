"""Sale management endpoints."""

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, SaleServiceDep
from app.domain.schemas.sale import SaleCreate, SaleResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[SaleResponse],
    summary="List sales",
    description="Get sales with optional filters",
)
async def list_sales(
    current_user: CurrentUser,
    sale_service: SaleServiceDep,
    lot_id: int | None = Query(default=None, description="Filter by lot"),
    client_id: int | None = Query(default=None, description="Filter by client"),
) -> list[SaleResponse]:
    """List all sales with filters."""
    return await sale_service.get_sales(
        lot_id=lot_id,
        client_id=client_id,
    )


@router.post(
    "",
    response_model=SaleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create sale",
    description="Create a direct sale (without prior reservation)",
)
async def create_sale(
    data: SaleCreate,
    current_user: CurrentUser,
    sale_service: SaleServiceDep,
) -> SaleResponse:
    """Create a direct sale."""
    return await sale_service.create_sale(
        data,
        user_id=current_user.id,
    )
