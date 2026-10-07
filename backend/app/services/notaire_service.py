"""Notaire service — CRUD for notaire entities."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.notaire import NotaireCreate, NotaireResponse, NotaireUpdate
from app.infrastructure.database.models import NotaireModel
from app.infrastructure.database.repositories.notaire_repository import NotaireRepository

logger = get_logger(__name__)


def _to_response(n: NotaireModel) -> NotaireResponse:
    return NotaireResponse(
        id=n.id,
        nom=n.nom,
        prenom=n.prenom,
        telephone=n.telephone,
        email=n.email,
        ville=n.ville,
        adresse=n.adresse,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


class NotaireService:
    """Service for notaire management."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = NotaireRepository(session)

    async def get_notaires(self, search: str | None = None) -> list[NotaireResponse]:
        """List notaires with optional search."""
        notaires = await self.repo.get_filtered(search=search)
        return [_to_response(n) for n in notaires]

    async def get_notaire(self, notaire_id: int) -> NotaireResponse:
        """Get notaire by ID.

        Raises:
            NotFoundError: If not found
        """
        n = await self.repo.get_by_id(notaire_id)
        if not n:
            raise NotFoundError("Notaire", notaire_id)
        return _to_response(n)

    async def create_notaire(self, data: NotaireCreate) -> NotaireResponse:
        """Create a new notaire."""
        n = await self.repo.create(
            nom=data.nom,
            prenom=data.prenom,
            telephone=data.telephone,
            email=data.email,
            ville=data.ville,
            adresse=data.adresse,
        )
        logger.info("Notaire created", notaire_id=n.id, nom=n.nom, prenom=n.prenom)
        return _to_response(n)

    async def update_notaire(self, notaire_id: int, data: NotaireUpdate) -> NotaireResponse:
        """Update a notaire.

        Raises:
            NotFoundError: If not found
        """
        existing = await self.repo.get_by_id(notaire_id)
        if not existing:
            raise NotFoundError("Notaire", notaire_id)

        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if updates:
            n = await self.repo.update(notaire_id, **updates)
        else:
            n = existing
        return _to_response(n)
