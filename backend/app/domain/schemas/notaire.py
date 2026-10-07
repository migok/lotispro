"""Notaire schemas."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class NotaireCreate(BaseSchema):
    """Schema for creating a notaire."""

    nom: str = Field(min_length=1, max_length=100, description="Nom de famille")
    prenom: str = Field(min_length=1, max_length=100, description="Prénom")
    telephone: str = Field(min_length=1, max_length=30, description="Téléphone")
    email: str | None = Field(default=None, max_length=255, description="Email")
    ville: str | None = Field(default=None, max_length=100, description="Ville")
    adresse: str | None = Field(default=None, max_length=500, description="Adresse")


class NotaireUpdate(BaseSchema):
    """Schema for updating a notaire — all fields optional."""

    nom: str | None = Field(default=None, min_length=1, max_length=100)
    prenom: str | None = Field(default=None, min_length=1, max_length=100)
    telephone: str | None = Field(default=None, min_length=1, max_length=30)
    email: str | None = Field(default=None, max_length=255)
    ville: str | None = Field(default=None, max_length=100)
    adresse: str | None = Field(default=None, max_length=500)


class NotaireResponse(BaseSchema):
    """Schema for notaire response."""

    id: int
    nom: str
    prenom: str
    telephone: str
    email: str | None
    ville: str | None
    adresse: str | None
    created_at: datetime
    updated_at: datetime

    @property
    def display_name(self) -> str:
        """Full display name."""
        return f"{self.prenom} {self.nom}"
