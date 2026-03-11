"""Reservation management endpoints."""

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.dependencies import CertificateServiceDep, CurrentUser, PaymentServiceDep, ReservationServiceDep
from app.domain.schemas.reservation import (
    ReservationCreate,
    ReservationExtend,
    ReservationFilter,
    ReservationRelease,
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
    data: ReservationRelease,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Release (cancel) an active reservation. Only managers or the commercial who created the reservation can release it."""
    return await reservation_service.release_reservation(
        reservation_id=reservation_id,
        user_id=current_user.id,
        user_role=current_user.role,
        data=data,
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


@router.get(
    "/{reservation_id}/certificate",
    summary="Download reservation certificate",
    description="Generate and download a PDF Acte de Réservation",
    response_class=Response,
)
async def download_reservation_certificate(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    certificate_service: CertificateServiceDep,
    payment_service: PaymentServiceDep,
) -> Response:
    """Generate PDF certificate for a reservation."""
    details = await reservation_service.get_reservation_details(reservation_id)
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found",
        )

    # Require the first deposit installment to be paid before generating the certificate.
    # Use schedule.lot_price (= remaining balance after initial payment) so that the
    # certificate balance = schedule.lot_price - first_installment.amount.
    deposit_for_cert = details["deposit"]
    lot_price_for_cert = details.get("lot_price")
    try:
        schedule = await payment_service.get_schedule_for_reservation(reservation_id)
        deposit_installments = sorted(
            [i for i in schedule.installments if i.payment_type == "deposit"],
            key=lambda i: i.installment_number,
        )
        if deposit_installments:
            first = deposit_installments[0]
            if first.status != "paid":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Le premier versement d'acompte doit être effectué "
                        "avant de générer l'acte de réservation."
                    ),
                )
            deposit_for_cert = first.amount
            # The schedule's lot_price is the remaining balance after the initial
            # payment — use it so balance = schedule.lot_price - first_installment
            lot_price_for_cert = schedule.lot_price
    except HTTPException:
        raise
    except Exception:
        pass  # no schedule — fall back to reservation values

    pdf_bytes = certificate_service.generate_reservation_certificate(
        reservation_id=details["id"],
        reservation_date=details["reservation_date"],
        deposit=deposit_for_cert,
        deposit_date=details.get("deposit_date"),
        lot_numero=details["lot_numero"],
        lot_surface=details.get("lot_surface"),
        lot_price=lot_price_for_cert,
        project_name=details["project_name"],
        client_name=details["client_name"],
        client_cin=details.get("client_cin"),
        client_address=details.get("client_address"),
    )

    safe_lot = details["lot_numero"].replace("/", "-").replace(" ", "_")
    filename = f"acte_reservation_{reservation_id}_lot{safe_lot}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
