"""Document service — upload, list, download and delete lot documents.

Files are stored in Supabase Storage (bucket configured by
``SUPABASE_DOCUMENTS_BUCKET``, default ``"lot-documents"``).

The ``file_path`` column in ``lot_documents`` stores the path relative to the
bucket root, e.g.:  "42/7_rapport_expertise.pdf"
"""

import mimetypes
import re
import unicodedata

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.document import LotDocumentResponse
from app.infrastructure.database.models import LotDocumentModel
from app.infrastructure.database.repositories import LotDocumentRepository, LotRepository
from app.infrastructure.storage.supabase_storage import get_storage_client

logger = get_logger(__name__)

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _safe_filename(name: str) -> str:
    """Normalise a filename so it is safe for any storage backend."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^\w.\-]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_.")
    return name or "document"


def _doc_to_response(doc: LotDocumentModel) -> LotDocumentResponse:
    return LotDocumentResponse(
        id=doc.id,
        lot_id=doc.lot_id,
        reservation_id=doc.reservation_id,
        filename=doc.filename,
        content_type=doc.content_type,
        uploaded_by_user_id=doc.uploaded_by_user_id,
        created_at=doc.created_at,
    )


class DocumentService:
    """Service for managing lot documents stored in Supabase Storage."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.doc_repo = LotDocumentRepository(session)
        self.lot_repo = LotRepository(session)

    async def upload_document(
        self,
        lot_id: int,
        file: UploadFile,
        user_id: int | None = None,
    ) -> LotDocumentResponse:
        """Upload a document to Supabase and attach it to a lot.

        Raises:
            NotFoundError: Lot not found.
            BusinessRuleError: File type not allowed or size exceeded.
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if lot is None:
            raise NotFoundError("Lot", lot_id)

        # Resolve content-type
        content_type = file.content_type or "application/octet-stream"
        if content_type == "application/octet-stream" and file.filename:
            guessed, _ = mimetypes.guess_type(file.filename)
            if guessed:
                content_type = guessed

        if content_type not in ALLOWED_CONTENT_TYPES:
            raise BusinessRuleError(
                message=(
                    f"Type de fichier non autorisé : {content_type}. "
                    "Formats acceptés : PDF, images (JPG/PNG/WebP), Word, Excel."
                ),
                rule="invalid_document_type",
            )

        content = await file.read()
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(content) > max_bytes:
            raise BusinessRuleError(
                message=f"Fichier trop volumineux. Maximum : {settings.MAX_UPLOAD_SIZE_MB} Mo.",
                rule="file_too_large",
            )

        original_name = file.filename or "document"
        safe_name = _safe_filename(original_name)

        # Create DB record first to get a stable ID used as filename prefix
        doc = await self.doc_repo.create(
            lot_id=lot_id,
            reservation_id=lot.current_reservation_id,
            filename=original_name,
            file_path="",  # updated below
            content_type=content_type,
            uploaded_by_user_id=user_id,
        )

        # Path within the bucket: "{lot_id}/{doc_id}_{safe_name}"
        storage_path = f"{lot_id}/{doc.id}_{safe_name}"

        get_storage_client().upload_bytes(
            bucket=settings.SUPABASE_DOCUMENTS_BUCKET,
            path=storage_path,
            content=content,
            content_type=content_type,
        )

        await self.doc_repo.update(doc.id, file_path=storage_path)
        await self.session.commit()

        logger.info(
            "Document uploaded",
            lot_id=lot_id,
            doc_id=doc.id,
            bucket=settings.SUPABASE_DOCUMENTS_BUCKET,
            path=storage_path,
            size_bytes=len(content),
        )

        updated = await self.doc_repo.get_by_id(doc.id)
        return _doc_to_response(updated)  # type: ignore[arg-type]

    async def list_documents(self, lot_id: int) -> list[LotDocumentResponse]:
        """Return all documents attached to a lot."""
        lot = await self.lot_repo.get_by_id(lot_id)
        if lot is None:
            raise NotFoundError("Lot", lot_id)
        docs = await self.doc_repo.get_by_lot(lot_id)
        return [_doc_to_response(d) for d in docs]

    async def get_document_file(
        self,
        lot_id: int,
        doc_id: int,
    ) -> tuple[bytes, str, str]:
        """Return (content_bytes, content_type, filename) for download.

        Raises:
            NotFoundError: Document not found or belongs to a different lot.
        """
        doc = await self.doc_repo.get_by_id(doc_id)
        if doc is None or doc.lot_id != lot_id:
            raise NotFoundError("Document", doc_id)

        content = get_storage_client().download_bytes(
            bucket=settings.SUPABASE_DOCUMENTS_BUCKET,
            path=doc.file_path,
        )
        return content, doc.content_type, doc.filename

    async def delete_document(
        self,
        lot_id: int,
        doc_id: int,
        user_id: int | None = None,
        user_role: str = "commercial",
    ) -> None:
        """Delete a document record and its Supabase file.

        Raises:
            NotFoundError: Document not found or belongs to a different lot.
        """
        doc = await self.doc_repo.get_by_id(doc_id)
        if doc is None or doc.lot_id != lot_id:
            raise NotFoundError("Document", doc_id)

        try:
            get_storage_client().delete_from_bucket(
                bucket=settings.SUPABASE_DOCUMENTS_BUCKET,
                path=doc.file_path,
            )
        except Exception:  # noqa: BLE001
            # File missing in storage should not block DB cleanup
            logger.warning(
                "Supabase file deletion failed — proceeding with DB cleanup",
                doc_id=doc_id,
                path=doc.file_path,
            )

        await self.doc_repo.delete(doc_id)
        await self.session.commit()

        logger.info("Document deleted", lot_id=lot_id, doc_id=doc_id, user_id=user_id)
