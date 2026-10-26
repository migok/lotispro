"""État des lieux (EDL) schemas: transitions, actions and responses."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.domain.schemas.common import BaseSchema

EDL_ACTION_STATUS = Literal["ouverte", "faite"]


class EdlScheduleData(BaseSchema):
    """Body of ``edl-schedule`` (POST: programme, PUT: reprogramme)."""

    scheduled_at: datetime = Field(description="Date et heure de l'état des lieux")
    intervenant: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=5000)


class EdlActionCreate(BaseSchema):
    """An action to carry out after the état des lieux."""

    description: str = Field(min_length=1, max_length=500)
    responsable: str | None = Field(default=None, max_length=200)


class EdlActionUpdate(BaseSchema):
    """Partial update of an action; only the fields sent are changed."""

    description: str | None = Field(default=None, min_length=1, max_length=500)
    responsable: str | None = Field(default=None, max_length=200)
    status: EDL_ACTION_STATUS | None = None


class EdlDoneData(BaseSchema):
    """Body of ``edl-done``: the visit happened, with the actions it raised."""

    done_at: datetime
    note: str | None = Field(default=None, max_length=5000)
    actions: list[EdlActionCreate] = Field(default_factory=list)


class EdlActionResponse(BaseSchema):
    """One action of an état des lieux."""

    id: int
    etat_des_lieux_id: int
    description: str
    responsable: str | None
    status: EDL_ACTION_STATUS
    done_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EtatDesLieuxResponse(BaseSchema):
    """État des lieux of a lot with its actions (oldest first)."""

    id: int
    lot_id: int
    reservation_id: int
    scheduled_at: datetime
    intervenant: str
    schedule_note: str | None
    done_at: datetime | None
    done_note: str | None
    finalized_at: datetime | None
    created_at: datetime
    updated_at: datetime
    actions: list[EdlActionResponse] = Field(default_factory=list)
