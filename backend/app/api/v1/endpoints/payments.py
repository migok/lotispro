"""Payment schedule and installment endpoints."""

from fastapi import APIRouter, status

from app.api.dependencies import CommercialOrManager, CurrentUser, PaymentServiceDep
from app.domain.schemas.payment import (
    PaymentInstallmentResponse,
    PaymentInstallmentUpdate,
    PaymentScheduleCreate,
    PaymentScheduleResponse,
)

router = APIRouter()


@router.post(
    "/schedules",
    response_model=PaymentScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create payment schedule",
    description="Create a payment schedule with deposit/balance split and installments for a reservation",
)
async def create_payment_schedule(
    data: PaymentScheduleCreate,
    current_user: CommercialOrManager,
    payment_service: PaymentServiceDep,
) -> PaymentScheduleResponse:
    """Create a payment schedule for a reservation."""
    return await payment_service.create_schedule(data)


@router.get(
    "/schedules/reservation/{reservation_id}",
    response_model=PaymentScheduleResponse,
    summary="Get schedule for reservation",
    description="Get the payment schedule (with installments) for a reservation",
)
async def get_schedule_for_reservation(
    reservation_id: int,
    current_user: CurrentUser,
    payment_service: PaymentServiceDep,
) -> PaymentScheduleResponse:
    """Get payment schedule by reservation ID."""
    return await payment_service.get_schedule_for_reservation(reservation_id)


@router.get(
    "/schedules/client/{client_id}",
    response_model=list[PaymentScheduleResponse],
    summary="Get all schedules for a client",
    description="Get all payment schedules (across all reservations) for a client",
)
async def get_client_payment_overview(
    client_id: int,
    current_user: CurrentUser,
    payment_service: PaymentServiceDep,
) -> list[PaymentScheduleResponse]:
    """Get all payment schedules for a client."""
    return await payment_service.get_client_payment_overview(client_id)


@router.patch(
    "/installments/{installment_id}",
    response_model=PaymentInstallmentResponse,
    summary="Update installment status",
    description="Mark an installment as paid or pending",
)
async def update_installment(
    installment_id: int,
    data: PaymentInstallmentUpdate,
    current_user: CommercialOrManager,
    payment_service: PaymentServiceDep,
) -> PaymentInstallmentResponse:
    """Update an installment's status (paid / pending)."""
    return await payment_service.update_installment(installment_id, data)
