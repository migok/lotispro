"""SQLAlchemy ORM models.

These models map to database tables and provide the persistence layer.
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    pass


class UserModel(Base):
    """User ORM model."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="client",
    )
    invitation_token: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    invitation_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    created_projects: Mapped[list["ProjectModel"]] = relationship(
        "ProjectModel",
        back_populates="creator",
        foreign_keys="ProjectModel.created_by",
    )
    assignments: Mapped[list["AssignmentModel"]] = relationship(
        "AssignmentModel",
        back_populates="user",
        foreign_keys="AssignmentModel.user_id",
    )
    created_clients: Mapped[list["ClientModel"]] = relationship(
        "ClientModel",
        back_populates="creator",
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('manager', 'commercial', 'client')",
            name="valid_role",
        ),
    )


class ProjectModel(Base):
    """Project ORM model."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    total_lots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sold_lots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ca_objectif: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    geojson_file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    creator: Mapped["UserModel"] = relationship(
        "UserModel",
        back_populates="created_projects",
        foreign_keys=[created_by],
    )
    lots: Mapped[list["LotModel"]] = relationship(
        "LotModel",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    assignments: Mapped[list["AssignmentModel"]] = relationship(
        "AssignmentModel",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    reservations: Mapped[list["ReservationModel"]] = relationship(
        "ReservationModel",
        back_populates="project",
    )
    sales: Mapped[list["SaleModel"]] = relationship(
        "SaleModel",
        back_populates="project",
    )
    financing_plans: Mapped[list["ProjectFinancingPlanModel"]] = relationship(
        "ProjectFinancingPlanModel",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectFinancingPlanModel.id",
    )
    pricing_configs: Mapped[list["LotPricingConfigModel"]] = relationship(
        "LotPricingConfigModel",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "visibility IN ('public', 'private')",
            name="valid_visibility",
        ),
    )


class AssignmentModel(Base):
    """Project-User assignment ORM model."""

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    assigned_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    # Relationships
    user: Mapped["UserModel"] = relationship(
        "UserModel",
        back_populates="assignments",
        foreign_keys=[user_id],
    )
    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="assignments",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="unique_assignment"),
        Index("ix_assignments_user_project", "user_id", "project_id"),
    )


class LotModel(Base):
    """Lot ORM model."""

    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    numero: Mapped[str] = mapped_column(String(50), nullable=False)
    zone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    surface: Mapped[float | None] = mapped_column(Float, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_per_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_per_sqm_acte: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="creation")
    current_reservation_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)  # GeoJSON geometry
    # Metadata fields from CSV import
    type_lot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    emplacement: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type_maison: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="lots",
    )
    reservations: Mapped[list["ReservationModel"]] = relationship(
        "ReservationModel",
        back_populates="lot",
    )
    sales: Mapped[list["SaleModel"]] = relationship(
        "SaleModel",
        back_populates="lot",
    )

    __table_args__ = (
        UniqueConstraint("project_id", "numero", name="unique_lot_numero"),
        CheckConstraint(
            "status IN ("
            "'creation', 'available', 'option', 'reservation_a_finaliser', "
            "'reservation_engagee', 'reservation_soldee', 'chez_notaire', "
            "'chez_proprietaire', 'blocked')",
            name="valid_lot_status",
        ),
        Index("ix_lots_project_status", "project_id", "status"),
    )


class ClientModel(Base):
    """Client ORM model."""

    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    client_type: Mapped[str] = mapped_column(String(20), nullable=False, default="autre")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    creator: Mapped["UserModel | None"] = relationship(
        "UserModel",
        back_populates="created_clients",
    )
    reservations: Mapped[list["ReservationModel"]] = relationship(
        "ReservationModel",
        back_populates="client",
    )
    sales: Mapped[list["SaleModel"]] = relationship(
        "SaleModel",
        back_populates="client",
    )

    __table_args__ = (
        CheckConstraint(
            "client_type IN ('proprietaire', 'revendeur', 'investisseur', 'autre')",
            name="valid_client_type",
        ),
        Index("ix_clients_name", "name"),
        Index("ix_clients_phone", "phone"),
        Index("ix_clients_cin", "cin"),
    )


class NotaireModel(Base):
    """Notaire (notary) ORM model."""

    __tablename__ = "notaires"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    telephone: Mapped[str] = mapped_column(String(30), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ville: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adresse: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    reservations: Mapped[list["ReservationModel"]] = relationship(
        "ReservationModel",
        back_populates="notaire",
    )

    __table_args__ = (
        Index("ix_notaires_nom", "nom"),
        Index("ix_notaires_telephone", "telephone"),
    )


class ReservationModel(Base):
    """Reservation ORM model."""

    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    lot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lots.id"),
        nullable=False,
    )
    client_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("clients.id"),
        nullable=False,
    )
    reserved_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    reservation_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    expiration_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    deposit: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    deposit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deposit_refund_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    deposit_refund_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deposit_refund_payment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    release_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # New workflow fields
    payment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    guarantee_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    notary_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notary_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Réservation engagée — prix de vente et promotion
    sale_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    promotion_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    promotion_paid_timing: Mapped[str | None] = mapped_column(String(10), nullable=True)
    promotion_received: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default="false"
    )
    # Notaire — FK vers l'entité notaire (remplace le texte libre notary_name)
    notaire_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("notaires.id"),
        nullable=True,
    )
    # Réservation soldée — intention de passage chez le notaire
    wants_notaire: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="reservations",
    )
    lot: Mapped["LotModel"] = relationship(
        "LotModel",
        back_populates="reservations",
    )
    client: Mapped["ClientModel"] = relationship(
        "ClientModel",
        back_populates="reservations",
    )
    notaire: Mapped["NotaireModel | None"] = relationship(
        "NotaireModel",
        back_populates="reservations",
    )
    reserved_by: Mapped["UserModel | None"] = relationship("UserModel")
    sale: Mapped["SaleModel | None"] = relationship(
        "SaleModel",
        back_populates="reservation",
        uselist=False,
    )
    payment_schedule: Mapped["PaymentScheduleModel | None"] = relationship(
        "PaymentScheduleModel",
        back_populates="reservation",
        uselist=False,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'validated', 'expired', 'released', 'converted')",
            name="valid_reservation_status",
        ),
        Index("ix_reservations_status", "status"),
        Index("ix_reservations_expiration", "expiration_date"),
    )


class SaleModel(Base):
    """Sale ORM model."""

    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    lot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lots.id"),
        nullable=False,
    )
    client_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("clients.id"),
        nullable=False,
    )
    reservation_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("reservations.id"),
        nullable=True,
    )
    sold_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    sale_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    # Relationships
    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="sales",
    )
    lot: Mapped["LotModel"] = relationship(
        "LotModel",
        back_populates="sales",
    )
    client: Mapped["ClientModel"] = relationship(
        "ClientModel",
        back_populates="sales",
    )
    reservation: Mapped["ReservationModel | None"] = relationship(
        "ReservationModel",
        back_populates="sale",
    )
    sold_by: Mapped["UserModel | None"] = relationship("UserModel")

    __table_args__ = (Index("ix_sales_date", "sale_date"),)


class AuditLogModel(Base):
    """Audit log ORM model for tracking changes."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    old_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_created", "created_at"),
    )


class PaymentScheduleModel(Base):
    """Payment schedule for a reservation — defines deposit/balance split and installments."""

    __tablename__ = "payment_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reservation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("reservations.id"),
        nullable=False,
        unique=True,
    )
    lot_price: Mapped[float] = mapped_column(Float, nullable=False)
    deposit_pct: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    balance_pct: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    deposit_total: Mapped[float] = mapped_column(Float, nullable=False)
    balance_total: Mapped[float] = mapped_column(Float, nullable=False)
    balance_delay_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    reservation: Mapped["ReservationModel"] = relationship(
        "ReservationModel",
        back_populates="payment_schedule",
    )
    installments: Mapped[list["PaymentInstallmentModel"]] = relationship(
        "PaymentInstallmentModel",
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="PaymentInstallmentModel.due_date",
    )

    __table_args__ = (Index("ix_payment_schedules_reservation", "reservation_id"),)


class PaymentInstallmentModel(Base):
    """Individual payment installment within a payment schedule."""

    __tablename__ = "payment_installments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("payment_schedules.id"),
        nullable=False,
    )
    payment_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'deposit' | 'balance'
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    paid_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    schedule: Mapped["PaymentScheduleModel"] = relationship(
        "PaymentScheduleModel",
        back_populates="installments",
    )

    __table_args__ = (
        CheckConstraint(
            "payment_type IN ('deposit', 'balance')",
            name="valid_payment_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'paid')",
            name="valid_installment_status",
        ),
        Index("ix_installments_schedule", "schedule_id"),
        Index("ix_installments_due_date", "due_date"),
    )


class ProjectFinancingPlanModel(Base):
    """Default financing plan template for a project.

    Each row represents a new plan version; the most recent row
    (highest id) is the active default used when creating payment
    schedules for reservations in this project.
    """

    __tablename__ = "project_financing_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    deposit_pct: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    deposit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deposit_periodicity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    balance_delay_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    balance_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    balance_periodicity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    # Relationships
    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="financing_plans",
    )
    creator: Mapped["UserModel"] = relationship(
        "UserModel",
        foreign_keys=[created_by],
    )

    __table_args__ = (
        Index("ix_project_financing_plans_project", "project_id"),
    )


class LotPricingConfigModel(Base):
    """Per-project pricing config for each categorical combination of lot attributes.

    One row per (project, zone, type_lot, type_maison, emplacement) combination.
    prix_m2_acte is stable (legal act price); prix_m2_catalogue is the marketing
    price that can be updated by managers.
    """

    __tablename__ = "lot_pricing_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
    )
    zone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type_lot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type_maison: Mapped[str | None] = mapped_column(String(50), nullable=True)
    emplacement: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prix_m2_acte: Mapped[float] = mapped_column(Float, nullable=False)
    prix_m2_catalogue: Mapped[float] = mapped_column(Float, nullable=False)
    created_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel",
        back_populates="pricing_configs",
    )
    creator: Mapped["UserModel"] = relationship(
        "UserModel",
        foreign_keys=[created_by],
    )

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "zone",
            "type_lot",
            "type_maison",
            "emplacement",
            name="uq_lot_pricing_config_combination",
        ),
        Index("ix_lot_pricing_configs_project", "project_id"),
    )


class LotDocumentModel(Base):
    """Document attached to a lot for the notaire workflow."""

    __tablename__ = "lot_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lots.id"),
        nullable=False,
    )
    reservation_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("reservations.id"),
        nullable=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(100), nullable=False, default="application/octet-stream"
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    # Relationships
    lot: Mapped["LotModel"] = relationship("LotModel")

    __table_args__ = (Index("ix_lot_documents_lot", "lot_id"),)


class AIConversationModel(Base):
    """AI Assistant conversation history."""

    __tablename__ = "ai_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    messages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="fr")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    __table_args__ = (
        Index("ix_ai_conversations_user_updated", "user_id", "updated_at"),
    )
