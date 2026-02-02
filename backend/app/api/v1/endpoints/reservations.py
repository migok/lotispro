"""Reservation management endpoints."""

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, ReservationServiceDep
from app.domain.schemas.reservation import (
    ReservationCreate,
    ReservationExtend,
    ReservationFilter,
    ReservationResponse,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[ReservationResponse],
    summary="List reservations",
    description="Get reservations with optional filters",
)
async def list_reservations(
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    status: str | None = Query(default=None, description="Filter by status"),
    lot_id: int | None = Query(default=None, description="Filter by lot"),
    client_id: int | None = Query(default=None, description="Filter by client"),
) -> list[ReservationResponse]:
    """List all reservations with filters."""
    filters = ReservationFilter(
        status=status,
        lot_id=lot_id,
        client_id=client_id,
    )
    return await reservation_service.get_reservations(filters=filters)


@router.get(
    "/{reservation_id}",
    response_model=ReservationResponse,
    summary="Get reservation",
    description="Get reservation by ID",
)
async def get_reservation(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Get reservation by ID."""
    return await reservation_service.get_reservation(reservation_id)


@router.post(
    "",
    response_model=ReservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create reservation",
    description="Create a new reservation (lot must be available)",
)
async def create_reservation(
    data: ReservationCreate,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Create a new reservation."""
    return await reservation_service.create_reservation(
        data,
        user_id=current_user.id,
    )


@router.post(
    "/{reservation_id}/release",
    response_model=ReservationResponse,
    summary="Release reservation",
    description="Cancel/release an active reservation (manager or reservation owner only)",
)
async def release_reservation(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Release (cancel) an active reservation. Only managers or the commercial who created the reservation can release it."""
    return await reservation_service.release_reservation(
        reservation_id=reservation_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{reservation_id}/extend",
    response_model=ReservationResponse,
    summary="Extend reservation",
    description="Extend an active reservation by adding days",
)
async def extend_reservation(
    reservation_id: int,
    data: ReservationExtend,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Extend an active reservation by adding days."""
    return await reservation_service.extend_reservation(
        reservation_id,
        data.additional_days,
    )


@router.post(
    "/{reservation_id}/convert-to-sale",
    response_model=SaleResponse,
    summary="Convert to sale",
    description="Convert active reservation to a sale (manager or reservation owner only)",
)
async def convert_reservation_to_sale(
    reservation_id: int,
    data: SaleFromReservation,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> SaleResponse:
    """Convert reservation to sale. Only managers or the commercial who created the reservation can finalize it."""
    return await reservation_service.convert_to_sale(
        reservation_id,
        data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/check-expirations",
    summary="Check expirations",
    description="Process expired reservations",
)
async def check_expirations(
    reservation_service: ReservationServiceDep,
) -> dict:
    """Process expired reservations and mark them."""
    count = await reservation_service.check_expirations()
    return {"processed": count, "message": f"Processed {count} expired reservations"}
