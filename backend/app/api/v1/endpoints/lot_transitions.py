"""Lot workflow transition endpoints.

All workflow status changes are handled through these explicit endpoints.
Generic lot updates (PUT /lots/{id}) only handle creation/available/blocked.
"""

from fastapi import APIRouter

from app.api.dependencies import (
    CurrentUser,
    EtatDesLieuxServiceDep,
    LotServiceDep,
    ManagerUser,
    ReservationServiceDep,
)
from app.domain.schemas.etat_des_lieux import EdlDoneData, EdlScheduleData
from app.domain.schemas.lot import LotResponse
from app.domain.schemas.reservation import (
    BlockLotData,
    ChezNotaireData,
    DirectToEngageeData,
    DirectToRAFData,
    FinaliserEngageData,
    FinaliserRefundData,
    OptionCreate,
    OptionEngageData,
    ReservationAFinaliserData,
    ReservationResponse,
    SetNotaireIntentData,
    UnblockLotData,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse

router = APIRouter()


@router.post(
    "/{lot_id}/transitions/activate",
    response_model=LotResponse,
    summary="Activer le lot",
    description="Passage création → disponible. Valide que le prix et la surface sont renseignés.",
)
async def activate_lot(
    lot_id: int,
    current_user: CurrentUser,
    lot_service: LotServiceDep,
) -> LotResponse:
    """Activate a lot in creation status, transitioning it to available."""
    return await lot_service.activate_lot(lot_id, user_id=current_user.id)


@router.post(
    "/{lot_id}/transitions/direct-reservation",
    response_model=ReservationResponse,
    summary="Passer directement en réservation à finaliser",
    description="Passage disponible → réservation à finaliser sans passer par l'option. Crée la réservation avec la garantie.",
)
async def available_to_reservation(
    lot_id: int,
    data: DirectToRAFData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Move directly from available to reservation_a_finaliser."""
    return await reservation_service.available_to_reservation_a_finaliser(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/direct-engage",
    response_model=ReservationResponse,
    summary="Passer directement en réservation engagée",
    description="Passage disponible → réservation engagée. Utilisé lors de la réception du ND et du premier acompte.",
)
async def available_to_engagee(
    lot_id: int,
    data: DirectToEngageeData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Move directly from available to reservation_engagee."""
    return await reservation_service.available_to_reservation_engagee(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/option-engage",
    response_model=ReservationResponse,
    summary="Passer d'une option à une réservation engagée",
    description="Passage option → réservation engagée, uniquement si « Réservation à finaliser » est désactivé pour le projet.",
)
async def option_to_engagee(
    lot_id: int,
    data: OptionEngageData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Move from option to reservation_engagee."""
    return await reservation_service.option_to_reservation_engagee(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{lot_id}/transitions/start-option",
    response_model=ReservationResponse,
    summary="Démarrer une option",
    description="Passage disponible → option. Crée une réservation liée au lot.",
)
async def start_option(
    lot_id: int,
    data: OptionCreate,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Start an option on an available lot."""
    return await reservation_service.start_option_for_lot(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/cancel-option",
    response_model=LotResponse,
    summary="Annuler l'option",
    description="Passage option → disponible (annulation sans garantie).",
)
async def cancel_option(
    lot_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    reason: str | None = None,
) -> LotResponse:
    """Cancel an option, returning the lot to available."""
    return await reservation_service.cancel_option(
        lot_id=lot_id,
        user_id=current_user.id,
        user_role=current_user.role,
        reason=reason,
    )


@router.post(
    "/{lot_id}/transitions/extend-option",
    response_model=ReservationResponse,
    summary="Prolonger l'option",
    description="Ajoute des jours à la date d'expiration (option ou réservation à finaliser).",
)
async def extend_option(
    lot_id: int,
    additional_days: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Extend option expiration date."""
    return await reservation_service.extend_option(
        lot_id=lot_id,
        additional_days=additional_days,
    )


@router.post(
    "/{lot_id}/transitions/to-reservation",
    response_model=ReservationResponse,
    summary="Passer en réservation à finaliser",
    description="Passage option → réservation à finaliser. Enregistre la garantie et le type de paiement.",
)
async def option_to_reservation(
    lot_id: int,
    data: ReservationAFinaliserData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Move from option to reservation_a_finaliser."""
    return await reservation_service.option_to_reservation_a_finaliser(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{lot_id}/transitions/refund",
    response_model=LotResponse,
    summary="Rembourser → Disponible",
    description="Réservation à finaliser → disponible avec remboursement de la garantie.",
)
async def finaliser_refund(
    lot_id: int,
    data: FinaliserRefundData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> LotResponse:
    """Cancel reservation_a_finaliser with refund."""
    return await reservation_service.finaliser_refund(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{lot_id}/transitions/engage",
    response_model=LotResponse,
    summary="Engager la réservation",
    description=(
        "Réservation à finaliser → réservation engagée. "
        "guarantee_action=deduct : garantie conservée. "
        "guarantee_action=refund : garantie rendue au client mais la réservation avance quand même."
    ),
)
async def finaliser_engage(
    lot_id: int,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
    data: FinaliserEngageData | None = None,
) -> LotResponse:
    """Move from reservation_a_finaliser to reservation_engagee."""
    return await reservation_service.finaliser_engage(
        lot_id=lot_id,
        data=data or FinaliserEngageData(),
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{lot_id}/transitions/solde",
    response_model=SaleResponse,
    summary="Marquer soldé",
    description="Réservation engagée → réservation soldée. Crée l'enregistrement de vente.",
)
async def engagee_to_soldee(
    lot_id: int,
    data: SaleFromReservation,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> SaleResponse:
    """Mark full payment received — creates sale record."""
    return await reservation_service.engagee_to_soldee(
        lot_id=lot_id,
        sale_data=data,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{lot_id}/transitions/set-notaire-intent",
    response_model=ReservationResponse,
    summary="Définir l'intention notaire",
    description=(
        "Marque si le client souhaite passer chez le notaire "
        "(réservation soldée ou état des lieux programmé / réalisé / finalisé). "
        "Active ou désactive le tag 'wants_notaire' sur la réservation."
    ),
)
async def set_notaire_intent(
    lot_id: int,
    data: SetNotaireIntentData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> ReservationResponse:
    """Set the notaire intent tag on a sold lot (soldée or EDL status)."""
    return await reservation_service.set_notaire_intent(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/notaire",
    response_model=LotResponse,
    summary="Passer chez le notaire",
    description=(
        "Réservation soldée (EDL désactivé) ou état des lieux finalisé (EDL activé) "
        "→ chez le notaire. Enregistre le nom et la date du notaire."
    ),
)
async def soldee_to_notaire(
    lot_id: int,
    data: ChezNotaireData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> LotResponse:
    """Move from reservation_soldee or edl_finalise to chez_notaire."""
    return await reservation_service.soldee_to_notaire(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.put(
    "/{lot_id}/transitions/notaire",
    response_model=LotResponse,
    summary="Modifier les infos du notaire",
    description="Met à jour le nom et la date du notaire pour un lot déjà chez le notaire.",
)
async def update_notaire_info(
    lot_id: int,
    data: ChezNotaireData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> LotResponse:
    """Update notary info for a lot already in chez_notaire status."""
    return await reservation_service.update_notaire_info(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/proprietaire",
    response_model=LotResponse,
    summary="Confirmer acte notarial",
    description="Chez le notaire → chez le propriétaire. Confirme la réception des documents notariaux.",
)
async def notaire_to_proprietaire(
    lot_id: int,
    current_user: ManagerUser,
    reservation_service: ReservationServiceDep,
) -> LotResponse:
    """Confirm notarial act received (manager only)."""
    return await reservation_service.notaire_to_proprietaire(
        lot_id=lot_id,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/block",
    response_model=LotResponse,
    summary="Bloquer le lot",
    description="Bloque le lot (tous statuts sauf chez_proprietaire).",
)
async def block_lot(
    lot_id: int,
    data: BlockLotData,
    current_user: CurrentUser,
    reservation_service: ReservationServiceDep,
) -> LotResponse:
    """Block a lot."""
    return await reservation_service.block_lot(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/unblock",
    response_model=LotResponse,
    summary="Débloquer le lot",
    description="Libère un lot bloqué → disponible (manager uniquement).",
)
async def unblock_lot(
    lot_id: int,
    current_user: ManagerUser,
    reservation_service: ReservationServiceDep,
    data: UnblockLotData | None = None,
) -> LotResponse:
    """Unblock a lot (manager only)."""
    return await reservation_service.unblock_lot(
        lot_id=lot_id,
        data=data,
        user_id=current_user.id,
    )


@router.post(
    "/{lot_id}/transitions/edl-schedule",
    response_model=LotResponse,
    summary="Programmer l'état des lieux",
    description=(
        "Réservation soldée → état des lieux programmé (si l'état des lieux est "
        "activé pour le projet). Crée l'état des lieux lié à la réservation courante."
    ),
)
async def edl_schedule(
    lot_id: int,
    data: EdlScheduleData,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> LotResponse:
    """Programme the état des lieux of a sold lot."""
    return await edl_service.schedule(lot_id, data, user_id=current_user.id)


@router.put(
    "/{lot_id}/transitions/edl-schedule",
    response_model=LotResponse,
    summary="Reprogrammer l'état des lieux",
    description="Change la date, l'intervenant ou la note (statut inchangé).",
)
async def edl_reschedule(
    lot_id: int,
    data: EdlScheduleData,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> LotResponse:
    """Reprogramme a programmed état des lieux."""
    return await edl_service.reschedule(lot_id, data, user_id=current_user.id)


@router.post(
    "/{lot_id}/transitions/edl-done",
    response_model=LotResponse,
    summary="Marquer l'état des lieux réalisé",
    description="État des lieux programmé → réalisé, avec les actions relevées.",
)
async def edl_done(
    lot_id: int,
    data: EdlDoneData,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> LotResponse:
    """Record the visit and the actions it raised."""
    return await edl_service.mark_done(lot_id, data, user_id=current_user.id)


@router.post(
    "/{lot_id}/transitions/edl-finalize",
    response_model=LotResponse,
    summary="Finaliser l'état des lieux",
    description="État des lieux réalisé → finalisé (aucune action ouverte).",
)
async def edl_finalize(
    lot_id: int,
    current_user: CurrentUser,
    edl_service: EtatDesLieuxServiceDep,
) -> LotResponse:
    """Close the état des lieux once every action is done."""
    return await edl_service.finalize(lot_id, user_id=current_user.id)
