"""Reservation management endpoints."""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.dependencies import (
    ActeServiceDep,
    CommercialOrManager,
    CurrentUser,
    DocumentServiceDep,
    NotificationServiceDep,
    ReservationServiceDep,
)
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain.schemas.document import LotDocumentResponse
from app.domain.schemas.notification import NotificationResponse, NotifyRequest
from app.domain.schemas.reservation import (
    MarkPromotionReceivedData,
    ReservationCreate,
    ReservationExtend,
    ReservationFilter,
    ReservationRelease,
    ReservationResponse,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse
from app.services.acte_service import (
    DEPOSIT_UNPAID,
    PROMOTION_PENDING,
    ActeNotReadyError,
)
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
    return {
        "processed": count,
        "message": f"{count} lots with expired dates (no status changes)",
    }


def _pdf_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@contextmanager
def _legacy_pdf_errors(
    reservation_id: int, not_ready_messages: dict[str, str] | None = None
) -> Iterator[None]:
    """Keep the historical HTTP errors of the certificate / receipt endpoints.

    ``not_ready_messages`` overrides the message per ``ActeNotReadyError.rule``.
    """
    try:
        yield
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found",
        ) from exc
    except ActeNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(not_ready_messages or {}).get(exc.rule or "", exc.message),
        ) from exc


@router.get(
    "/{reservation_id}/certificate",
    summary="Download reservation certificate",
    description="Generate and download a PDF Acte de Réservation",
    response_class=Response,
)
async def download_reservation_certificate(
    reservation_id: int,
    current_user: CurrentUser,
    acte_service: ActeServiceDep,
) -> Response:
    """Generate PDF certificate for a reservation (first deposit paid required)."""
    with _legacy_pdf_errors(reservation_id):
        pdf_bytes, filename = await acte_service.build_certificate_pdf(reservation_id)
    return _pdf_response(pdf_bytes, filename)


_EMAIL_NOT_READY_MESSAGES = {
    DEPOSIT_UNPAID: (
        "Le premier versement d'acompte doit être effectué "
        "avant d'envoyer l'acte de réservation."
    ),
    PROMOTION_PENDING: (
        "Le montant de la promotion n'a pas encore été reçu. "
        "L'acte de réservation ne peut être envoyé qu'après réception de la promotion."
    ),
}


@router.post(
    "/{reservation_id}/certificate/email",
    summary="Send reservation certificate by email",
    description="Generate the PDF certificate and send it to the client's email address",
)
async def send_reservation_certificate_email(
    reservation_id: int,
    current_user: CurrentUser,
    acte_service: ActeServiceDep,
) -> dict:
    """Generate PDF certificate and email it to the client."""
    with _legacy_pdf_errors(reservation_id, _EMAIL_NOT_READY_MESSAGES):
        details = await acte_service.load_details(reservation_id)

        client_email = details.get("client_email")
        if not client_email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Le client n'a pas d'adresse email enregistrée.",
            )

        pdf_bytes, filename = await acte_service.build_certificate_pdf(reservation_id)

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

    return {
        "message": f"Acte de réservation envoyé à {client_email}",
        "email": client_email,
    }


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
    acte_service: ActeServiceDep,
) -> Response:
    """Generate PDF Reçu de Paiement for a reservation (first deposit receipt)."""
    with _legacy_pdf_errors(reservation_id):
        pdf_bytes, filename = await acte_service.build_receipt_pdf(reservation_id)
    return _pdf_response(pdf_bytes, filename)


@router.post(
    "/{reservation_id}/acte",
    response_model=LotDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Régénérer l'acte archivé",
    description=(
        "Génère l'acte de réservation et l'archive comme nouvelle version dans les "
        "documents du lot (les versions précédentes sont conservées)."
    ),
)
async def regenerate_acte(
    reservation_id: int,
    current_user: CurrentUser,
    acte_service: ActeServiceDep,
) -> LotDocumentResponse:
    """Archive a new version of the reservation deed."""
    await acte_service.load_details(reservation_id)  # 404 if unknown
    result = await acte_service.generate_and_store(reservation_id, current_user.id)
    if result.status == "not_ready":
        raise BusinessRuleError(message=result.error or "", rule="acte_not_ready")
    if result.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La génération de l'acte a échoué. Réessayez.",
        )
    return LotDocumentResponse.model_validate(
        await acte_service.latest_acte(reservation_id)
    )


@router.get(
    "/{reservation_id}/acte",
    summary="Télécharger l'acte archivé",
    description="Télécharge la dernière version archivée de l'acte de réservation.",
    response_class=Response,
)
async def download_archived_acte(
    reservation_id: int,
    current_user: CurrentUser,
    acte_service: ActeServiceDep,
    document_service: DocumentServiceDep,
) -> Response:
    """Download the latest archived deed of a reservation."""
    acte = await acte_service.latest_acte(reservation_id)
    if acte is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun acte archivé pour cette réservation.",
        )
    content, _, filename = await document_service.get_document_file(
        acte.lot_id, acte.id
    )
    return _pdf_response(content, filename)


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
    acte_service: ActeServiceDep,
) -> ReservationResponse:
    """Mark promotion amount as received; archive the deed it was blocking."""
    reservation = await reservation_service.mark_promotion_received(
        reservation_id=reservation_id,
        data=data,
        user_id=current_user.id,
    )
    if await acte_service.latest_acte(reservation_id) is None:
        await acte_service.generate_and_store(reservation_id, current_user.id)
    return reservation


@router.post(
    "/{reservation_id}/notify",
    response_model=list[NotificationResponse],
    summary="Notifier le client",
    description=(
        "Envoie la notification de l'étape (option, à finaliser, engagée) au client "
        "sur les canaux choisis. Renvoie le résultat par canal : un canal en échec "
        "ou non configuré est enregistré dans l'historique, sans erreur HTTP."
    ),
)
async def notify_reservation(
    reservation_id: int,
    data: NotifyRequest,
    current_user: CommercialOrManager,
    notification_service: NotificationServiceDep,
) -> list[NotificationResponse]:
    """Notify the reservation's client on the chosen channels."""
    rows = await notification_service.notify(
        reservation_id, data.channels, data.kind, current_user.id
    )
    return [NotificationResponse.model_validate(row) for row in rows]
