"""Project management endpoints."""

import csv
import io

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.dependencies import CurrentUser, ManagerUser, ProjectServiceDep
from app.domain.schemas.common import MessageResponse
from app.domain.schemas.project import (
    AssignUserRequest,
    ProjectCreate,
    ProjectKPIs,
    ProjectPerformance,
    ProjectResponse,
    ProjectUpdate,
)
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
) -> ProjectKPIs:
    """Get project KPIs including sales rates, revenue, and lot statistics."""
    return await project_service.get_project_kpis(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
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

    The CSV must have a 'parcelid' column that matches the lot 'numero'.
    Supported columns:
    - parcelid: Lot identifier (required, matches 'numero')
    - type de lots: Type of lot (e.g., commercial, residential)
    - emplacement: Location type (e.g., 2 façade, 3 façade)
    - type maison: House type (e.g., villa, apartment)
    - prix: Price (optional, will update lot price)
    """
    # Read CSV content
    content = await file.read()

    # Try to decode with different encodings
    for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = content.decode("utf-8", errors="replace")

    # Parse CSV
    reader = csv.DictReader(io.StringIO(text), delimiter=";")

    # If semicolon doesn't work, try comma
    rows = list(reader)
    if not rows or (rows and len(rows[0]) <= 1):
        reader = csv.DictReader(io.StringIO(text), delimiter=",")
        rows = list(reader)

    return await project_service.import_csv_metadata(
        project_id=project_id,
        user_id=current_user.id,
        user_role=current_user.role,
        csv_rows=rows,
    )
