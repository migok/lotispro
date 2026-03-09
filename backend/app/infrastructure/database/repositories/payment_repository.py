"""Payment repository — data access for payment schedules and installments."""

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


class PaymentRepository(BaseRepository[PaymentScheduleModel]):
    """Repository for payment schedule and installment operations."""

    model = PaymentScheduleModel

    async def get_by_reservation(
        self,
        reservation_id: int,
    ) -> PaymentScheduleModel | None:
        """Get a payment schedule with all its installments by reservation ID."""
        result = await self.session.execute(
            select(PaymentScheduleModel)
            .where(PaymentScheduleModel.reservation_id == reservation_id)
            .options(selectinload(PaymentScheduleModel.installments))
        )
        return result.scalar_one_or_none()

    async def get_all_by_client(
        self,
        client_id: int,
    ) -> list[PaymentScheduleModel]:
        """Get all payment schedules for a client via their reservations."""
        result = await self.session.execute(
            select(PaymentScheduleModel)
            .join(
                ReservationModel,
                PaymentScheduleModel.reservation_id == ReservationModel.id,
            )
            .where(ReservationModel.client_id == client_id)
            .options(selectinload(PaymentScheduleModel.installments))
        )
        return list(result.scalars().all())

    async def create_installment(
        self,
        schedule_id: int,
        payment_type: str,
        installment_number: int,
        amount: float,
        due_date: datetime,
    ) -> PaymentInstallmentModel:
        """Create a single installment record."""
        inst = PaymentInstallmentModel(
            schedule_id=schedule_id,
            payment_type=payment_type,
            installment_number=installment_number,
            amount=amount,
            due_date=due_date,
        )
        self.session.add(inst)
        await self.session.flush()
        await self.session.refresh(inst)
        return inst

    async def delete_by_reservation(self, reservation_id: int) -> None:
        """Delete the payment schedule (and its installments) for a reservation."""
        schedule = await self.get_by_reservation(reservation_id)
        if not schedule:
            return
        await self.session.execute(
            delete(PaymentInstallmentModel).where(
                PaymentInstallmentModel.schedule_id == schedule.id
            )
        )
        await self.session.execute(
            delete(PaymentScheduleModel).where(
                PaymentScheduleModel.id == schedule.id
            )
        )
        await self.session.flush()

    async def update_installment(
        self,
        installment_id: int,
        status: str,
        paid_date: datetime | None = None,
        notes: str | None = None,
    ) -> PaymentInstallmentModel | None:
        """Update status (and optionally paid_date / notes) on an installment."""
        update_data: dict[str, object] = {"status": status}
        if paid_date is not None:
            update_data["paid_date"] = paid_date
        if notes is not None:
            update_data["notes"] = notes

        await self.session.execute(
            update(PaymentInstallmentModel)
            .where(PaymentInstallmentModel.id == installment_id)
            .values(**update_data)
        )
        await self.session.flush()

        result = await self.session.execute(
            select(PaymentInstallmentModel).where(
                PaymentInstallmentModel.id == installment_id
            )
        )
        return result.scalar_one_or_none()
