"""Reservation service - Reservation management operations."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.reservation import (
    ReservationCreate,
    ReservationFilter,
    ReservationResponse,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse
from app.infrastructure.database.repositories import (
    ClientRepository,
    LotRepository,
    PaymentRepository,
    ProjectRepository,
    ReservationRepository,
    SaleRepository,
)

logger = get_logger(__name__)


class ReservationService:
    """Service for reservation management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.lot_repo = LotRepository(session)
        self.client_repo = ClientRepository(session)
        self.project_repo = ProjectRepository(session)
        self.sale_repo = SaleRepository(session)
        self.payment_repo = PaymentRepository(session)

    async def get_reservations(
        self,
        filters: ReservationFilter | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ReservationResponse]:
        """Get reservations with filtering.

        Args:
            filters: Optional filter parameters
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of reservation responses
        """
        reservations = await self.reservation_repo.get_filtered(filters, offset, limit)

        return [
            ReservationResponse(
                id=r.id,
                project_id=r.project_id,
                lot_id=r.lot_id,
                client_id=r.client_id,
                reserved_by_user_id=r.reserved_by_user_id,
                reservation_date=r.reservation_date,
                expiration_date=r.expiration_date,
                deposit=r.deposit,
                notes=r.notes,
                status=r.status,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in reservations
        ]

    async def get_reservation(self, reservation_id: int) -> ReservationResponse:
        """Get reservation by ID.

        Args:
            reservation_id: Reservation ID

        Returns:
            Reservation response

        Raises:
            NotFoundError: If reservation not found
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)

        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        return ReservationResponse(
            id=reservation.id,
            project_id=reservation.project_id,
            lot_id=reservation.lot_id,
            client_id=reservation.client_id,
            reserved_by_user_id=reservation.reserved_by_user_id,
            reservation_date=reservation.reservation_date,
            expiration_date=reservation.expiration_date,
            deposit=reservation.deposit,
            notes=reservation.notes,
            status=reservation.status,
            created_at=reservation.created_at,
            updated_at=reservation.updated_at,
        )

    async def create_reservation(
        self,
        data: ReservationCreate,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Create a new reservation.

        Args:
            data: Reservation creation data
            user_id: User creating the reservation

        Returns:
            Created reservation response

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot is not available
        """
        # Check lot exists and is available
        lot = await self.lot_repo.get_by_id(data.lot_id)
        if not lot:
            raise NotFoundError("Lot", data.lot_id)

        if lot.status != "available":
            raise BusinessRuleError(
                message=f"Lot is not available (current status: {lot.status})",
                rule="lot_not_available",
            )

        # Check client exists
        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        # Validate deposit amount
        if lot.price is not None and data.deposit >= lot.price:
            raise BusinessRuleError(
                message=f"Deposit ({data.deposit}) must be less than lot price ({lot.price})",
                rule="deposit_exceeds_price",
            )

        # Set expiration date (use reservation_days or explicit expiration_date)
        expiration_date = data.expiration_date or (
            datetime.now(timezone.utc) + timedelta(days=data.reservation_days)
        )

        # Create reservation
        reservation = await self.reservation_repo.create(
            project_id=lot.project_id,
            lot_id=data.lot_id,
            client_id=data.client_id,
            reserved_by_user_id=user_id,
            expiration_date=expiration_date,
            deposit=data.deposit,
            notes=data.notes,
        )

        # Update lot status
        await self.lot_repo.update(
            data.lot_id,
            status="reserved",
            current_reservation_id=reservation.id,
        )

        logger.info(
            "Reservation created",
            reservation_id=reservation.id,
            lot_id=data.lot_id,
            client_id=data.client_id,
            reserved_by=user_id,
        )

        return ReservationResponse(
            id=reservation.id,
            project_id=reservation.project_id,
            lot_id=reservation.lot_id,
            client_id=reservation.client_id,
            reserved_by_user_id=reservation.reserved_by_user_id,
            reservation_date=reservation.reservation_date,
            expiration_date=reservation.expiration_date,
            deposit=reservation.deposit,
            notes=reservation.notes,
            status=reservation.status,
            created_at=reservation.created_at,
            updated_at=reservation.updated_at,
        )

    async def release_reservation(
        self,
        reservation_id: int,
        user_id: int,
        user_role: str,
    ) -> ReservationResponse:
        """Release (cancel) an active reservation.

        Args:
            reservation_id: Reservation ID
            user_id: User requesting the release
            user_role: Role of the user (manager or commercial)

        Returns:
            Updated reservation response

        Raises:
            NotFoundError: If reservation not found
            BusinessRuleError: If reservation is not active or user doesn't have permission
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        if reservation.status != "active":
            raise BusinessRuleError(
                message=f"Cannot release reservation with status '{reservation.status}'",
                rule="reservation_not_active",
            )

        # Check permissions: only manager or the commercial who reserved can release
        if user_role != "manager" and reservation.reserved_by_user_id != user_id:
            raise BusinessRuleError(
                message="You don't have permission to release this reservation",
                rule="insufficient_permissions",
            )

        # Update reservation status
        updated = await self.reservation_repo.update(
            reservation_id,
            status="released",
        )

        # Update lot status and clear current_reservation_id
        await self.lot_repo.release_lot(reservation.lot_id, status="available")

        # Delete associated payment schedule if any
        await self.payment_repo.delete_by_reservation(reservation_id)

        logger.info(
            "Reservation released",
            reservation_id=reservation_id,
            lot_id=reservation.lot_id,
        )

        return ReservationResponse(
            id=updated.id,
            project_id=updated.project_id,
            lot_id=updated.lot_id,
            client_id=updated.client_id,
            reserved_by_user_id=updated.reserved_by_user_id,
            reservation_date=updated.reservation_date,
            expiration_date=updated.expiration_date,
            deposit=updated.deposit,
            notes=updated.notes,
            status=updated.status,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def extend_reservation(
        self,
        reservation_id: int,
        additional_days: int,
    ) -> ReservationResponse:
        """Extend an active reservation by adding days.

        Args:
            reservation_id: Reservation ID
            additional_days: Number of days to add

        Returns:
            Updated reservation response

        Raises:
            NotFoundError: If reservation not found
            BusinessRuleError: If reservation is not active
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        if reservation.status != "active":
            raise BusinessRuleError(
                message=f"Cannot extend reservation with status '{reservation.status}'",
                rule="reservation_not_active",
            )

        # Calculate new expiration date from current expiration
        current_expiration = reservation.expiration_date
        if current_expiration.tzinfo is None:
            current_expiration = current_expiration.replace(tzinfo=timezone.utc)

        new_expiration = current_expiration + timedelta(days=additional_days)

        # Update reservation
        updated = await self.reservation_repo.update(
            reservation_id,
            expiration_date=new_expiration,
        )

        logger.info(
            "Reservation extended",
            reservation_id=reservation_id,
            additional_days=additional_days,
            new_expiration=str(new_expiration),
        )

        return ReservationResponse(
            id=updated.id,
            project_id=updated.project_id,
            lot_id=updated.lot_id,
            client_id=updated.client_id,
            reserved_by_user_id=updated.reserved_by_user_id,
            reservation_date=updated.reservation_date,
            expiration_date=updated.expiration_date,
            deposit=updated.deposit,
            notes=updated.notes,
            status=updated.status,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def convert_to_sale(
        self,
        reservation_id: int,
        sale_data: SaleFromReservation,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> SaleResponse:
        """Convert reservation to sale.

        Args:
            reservation_id: Reservation ID
            sale_data: Sale data
            user_id: User performing conversion
            user_role: Role of the user (manager or commercial)

        Returns:
            Created sale response

        Raises:
            NotFoundError: If reservation not found
            BusinessRuleError: If reservation cannot be converted or user doesn't have permission
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        if reservation.status != "active":
            raise BusinessRuleError(
                message=f"Cannot convert reservation with status '{reservation.status}'",
                rule="reservation_not_active",
            )

        # Check permissions: only manager or the commercial who reserved can finalize
        if user_role and user_role != "manager" and reservation.reserved_by_user_id != user_id:
            raise BusinessRuleError(
                message="You don't have permission to finalize this reservation",
                rule="insufficient_permissions",
            )

        # Create sale
        sale = await self.sale_repo.create(
            project_id=reservation.project_id,
            lot_id=reservation.lot_id,
            client_id=reservation.client_id,
            price=sale_data.price,
            sold_by_user_id=user_id,
            reservation_id=reservation_id,
            notes=sale_data.notes,
        )

        # Update reservation status
        await self.reservation_repo.update(
            reservation_id,
            status="converted",
        )

        # Update lot status and clear current_reservation_id
        await self.lot_repo.release_lot(reservation.lot_id, status="sold")

        # Update project sold count
        project = await self.project_repo.get_by_id(reservation.project_id)
        if project:
            await self.project_repo.update_lot_counts(
                reservation.project_id,
                sold_lots=project.sold_lots + 1,
            )

        logger.info(
            "Reservation converted to sale",
            reservation_id=reservation_id,
            sale_id=sale.id,
            lot_id=reservation.lot_id,
            price=sale_data.price,
        )

        return SaleResponse(
            id=sale.id,
            project_id=sale.project_id,
            lot_id=sale.lot_id,
            client_id=sale.client_id,
            reservation_id=sale.reservation_id,
            sold_by_user_id=sale.sold_by_user_id,
            sale_date=sale.sale_date,
            price=sale.price,
            notes=sale.notes,
            created_at=sale.created_at,
        )

    async def check_expirations(self) -> int:
        """Process expired reservations.

        Returns:
            Number of reservations marked as expired
        """
        expired = await self.reservation_repo.get_expired_active()
        count = 0

        for reservation in expired:
            await self.reservation_repo.update(
                reservation.id,
                status="expired",
            )

            await self.lot_repo.release_lot(reservation.lot_id, status="available")
            await self.payment_repo.delete_by_reservation(reservation.id)

            count += 1

        if count > 0:
            logger.info("Processed expired reservations", count=count)

        return count
