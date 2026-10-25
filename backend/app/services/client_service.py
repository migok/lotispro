"""Client service - Client management operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.domain.client_profile import (
    compose_client_name,
    validate_client_profile,
)
from app.domain.schemas.client import (
    ClientCreate,
    ClientDetails,
    ClientResponse,
    ClientStats,
    ClientUpdate,
)
from app.infrastructure.database.models import ClientModel
from app.infrastructure.database.repositories import ClientRepository

logger = get_logger(__name__)


class ClientService:
    """Service for client management operations."""

    # Columns that cannot be cleared: an explicit null in an update is ignored.
    _NOT_NULLABLE_FIELDS = frozenset(
        {"last_name", "first_name", "phone", "acquisition_channel", "client_type"}
    )

    # Fields checked by validate_client_profile on the merged state.
    _PROFILE_FIELDS = (
        "last_name",
        "first_name",
        "phone",
        "acquisition_channel",
        "acquisition_referrer",
        "acquisition_date",
        "address_morocco",
        "city_morocco",
        "address_abroad",
        "city_abroad",
        "country_abroad",
        "acte_address",
    )

    @staticmethod
    def _to_response(client: ClientModel) -> ClientResponse:
        """Build the API response from a client model."""
        return ClientResponse.model_validate(client)

    @staticmethod
    def _compose_name(first_name: str | None, last_name: str | None) -> str:
        """Compose the display name, rejecting names that exceed the column."""
        name = compose_client_name(first_name, last_name)
        if len(name) > 200:
            raise ValidationError(
                "Nom complet trop long (200 caractères max)", field="first_name"
            )
        return name

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

        return [self._to_response(c) for c in clients]

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

        return self._to_response(client)

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
            **{k: v for k, v in details.items() if k != "stats"},
            stats=ClientStats(**details["stats"]),
        )

    async def find_duplicates(
        self,
        cin: str | None,
        email: str | None,
        exclude_id: int | None = None,
    ) -> list[ClientResponse]:
        """Find clients sharing the given CIN or email."""
        clients = await self.client_repo.find_duplicates(cin, email, exclude_id)
        return [self._to_response(c) for c in clients]

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
        fields = validate_client_profile(data.model_dump())
        if fields.get("notification_channels") is None and fields.get("email"):
            fields["notification_channels"] = ["email"]
        fields["name"] = self._compose_name(data.first_name, data.last_name)
        client = await self.client_repo.create(**fields, created_by_user_id=user_id)

        logger.info(
            "Client created",
            client_id=client.id,
            name=client.name,
            created_by=user_id,
        )

        return self._to_response(client)

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

        fields = {
            key: value
            for key, value in data.model_dump(exclude_unset=True).items()
            if value is not None or key not in self._NOT_NULLABLE_FIELDS
        }
        # Validate the merged state (stored row + changes), legacy-name aware.
        state = {key: getattr(client, key, None) for key in self._PROFILE_FIELDS}
        state["last_name"] = client.last_name or client.name
        state.update(fields)
        validated = validate_client_profile(state)
        if validated.get("acte_address") != state.get("acte_address"):
            fields["acte_address"] = validated["acte_address"]

        if "first_name" in fields or "last_name" in fields:
            name = self._compose_name(
                fields.get("first_name", client.first_name),
                fields.get("last_name", client.last_name or client.name),
            )
            if name:
                fields["name"] = name

        updated = await self.client_repo.update_fields(client_id, fields)

        logger.info("Client updated", client_id=client_id)

        return self._to_response(updated)
