"""Sale service - Sale management operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.sale import SaleCreate, SaleResponse
from app.infrastructure.database.repositories import (
    ClientRepository,
    LotRepository,
    ProjectRepository,
    ReservationRepository,
    SaleRepository,
)

logger = get_logger(__name__)


class SaleService:
    """Service for sale management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.sale_repo = SaleRepository(session)
        self.lot_repo = LotRepository(session)
        self.client_repo = ClientRepository(session)
        self.project_repo = ProjectRepository(session)
        self.reservation_repo = ReservationRepository(session)

    async def get_sales(
        self,
        project_id: int | None = None,
        lot_id: int | None = None,
        client_id: int | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[SaleResponse]:
        """Get sales with filtering.

        Args:
            project_id: Filter by project
            lot_id: Filter by lot
            client_id: Filter by client
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of sale responses
        """
        sales = await self.sale_repo.get_filtered(
            project_id=project_id,
            lot_id=lot_id,
            client_id=client_id,
            offset=offset,
            limit=limit,
        )

        return [
            SaleResponse(
                id=s.id,
                project_id=s.project_id,
                lot_id=s.lot_id,
                client_id=s.client_id,
                reservation_id=s.reservation_id,
                sold_by_user_id=s.sold_by_user_id,
                sale_date=s.sale_date,
                price=s.price,
                notes=s.notes,
                created_at=s.created_at,
            )
            for s in sales
        ]

    async def get_sale(self, sale_id: int) -> SaleResponse:
        """Get sale by ID.

        Args:
            sale_id: Sale ID

        Returns:
            Sale response

        Raises:
            NotFoundError: If sale not found
        """
        sale = await self.sale_repo.get_by_id(sale_id)

        if not sale:
            raise NotFoundError("Sale", sale_id)

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

    async def create_sale(
        self,
        data: SaleCreate,
        user_id: int | None = None,
    ) -> SaleResponse:
        """Create a direct sale (without prior reservation).

        Args:
            data: Sale creation data
            user_id: User creating the sale

        Returns:
            Created sale response

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot cannot be sold
        """
        # Check lot exists
        lot = await self.lot_repo.get_by_id(data.lot_id)
        if not lot:
            raise NotFoundError("Lot", data.lot_id)

        if lot.status == "sold":
            raise BusinessRuleError(
                message="Lot has already been sold",
                rule="lot_already_sold",
            )

        if lot.status == "blocked":
            raise BusinessRuleError(
                message="Lot is blocked and cannot be sold",
                rule="lot_blocked",
            )

        # Check client exists
        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        # If lot has active reservation, release it first
        if lot.current_reservation_id:
            active_reservation = await self.reservation_repo.get_active_for_lot(
                data.lot_id
            )
            if active_reservation:
                await self.reservation_repo.update(
                    active_reservation.id,
                    status="released",
                )
                logger.info(
                    "Active reservation released for direct sale",
                    reservation_id=active_reservation.id,
                    lot_id=data.lot_id,
                )

        # Create sale
        sale = await self.sale_repo.create(
            project_id=lot.project_id,
            lot_id=data.lot_id,
            client_id=data.client_id,
            price=data.price,
            sold_by_user_id=user_id,
            notes=data.notes,
        )

        # Update lot status
        await self.lot_repo.update(
            data.lot_id,
            status="sold",
            current_reservation_id=None,
        )

        # Update project sold count
        project = await self.project_repo.get_by_id(lot.project_id)
        if project:
            await self.project_repo.update_lot_counts(
                lot.project_id,
                sold_lots=project.sold_lots + 1,
            )

        logger.info(
            "Sale created",
            sale_id=sale.id,
            lot_id=data.lot_id,
            client_id=data.client_id,
            price=data.price,
            sold_by=user_id,
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
