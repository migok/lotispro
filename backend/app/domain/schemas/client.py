"""Client-related schemas for API requests and responses."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, EmailStr, Field, field_validator

from app.domain.client_profile import (
    ACQUISITION_CHANNELS,
    ACTE_ADDRESS_CHOICES,
    NOTIFICATION_CHANNELS,
    normalize_cin,
    normalize_phone,
)
from app.domain.schemas.common import BaseSchema


def _check_choice(
    value: str | None, choices: tuple[str, ...], label: str
) -> str | None:
    if value is not None and value not in choices:
        raise ValueError(f"{label} invalide (valeurs : {', '.join(choices)})")
    return value


def _check_acquisition_channel(value: str | None) -> str | None:
    return _check_choice(value, ACQUISITION_CHANNELS, "Canal d'acquisition")


def _check_acte_address(value: str | None) -> str | None:
    return _check_choice(value, ACTE_ADDRESS_CHOICES, "Adresse d'acte")


def _check_notification_channels(value: list[str] | None) -> list[str] | None:
    if value is not None:
        for channel in value:
            _check_choice(channel, NOTIFICATION_CHANNELS, "Canal de notification")
    return value


AcquisitionChannel = Annotated[str, AfterValidator(_check_acquisition_channel)]
OptionalAcquisitionChannel = Annotated[
    str | None, AfterValidator(_check_acquisition_channel)
]
OptionalActeAddress = Annotated[str | None, AfterValidator(_check_acte_address)]
OptionalNotificationChannels = Annotated[
    list[str] | None, AfterValidator(_check_notification_channels)
]
ClientType = Literal["proprietaire", "revendeur", "investisseur", "autre"]


class _ClientNormalizationMixin(BaseSchema):
    """Normalise CIN and phone numbers on input."""

    @field_validator("cin", check_fields=False)
    @classmethod
    def _normalize_cin(cls, value: str | None) -> str | None:
        return normalize_cin(value)

    @field_validator("phone", "whatsapp", check_fields=False)
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class ClientCreate(_ClientNormalizationMixin):
    """Schema for creating a new client."""

    last_name: str = Field(min_length=1, max_length=200, description="Last name")
    first_name: str = Field(min_length=1, max_length=100, description="First name")
    maiden_name: str | None = Field(default=None, max_length=100)
    phone: str = Field(min_length=1, max_length=30, description="Phone number")
    whatsapp: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, description="Email address")
    cin: str | None = Field(
        default=None, max_length=30, description="National ID (CIN)"
    )
    address_morocco: str | None = Field(default=None, max_length=500)
    address_abroad: str | None = Field(default=None, max_length=500)
    acte_address: OptionalActeAddress = None
    acquisition_channel: AcquisitionChannel
    acquisition_referrer: str | None = Field(default=None, max_length=200)
    acquisition_date: date | None = None
    notification_channels: OptionalNotificationChannels = None
    client_type: ClientType = Field(default="autre", description="Client type")
    notes: str | None = Field(
        default=None, max_length=2000, description="Additional notes"
    )


class ClientUpdate(_ClientNormalizationMixin):
    """Schema for updating a client (all fields optional)."""

    last_name: str | None = Field(default=None, min_length=1, max_length=200)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    maiden_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    whatsapp: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    cin: str | None = Field(default=None, max_length=30)
    address_morocco: str | None = Field(default=None, max_length=500)
    address_abroad: str | None = Field(default=None, max_length=500)
    acte_address: OptionalActeAddress = None
    acquisition_channel: OptionalAcquisitionChannel = None
    acquisition_referrer: str | None = Field(default=None, max_length=200)
    acquisition_date: date | None = None
    notification_channels: OptionalNotificationChannels = None
    client_type: ClientType | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ClientResponse(BaseSchema):
    """Schema for client data in responses."""

    id: int
    name: str
    last_name: str | None = None
    first_name: str | None = None
    maiden_name: str | None = None
    phone: str | None
    whatsapp: str | None = None
    email: str | None
    cin: str | None
    address_morocco: str | None = None
    address_abroad: str | None = None
    acte_address: str | None = None
    acquisition_channel: str | None = None
    acquisition_referrer: str | None = None
    acquisition_date: date | None = None
    notification_channels: list[str] | None = None
    client_type: str | None
    notes: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class SaleHistory(BaseSchema):
    """Schema for client sale history entry."""

    id: int
    sale_date: datetime
    price: float
    notes: str | None
    lot_numero: str
    lot_surface: float | None
    lot_zone: str | None
    project_id: int
    project_name: str
    sold_by_user_id: int | None
    sold_by_name: str | None


class ReservationHistory(BaseSchema):
    """Schema for client reservation history entry."""

    id: int
    reservation_date: datetime
    expiration_date: datetime
    deposit: float
    deposit_date: date | None = None
    deposit_refund_amount: float | None = None
    deposit_refund_date: date | None = None
    release_reason: str | None = None
    status: str
    notes: str | None
    lot_numero: str
    lot_surface: float | None
    lot_zone: str | None
    lot_price: float | None
    project_id: int
    project_name: str
    reserved_by_user_id: int | None
    reserved_by_name: str | None


class ClientStats(BaseSchema):
    """Schema for client statistics."""

    total_purchases: float
    total_lots: int
    total_deposit: float
    active_reservations: int
    total_reservations: int
    converted_reservations: int


class ClientDetails(ClientResponse):
    """Schema for detailed client information."""

    created_by: dict | None = None
    sales_history: list[SaleHistory] = Field(default_factory=list)
    reservations_history: list[ReservationHistory] = Field(default_factory=list)
    stats: ClientStats | None = None
