"""Reservation management endpoints."""

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.dependencies import CertificateServiceDep, CurrentUser, PaymentServiceDep, ReservationServiceDep
from app.domain.schemas.reservation import (
    MarkPromotionReceivedData,
    ReservationCreate,
    ReservationExtend,
    ReservationFilter,
    ReservationRelease,
    ReservationResponse,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse
from app.services.email_service import EmailService

_email_service = EmailService()

router = APIRouter()


@router.get(
    "",
    response_model=list[ReservationResponse],
    summary="List reservations",
    description="Get reservations with optional filters",
)
async def list_reservations(
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    status: str | None = Query(default=None, description="Filter by status"),
    lot_id: int | None = Query(default=None, description="Filter by lot"),
    client_id: int | None = Query(default=None, description="Filter by client"),
) -> list[ReservationResponse]:
    """List all reservations with filters."""
    filters = ReservationFilter(
        status=status,
        lot_id=lot_id,
        client_id=client_id,
    )
    return await reservation_service.get_reservations(filters=filters)


@router.get(
    "/{reservation_id}",
    response_model=ReservationResponse,
    summary="Get reservation",
    description="Get reservation by ID",
)
async def get_reservation(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Get reservation by ID."""
    return await reservation_service.get_reservation(reservation_id)


@router.post(
    "",
    response_model=ReservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create reservation",
    description="Create a new reservation (lot must be available)",
)
async def create_reservation(
    data: ReservationCreate,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Create a new reservation."""
    return await reservation_service.create_reservation(
        data,
        user_id=current_user.id,
    )


@router.post(
    "/{reservation_id}/release",
    response_model=ReservationResponse,
    summary="Release reservation",
    description="Cancel/release an active reservation (manager or reservation owner only)",
)
async def release_reservation(
    reservation_id: int,
    data: ReservationRelease,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Release (cancel) an active reservation. Only managers or the commercial who created the reservation can release it."""
    return await reservation_service.release_reservation(
        reservation_id=reservation_id,
        user_id=current_user.id,
        user_role=current_user.role,
        data=data,
    )


@router.post(
    "/{reservation_id}/extend",
    response_model=ReservationResponse,
    summary="Extend reservation",
    description="Extend an active reservation by adding days",
)
async def extend_reservation(
    reservation_id: int,
    data: ReservationExtend,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Extend an active reservation by adding days."""
    return await reservation_service.extend_reservation(
        reservation_id,
        data.additional_days,
    )


@router.post(
    "/{reservation_id}/convert-to-sale",
    response_model=SaleResponse,
    summary="Convert to sale",
    description="Convert active reservation to a sale (manager or reservation owner only)",
)
async def convert_reservation_to_sale(
    reservation_id: int,
    data: SaleFromReservation,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> SaleResponse:
    """Convert reservation to sale. Only managers or the commercial who created the reservation can finalize it."""
    return await reservation_service.convert_to_sale(
        reservation_id,
        data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.get(
    "/alerts/expired",
    summary="Alertes expirations",
    description="Retourne les lots en option ou réservation à finaliser dont la date est dépassée. Aucune mutation de statut.",
)
async def get_expired_alerts(
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> dict:
    """Get expired options/finalisations as alerts (read-only, no status mutations)."""
    return await reservation_service.get_expired_alerts()


@router.post(
    "/check-expirations",
    summary="[Déprécié] Vérifier les expirations",
    description="Déprécié : ne fait plus de transition automatique. Retourne le nombre d'alertes.",
    deprecated=True,
)
async def check_expirations(
    reservation_service: ReservationServiceDep,
) -> dict:
    """Deprecated: returns alert count only, no mutations."""
    count = await reservation_service.check_expirations()
    return {"processed": count, "message": f"{count} lots with expired dates (no status changes)"}


@router.get(
    "/{reservation_id}/certificate",
    summary="Download reservation certificate",
    description="Generate and download a PDF Acte de Réservation",
    response_class=Response,
)
async def download_reservation_certificate(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    certificate_service: CertificateServiceDep,
    payment_service: PaymentServiceDep,
) -> Response:
    """Generate PDF certificate for a reservation."""
    details = await reservation_service.get_reservation_details(reservation_id)
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found",
        )

    # Require the first deposit installment to be paid before generating the certificate.
    # Use schedule.lot_price (= remaining balance after initial payment) so that the
    # certificate balance = schedule.lot_price - first_installment.amount.
    deposit_for_cert = details["deposit"]
    # Prefer sale_price (prix de vente sur l'acte) over catalogue price
    lot_price_for_cert = details.get("sale_price") or details.get("lot_price")
    try:
        schedule = await payment_service.get_schedule_for_reservation(reservation_id)
        deposit_installments = sorted(
            [i for i in schedule.installments if i.payment_type == "deposit"],
            key=lambda i: i.installment_number,
        )
        if deposit_installments:
            first = deposit_installments[0]
            if first.status != "paid":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Le premier versement d'acompte doit être effectué "
                        "avant de générer l'acte de réservation."
                    ),
                )
            deposit_for_cert = first.amount
            # Use sale_price if captured, otherwise fall back to schedule.lot_price
            lot_price_for_cert = details.get("sale_price") or schedule.lot_price
    except HTTPException:
        raise
    except Exception:
        pass  # no schedule — fall back to reservation values

    # Require promotion to be received when a promotion amount was applied.
    # If the promotion has not been collected yet, only the receipt is available.
    if (details.get("promotion_amount") or 0) > 0 and not details.get("promotion_received"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Le montant de la promotion n'a pas encore été reçu. "
                "Téléchargez le reçu de paiement en attendant la réception de la promotion."
            ),
        )

    pdf_bytes = certificate_service.generate_reservation_certificate(
        reservation_id=details["id"],
        reservation_date=details["reservation_date"],
        deposit=deposit_for_cert,
        deposit_date=details.get("deposit_date"),
        lot_numero=details["lot_numero"],
        lot_surface=details.get("lot_surface"),
        lot_price=lot_price_for_cert,
        project_name=details["project_name"],
        client_name=details["client_name"],
        client_cin=details.get("client_cin"),
        client_address=details.get("client_address"),
    )

    safe_lot = details["lot_numero"].replace("/", "-").replace(" ", "_")
    filename = f"acte_reservation_{reservation_id}_lot{safe_lot}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{reservation_id}/certificate/email",
    summary="Send reservation certificate by email",
    description="Generate the PDF certificate and send it to the client's email address",
)
async def send_reservation_certificate_email(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    certificate_service: CertificateServiceDep,
    payment_service: PaymentServiceDep,
) -> dict:
    """Generate PDF certificate and email it to the client."""
    details = await reservation_service.get_reservation_details(reservation_id)
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found",
        )

    client_email = details.get("client_email")
    if not client_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le client n'a pas d'adresse email enregistrée.",
        )

    deposit_for_cert = details["deposit"]
    lot_price_for_cert = details.get("sale_price") or details.get("lot_price")
    try:
        schedule = await payment_service.get_schedule_for_reservation(reservation_id)
        deposit_installments = sorted(
            [i for i in schedule.installments if i.payment_type == "deposit"],
            key=lambda i: i.installment_number,
        )
        if deposit_installments:
            first = deposit_installments[0]
            if first.status != "paid":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Le premier versement d'acompte doit être effectué "
                        "avant d'envoyer l'acte de réservation."
                    ),
                )
            deposit_for_cert = first.amount
            lot_price_for_cert = details.get("sale_price") or schedule.lot_price
    except HTTPException:
        raise
    except Exception:
        pass  # no schedule — fall back to reservation values

    if (details.get("promotion_amount") or 0) > 0 and not details.get("promotion_received"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Le montant de la promotion n'a pas encore été reçu. "
                "L'acte de réservation ne peut être envoyé qu'après réception de la promotion."
            ),
        )

    pdf_bytes = certificate_service.generate_reservation_certificate(
        reservation_id=details["id"],
        reservation_date=details["reservation_date"],
        deposit=deposit_for_cert,
        deposit_date=details.get("deposit_date"),
        lot_numero=details["lot_numero"],
        lot_surface=details.get("lot_surface"),
        lot_price=lot_price_for_cert,
        project_name=details["project_name"],
        client_name=details["client_name"],
        client_cin=details.get("client_cin"),
        client_address=details.get("client_address"),
    )

    safe_lot = details["lot_numero"].replace("/", "-").replace(" ", "_")
    filename = f"acte_reservation_{reservation_id}_lot{safe_lot}.pdf"

    sent = await _email_service.send_certificate_email(
        client_name=details["client_name"],
        client_email=client_email,
        lot_numero=details["lot_numero"],
        project_name=details["project_name"],
        pdf_bytes=pdf_bytes,
        filename=filename,
    )

    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Impossible d'envoyer l'email. Vérifiez la configuration RESEND_API_KEY.",
        )

    return {"message": f"Acte de réservation envoyé à {client_email}", "email": client_email}


@router.get(
    "/{reservation_id}/receipt",
    summary="Download payment receipt",
    description=(
        "Génère et télécharge le Reçu de Paiement (premier acompte). "
        "Disponible dès que le premier acompte est enregistré, "
        "y compris quand la promotion n'a pas encore été reçue."
    ),
    response_class=Response,
)
async def download_payment_receipt(
    reservation_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    certificate_service: CertificateServiceDep,
    payment_service: PaymentServiceDep,
) -> Response:
    """Generate PDF Reçu de Paiement for a reservation (first deposit receipt)."""
    from datetime import datetime, timezone

    details = await reservation_service.get_reservation_details(reservation_id)
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found",
        )

    deposit_for_receipt = details["deposit"]
    deposit_date_for_receipt = details.get("deposit_date")
    sale_price = details.get("sale_price")
    promotion_amount = details.get("promotion_amount")

    # Use the first paid deposit installment if available
    try:
        schedule = await payment_service.get_schedule_for_reservation(reservation_id)
        deposit_installments = sorted(
            [i for i in schedule.installments if i.payment_type == "deposit"],
            key=lambda i: i.installment_number,
        )
        if deposit_installments:
            first = deposit_installments[0]
            if first.status != "paid":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Le premier versement d'acompte doit être effectué "
                        "avant de générer le reçu de paiement."
                    ),
                )
            deposit_for_receipt = first.amount
            if first.paid_date:
                deposit_date_for_receipt = first.paid_date.date() if hasattr(first.paid_date, "date") else first.paid_date
    except HTTPException:
        raise
    except Exception:
        pass  # no schedule — fall back to reservation values

    pdf_bytes = certificate_service.generate_payment_receipt(
        reservation_id=details["id"],
        receipt_date=details["reservation_date"],
        deposit_amount=deposit_for_receipt,
        deposit_date=deposit_date_for_receipt,
        lot_numero=details["lot_numero"],
        lot_surface=details.get("lot_surface"),
        sale_price=sale_price,
        promotion_amount=promotion_amount,
        project_name=details["project_name"],
        client_name=details["client_name"],
        client_cin=details.get("client_cin"),
        client_address=details.get("client_address"),
    )

    safe_lot = details["lot_numero"].replace("/", "-").replace(" ", "_")
    filename = f"recu_paiement_{reservation_id}_lot{safe_lot}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{reservation_id}/mark-promotion-received",
    response_model=ReservationResponse,
    summary="Marquer la promotion comme reçue",
    description=(
        "Enregistre la réception du montant de la promotion sur une réservation engagée. "
        "Après cela, l'acte de réservation peut être généré."
    ),
)
async def mark_promotion_received(
    reservation_id: int,
    data: MarkPromotionReceivedData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Mark promotion amount as received on an engaged reservation."""
    return await reservation_service.mark_promotion_received(
        reservation_id=reservation_id,
        data=data,
        user_id=current_user.id,
    )
