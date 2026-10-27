"""Sale service - Sale management operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain.schemas.sale import SaleCreate, SaleResponse
from app.infrastructure.database.repositories import SaleRepository


class SaleService:
    """Service for sale management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.sale_repo = SaleRepository(session)

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
        user_role: str | None = None,
    ) -> SaleResponse:
        """Refuse direct sales: a sale is created by the ``solde`` transition.

        This legacy path wrote the obsolete ``sold`` lot status, rejected by
        the ``valid_lot_status`` constraint (500, issue #50).

        Raises:
            BusinessRuleError: Always
        """
        raise BusinessRuleError(
            message="Les ventes se font via le workflow de statuts (Marquer soldé).",
            rule="use_transition_endpoint",
        )
