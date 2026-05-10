"""Project management endpoints."""

import csv
import io

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.api.dependencies import CurrentUser, LotServiceDep, ManagerUser, ProjectServiceDep
from app.domain.schemas.common import MessageResponse
from app.domain.schemas.project import (
    AssignUserRequest,
    ProjectCreate,
    ProjectFinancingPlanCreate,
    ProjectFinancingPlanResponse,
    ProjectKPIs,
    ProjectPerformance,
    ProjectResponse,
    ProjectUpdate,
)
from app.domain.schemas.lot import LotBulkMetadataUpdate
from app.domain.schemas.user import UserResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[ProjectResponse],
    summary="List projects",
    description="Get accessible projects based on user role",
)
async def list_projects(
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> list[ProjectResponse]:
    """List projects accessible to current user."""
    return await project_service.get_projects(
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get project",
    description="Get project details by ID",
)
async def get_project(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> ProjectResponse:
    """Get project by ID with access check."""
    return await project_service.get_project(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create project",
    description="Create a new project (manager only)",
)
async def create_project(
    data: ProjectCreate,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> ProjectResponse:
    """Create a new project. Manager only."""
    return await project_service.create_project(data, current_user.id)


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update project",
    description="Update project details (manager only)",
)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> ProjectResponse:
    """Update a project. Manager only."""
    return await project_service.update_project(project_id, data)


@router.delete(
    "/{project_id}",
    response_model=MessageResponse,
    summary="Delete project",
    description="Delete a project (manager only, must have no lots)",
)
async def delete_project(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> MessageResponse:
    """Delete a project. Manager only."""
    await project_service.delete_project(project_id)
    return MessageResponse(message="Project deleted successfully")


# Project assignments
@router.get(
    "/{project_id}/users",
    response_model=list[UserResponse],
    summary="Get assigned users",
    description="Get users assigned to project (manager only)",
)
async def get_project_users(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> list[UserResponse]:
    """Get users assigned to project. Manager only."""
    return await project_service.get_assigned_users(project_id)


@router.post(
    "/{project_id}/assign",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Assign user",
    description="Assign a user to project (manager only)",
)
async def assign_user_to_project(
    project_id: int,
    data: AssignUserRequest,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> MessageResponse:
    """Assign user to project. Manager only."""
    await project_service.assign_user(project_id, data.user_id, current_user.id)
    return MessageResponse(message="User assigned to project successfully")


@router.delete(
    "/{project_id}/users/{user_id}",
    response_model=MessageResponse,
    summary="Unassign user",
    description="Remove user from project (manager only)",
)
async def unassign_user_from_project(
    project_id: int,
    user_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> MessageResponse:
    """Remove user from project. Manager only."""
    await project_service.unassign_user(project_id, user_id)
    return MessageResponse(message="User removed from project successfully")


# Project KPIs, Performance, History
@router.get(
    "/{project_id}/kpis",
    response_model=ProjectKPIs,
    summary="Get project KPIs",
    description="Get key performance indicators for a project",
)
async def get_project_kpis(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
    user_id: int | None = None,
) -> ProjectKPIs:
    """Get project KPIs including sales rates, revenue, and lot statistics.

    Args:
        user_id: Optional filter by commercial user ID (managers only)
    """
    return await project_service.get_project_kpis(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        filter_user_id=user_id if current_user.role == "manager" else None,
    )


@router.get(
    "/{project_id}/performance",
    response_model=list[ProjectPerformance],
    summary="Get commercial performance",
    description="Get commercial team performance for a project",
)
async def get_project_performance(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> list[ProjectPerformance]:
    """Get performance metrics for commercials assigned to this project."""
    return await project_service.get_project_performance(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.get(
    "/{project_id}/history",
    summary="Get project history",
    description="Get action history for a project (reservations, sales)",
)
async def get_project_history(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
    limit: int = Query(default=50, ge=1, le=200, description="Max entries to return"),
    user_id: int | None = Query(default=None, description="Filter by user"),
    date_from: str | None = Query(default=None, description="Start date (YYYY-MM-DD)"),
    date_to: str | None = Query(default=None, description="End date (YYYY-MM-DD)"),
) -> list[dict]:
    """Get history of actions on this project."""
    return await project_service.get_project_history(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        limit=limit,
        filter_user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )


# Image upload endpoint
_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post(
    "/{project_id}/upload-image",
    response_model=ProjectResponse,
    summary="Upload project image",
    description="Upload a cover image for the project to Supabase Storage (manager only)",
)
async def upload_project_image(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
    file: UploadFile = File(..., description="Image file (jpg, png, webp, gif)"),
) -> ProjectResponse:
    """Upload a cover image for a project to Supabase Storage."""
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format non supporté '{file.content_type}'. Acceptés : jpg, png, webp, gif",
        )

    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop grand. Maximum 5 Mo.",
        )

    return await project_service.upload_project_image(
        project_id=project_id,
        file_content=content,
        filename=file.filename or f"cover.{file.content_type.split('/')[-1]}",
        content_type=file.content_type,
    )


@router.delete(
    "/{project_id}/image",
    response_model=ProjectResponse,
    summary="Delete project image",
    description="Remove the cover image of a project from Supabase Storage (manager only)",
)
async def delete_project_image(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> ProjectResponse:
    """Remove a project's cover image from Supabase Storage."""
    return await project_service.remove_project_image(project_id)


# GeoJSON endpoints
@router.post(
    "/{project_id}/upload-geojson",
    summary="Upload GeoJSON",
    description="Upload GeoJSON file to create/update lots (manager only)",
)
async def upload_geojson(
    project_id: int,
    geojson_data: dict,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
) -> dict:
    """Upload GeoJSON FeatureCollection to create/update lots.

    The GeoJSON must be a FeatureCollection where each Feature has:
    - properties.numero (required): Lot identifier
    - properties.zone (optional): Zone name
    - properties.surface (optional): Surface area
    - properties.price (optional): Lot price
    - geometry (optional): GeoJSON geometry object
    """
    return await project_service.upload_geojson(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        geojson_data=geojson_data,
    )


@router.post(
    "/{project_id}/upload-geojson-file",
    summary="Upload GeoJSON File",
    description="Upload a GeoJSON file to Supabase Storage and create/update lots (manager only)",
)
async def upload_geojson_file(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
    file: UploadFile = File(..., description="GeoJSON file"),
) -> dict:
    """Upload a GeoJSON file to Supabase Storage and create/update lots.

    The file will be stored in Supabase Storage and the lots will be created/updated
    from the GeoJSON FeatureCollection.

    The GeoJSON must be a FeatureCollection where each Feature has:
    - properties.numero (required): Lot identifier
    - properties.zone (optional): Zone name
    - properties.surface (optional): Surface area
    - properties.price (optional): Lot price
    - geometry (optional): GeoJSON geometry object

    Returns:
        Upload result with created/updated/skipped counts and file URL
    """
    return await project_service.upload_geojson_file(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        file=file,
    )


@router.get(
    "/{project_id}/lots.geojson",
    summary="Export lots as GeoJSON",
    description="Download project lots as GeoJSON FeatureCollection",
)
async def export_lots_geojson(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> dict:
    """Export all project lots as GeoJSON FeatureCollection.

    Each feature includes lot properties (numero, status, price, etc.)
    and reservation/client info if applicable.
    """
    return await project_service.export_geojson(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.post(
    "/{project_id}/import-csv",
    summary="Import CSV metadata",
    description="Import CSV file to update lot metadata (manager only)",
)
async def import_csv_metadata(
    project_id: int,
    current_user: ManagerUser,
    project_service: ProjectServiceDep,
    file: UploadFile = File(..., description="CSV file with lot metadata"),
) -> dict:
    """Import CSV file to update lot metadata.

    The CSV must have an 'id_parcel' (or 'parcelid') column that matches the lot 'numero'.
    Lots absent from the CSV are left untouched (status stays 'creation').
    Supported columns:
    - id_parcel (or parcelid): Lot identifier (required, matches 'numero')
    - type de lots: Type of lot (e.g., commercial, residential)
    - emplacement: Location type (e.g., 2 façade, 3 façade)
    - type maison: House type (e.g., villa, apartment)
    - surface: Surface area in m²
    - prix_m2: Price per m² (computes prix automatically)
    - prix: Price (optional, overridden by prix_m2 × surface if both present)
    - zone: Zone identifier
    """
    # Read CSV content
    content = await file.read()

    # Try to decode with different encodings (utf-8-sig first to strip BOM)
    for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = content.decode("utf-8", errors="replace")

    # Strip leading BOM if still present
    text = text.lstrip("﻿")

    def _parse_csv(text: str, delimiter: str) -> list[dict]:
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
        if rows and reader.fieldnames:
            # Strip whitespace from all field names and values
            clean_fieldnames = [f.strip() if f else f for f in reader.fieldnames]
            rows = [
                {clean_fieldnames[i]: (v.strip() if isinstance(v, str) else v)
                 for i, (k, v) in enumerate(row.items()) if i < len(clean_fieldnames)}
                for row in rows
            ]
        return rows

    # Try semicolon first, fall back to comma if only 1 column detected
    rows = _parse_csv(text, ";")
    if not rows or (rows and len(rows[0]) <= 1):
        rows = _parse_csv(text, ",")

    return await project_service.import_csv_metadata(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        csv_rows=rows,
    )


@router.patch(
    "/{project_id}/lots/bulk-metadata",
    summary="Bulk update lot metadata",
    description="Update metadata on multiple lots at once (manager only)",
)
async def bulk_update_lot_metadata(
    project_id: int,
    data: LotBulkMetadataUpdate,
    current_user: ManagerUser,
    lot_service: LotServiceDep,
) -> dict:
    """Bulk update metadata fields on a set of lots.

    Only non-null fields in the request body are applied.
    Lots not belonging to the project are silently skipped.
    """
    count = await lot_service.bulk_update_lot_metadata(
        project_id=project_id,
        data=data,
    )
    return {"updated": count, "message": f"{count} lot(s) mis à jour"}


@router.get(
    "/{project_id}/financing-plan",
    response_model=ProjectFinancingPlanResponse | None,
    summary="Get project financing plan",
    description="Return the current default financing plan for a project, or null if none configured",
)
async def get_project_financing_plan(
    project_id: int,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> ProjectFinancingPlanResponse | None:
    """Get the active financing plan for a project."""
    return await project_service.get_project_financing_plan(
        project_id=project_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )


@router.post(
    "/{project_id}/financing-plan",
    response_model=ProjectFinancingPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Set project financing plan",
    description="Save a new financing plan for a project (becomes active immediately)",
)
async def set_project_financing_plan(
    project_id: int,
    data: ProjectFinancingPlanCreate,
    current_user: CurrentUser,
    project_service: ProjectServiceDep,
) -> ProjectFinancingPlanResponse:
    """Create a new financing plan version for a project."""
    return await project_service.set_project_financing_plan(
        project_id=project_id,
        data=data,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
