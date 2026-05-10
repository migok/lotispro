"""Notaire management endpoints."""

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, NotaireServiceDep
from app.domain.schemas.notaire import NotaireCreate, NotaireResponse, NotaireUpdate

router = APIRouter()


@router.get(
    "",
    response_model=list[NotaireResponse],
    summary="Lister les notaires",
    description="Retourne la liste des notaires avec filtre de recherche optionnel",
)
async def list_notaires(
    current_user: CurrentUser,
    notaire_service: NotaireServiceDep,
    search: str | None = Query(default=None, description="Recherche par nom, prénom ou téléphone"),
) -> list[NotaireResponse]:
    """List notaires with optional search."""
    return await notaire_service.get_notaires(search=search)


@router.get(
    "/{notaire_id}",
    response_model=NotaireResponse,
    summary="Obtenir un notaire",
)
async def get_notaire(
    notaire_id: int,
    current_user: CurrentUser,
    notaire_service: NotaireServiceDep,
) -> NotaireResponse:
    """Get notaire by ID."""
    return await notaire_service.get_notaire(notaire_id)


@router.post(
    "",
    response_model=NotaireResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un notaire",
)
async def create_notaire(
    data: NotaireCreate,
    current_user: CurrentUser,
    notaire_service: NotaireServiceDep,
) -> NotaireResponse:
    """Create a new notaire."""
    return await notaire_service.create_notaire(data)


@router.put(
    "/{notaire_id}",
    response_model=NotaireResponse,
    summary="Modifier un notaire",
)
async def update_notaire(
    notaire_id: int,
    data: NotaireUpdate,
    current_user: CurrentUser,
    notaire_service: NotaireServiceDep,
) -> NotaireResponse:
    """Update a notaire."""
    return await notaire_service.update_notaire(notaire_id, data)
