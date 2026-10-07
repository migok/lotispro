"""Lot document endpoints — upload, list, download, delete."""

from fastapi import APIRouter, UploadFile
from fastapi.responses import Response

from app.api.dependencies import CurrentUser, DocumentServiceDep
from app.domain.schemas.document import LotDocumentResponse

router = APIRouter()


@router.post(
    "/{lot_id}/documents",
    response_model=LotDocumentResponse,
    summary="Uploader un document",
    description="Attache un document (PDF, image, Word, Excel) à un lot.",
)
async def upload_document(
    lot_id: int,
    file: UploadFile,
    current_user: CurrentUser,
    doc_service: DocumentServiceDep,
) -> LotDocumentResponse:
    """Upload a document and attach it to a lot."""
    return await doc_service.upload_document(
        lot_id=lot_id,
        file=file,
        user_id=current_user.id,
    )


@router.get(
    "/{lot_id}/documents",
    response_model=list[LotDocumentResponse],
    summary="Lister les documents",
    description="Retourne tous les documents attachés au lot.",
)
async def list_documents(
    lot_id: int,
    current_user: CurrentUser,
    doc_service: DocumentServiceDep,
) -> list[LotDocumentResponse]:
    """List all documents for a lot."""
    return await doc_service.list_documents(lot_id=lot_id)


@router.get(
    "/{lot_id}/documents/{doc_id}",
    summary="Télécharger un document",
    description="Télécharge le fichier associé au document.",
)
async def download_document(
    lot_id: int,
    doc_id: int,
    current_user: CurrentUser,
    doc_service: DocumentServiceDep,
) -> Response:
    """Download a document file (proxied through the backend)."""
    content, content_type, filename = await doc_service.get_document_file(
        lot_id=lot_id,
        doc_id=doc_id,
    )
    # Encode filename for Content-Disposition (ASCII-safe fallback)
    safe = filename.encode("ascii", "ignore").decode() or "document"
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


@router.delete(
    "/{lot_id}/documents/{doc_id}",
    status_code=204,
    summary="Supprimer un document",
    description="Supprime le document et son fichier.",
)
async def delete_document(
    lot_id: int,
    doc_id: int,
    current_user: CurrentUser,
    doc_service: DocumentServiceDep,
) -> None:
    """Delete a document."""
    await doc_service.delete_document(
        lot_id=lot_id,
        doc_id=doc_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )
