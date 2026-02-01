"""Client service - Client management operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.client import (
    ClientCreate,
    ClientDetails,
    ClientResponse,
    ClientStats,
    ClientUpdate,
)
from app.infrastructure.database.repositories import ClientRepository

logger = get_logger(__name__)


class ClientService:
    """Service for client management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.client_repo = ClientRepository(session)

    async def get_clients(
        self,
        search: str | None = None,
        client_type: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ClientResponse]:
        """Get clients with filtering.

        Args:
            search: Search term
            client_type: Client type filter
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of client responses
        """
        clients = await self.client_repo.get_filtered(
            search=search,
            client_type=client_type,
            offset=offset,
            limit=limit,
        )

        return [
            ClientResponse(
                id=c.id,
                name=c.name,
                phone=c.phone,
                email=c.email,
                cin=c.cin,
                client_type=c.client_type,
                notes=c.notes,
                created_by_user_id=c.created_by_user_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in clients
        ]

    async def get_client(self, client_id: int) -> ClientResponse:
        """Get client by ID.

        Args:
            client_id: Client ID

        Returns:
            Client response

        Raises:
            NotFoundError: If client not found
        """
        client = await self.client_repo.get_by_id(client_id)

        if not client:
            raise NotFoundError("Client", client_id)

        return ClientResponse(
            id=client.id,
            name=client.name,
            phone=client.phone,
            email=client.email,
            cin=client.cin,
            client_type=client.client_type,
            notes=client.notes,
            created_by_user_id=client.created_by_user_id,
            created_at=client.created_at,
            updated_at=client.updated_at,
        )

    async def get_client_details(self, client_id: int) -> ClientDetails:
        """Get detailed client information.

        Args:
            client_id: Client ID

        Returns:
            Client details with history and stats

        Raises:
            NotFoundError: If client not found
        """
        details = await self.client_repo.get_details(client_id)

        if not details:
            raise NotFoundError("Client", client_id)

        return ClientDetails(
            id=details["id"],
            name=details["name"],
            phone=details["phone"],
            email=details["email"],
            cin=details["cin"],
            client_type=details["client_type"],
            notes=details["notes"],
            created_by_user_id=details["created_by_user_id"],
            created_at=details["created_at"],
            updated_at=details["updated_at"],
            created_by=details["created_by"],
            sales_history=details["sales_history"],
            reservations_history=details["reservations_history"],
            stats=ClientStats(**details["stats"]),
        )

    async def create_client(
        self,
        data: ClientCreate,
        user_id: int | None = None,
    ) -> ClientResponse:
        """Create a new client.

        Args:
            data: Client creation data
            user_id: Creator user ID

        Returns:
            Created client response
        """
        client = await self.client_repo.create(
            name=data.name,
            phone=data.phone,
            email=data.email,
            cin=data.cin,
            client_type=data.client_type,
            notes=data.notes,
            created_by_user_id=user_id,
        )

        logger.info(
            "Client created",
            client_id=client.id,
            name=client.name,
            created_by=user_id,
        )

        return ClientResponse(
            id=client.id,
            name=client.name,
            phone=client.phone,
            email=client.email,
            cin=client.cin,
            client_type=client.client_type,
            notes=client.notes,
            created_by_user_id=client.created_by_user_id,
            created_at=client.created_at,
            updated_at=client.updated_at,
        )

    async def update_client(
        self,
        client_id: int,
        data: ClientUpdate,
    ) -> ClientResponse:
        """Update a client.

        Args:
            client_id: Client ID
            data: Update data

        Returns:
            Updated client response

        Raises:
            NotFoundError: If client not found
        """
        client = await self.client_repo.get_by_id(client_id)
        if not client:
            raise NotFoundError("Client", client_id)

        updated = await self.client_repo.update(
            client_id,
            name=data.name,
            phone=data.phone,
            email=data.email,
            cin=data.cin,
            client_type=data.client_type,
            notes=data.notes,
        )

        logger.info("Client updated", client_id=client_id)

        return ClientResponse(
            id=updated.id,
            name=updated.name,
            phone=updated.phone,
            email=updated.email,
            cin=updated.cin,
            client_type=updated.client_type,
            notes=updated.notes,
            created_by_user_id=updated.created_by_user_id,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
