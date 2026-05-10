"""Endpoints for lot pricing configuration (prix_m2_acte / prix_m2_catalogue)."""

from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, LotPricingServiceDep, ManagerUser
from app.domain.schemas.lot_pricing import (
    ApplyPricingConfigsResponse,
    LotPricingConfigBulkUpsert,
    LotPricingConfigsListResponse,
)

router = APIRouter()


@router.get(
    "/{project_id}/pricing-configs",
    response_model=LotPricingConfigsListResponse,
    summary="Get pricing configs for a project",
    description="Returns all configured combinations and unconfigured ones discovered from lots.",
)
async def get_pricing_configs(
    project_id: int,
    current_user: CurrentUser,
    pricing_service: LotPricingServiceDep,
) -> LotPricingConfigsListResponse:
    return await pricing_service.get_project_configs(
        project_id=project_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )


@router.post(
    "/{project_id}/pricing-configs/bulk",
    response_model=LotPricingConfigsListResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk upsert pricing configs (manager only)",
    description=(
        "Create or update pricing rows for a set of combinations. "
        "Automatically recalculates lot.price and lot.price_per_sqm "
        "for lots in 'creation' or 'available' status."
    ),
)
async def bulk_upsert_pricing_configs(
    project_id: int,
    body: LotPricingConfigBulkUpsert,
    current_user: ManagerUser,
    pricing_service: LotPricingServiceDep,
) -> LotPricingConfigsListResponse:
    return await pricing_service.bulk_upsert_configs(
        project_id=project_id,
        data=body,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )


@router.post(
    "/{project_id}/pricing-configs/apply",
    response_model=ApplyPricingConfigsResponse,
    status_code=status.HTTP_200_OK,
    summary="Apply saved pricing configs to existing lots (manager only)",
    description=(
        "Re-applies all saved pricing configs to lots currently in 'creation' or 'available' "
        "status. Useful when configs were saved before lots were created or before their "
        "combination metadata (zone/type_lot/emplacement/type_maison) was set. "
        "Creation lots with a surface will be auto-activated to 'available'."
    ),
)
async def apply_pricing_configs(
    project_id: int,
    current_user: ManagerUser,
    pricing_service: LotPricingServiceDep,
) -> ApplyPricingConfigsResponse:
    result = await pricing_service.apply_configs_to_existing_lots(
        project_id=project_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
    return ApplyPricingConfigsResponse(**result)
