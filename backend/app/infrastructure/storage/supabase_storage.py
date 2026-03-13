"""Supabase Storage client for file management."""

import logging
from pathlib import Path
from typing import BinaryIO

from supabase import Client, create_client

from app.core.config import settings
from app.core.exceptions import StorageError

logger = logging.getLogger(__name__)


class SupabaseStorageClient:
    """Client for interacting with Supabase Storage (S3).

    Manages file uploads, downloads, and deletions in Supabase Storage buckets.
    """

    def __init__(self):
        """Initialize Supabase Storage client."""
        if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment variables"
            )

        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SECRET_KEY,
        )
        self.bucket_name = settings.SUPABASE_STORAGE_BUCKET
        logger.info(f"Initialized Supabase Storage client for bucket: {self.bucket_name}")

    def ensure_bucket_exists(self) -> None:
        """Create the storage bucket if it doesn't exist.

        Raises:
            StorageError: If bucket creation fails.
        """
        try:
            # List all buckets
            buckets = self.client.storage.list_buckets()
            bucket_names = [bucket.name for bucket in buckets]

            if self.bucket_name not in bucket_names:
                # Create bucket with public access
                self.client.storage.create_bucket(
                    self.bucket_name,
                    options={"public": False}  # Private bucket for security
                )
                logger.info(f"Created storage bucket: {self.bucket_name}")
            else:
                logger.debug(f"Bucket {self.bucket_name} already exists")

        except Exception as e:
            logger.error(f"Failed to ensure bucket exists: {e}")
            raise StorageError(f"Failed to ensure bucket exists: {e}")

    def upload_file(
        self,
        file_path: str,
        file_content: bytes | BinaryIO,
        content_type: str = "application/geo+json",
    ) -> str:
        """Upload a file to Supabase Storage.

        Args:
            file_path: Path within the bucket (e.g., "projects/123/data.geojson")
            file_content: File content as bytes or file-like object
            content_type: MIME type of the file

        Returns:
            Public URL of the uploaded file

        Raises:
            StorageError: If upload fails
        """
        try:
            # Ensure bucket exists
            self.ensure_bucket_exists()

            # Upload file
            response = self.client.storage.from_(self.bucket_name).upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": content_type, "upsert": "true"},
            )

            # Get public URL (for private buckets, use signed URL)
            public_url = self.get_file_url(file_path)

            logger.info(f"Uploaded file to {file_path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload file {file_path}: {e}")
            raise StorageError(f"Failed to upload file: {e}")

    def get_file_url(self, file_path: str, expires_in: int = 3600) -> str:
        """Get a signed URL for a file.

        Args:
            file_path: Path within the bucket
            expires_in: URL expiration time in seconds (default: 1 hour)

        Returns:
            Signed URL to access the file

        Raises:
            StorageError: If URL generation fails
        """
        try:
            # For private buckets, create signed URL
            signed_url = self.client.storage.from_(self.bucket_name).create_signed_url(
                path=file_path,
                expires_in=expires_in,
            )

            return signed_url.get("signedURL", "")

        except Exception as e:
            logger.error(f"Failed to get signed URL for {file_path}: {e}")
            raise StorageError(f"Failed to get signed URL: {e}")

    def download_file(self, file_path: str) -> bytes:
        """Download a file from Supabase Storage.

        Args:
            file_path: Path within the bucket

        Returns:
            File content as bytes

        Raises:
            StorageError: If download fails
        """
        try:
            response = self.client.storage.from_(self.bucket_name).download(file_path)
            logger.info(f"Downloaded file from {file_path}")
            return response

        except Exception as e:
            logger.error(f"Failed to download file {file_path}: {e}")
            raise StorageError(f"Failed to download file: {e}")

    def delete_file(self, file_path: str) -> None:
        """Delete a file from Supabase Storage.

        Args:
            file_path: Path within the bucket

        Raises:
            StorageError: If deletion fails
        """
        try:
            self.client.storage.from_(self.bucket_name).remove([file_path])
            logger.info(f"Deleted file {file_path}")

        except Exception as e:
            logger.error(f"Failed to delete file {file_path}: {e}")
            raise StorageError(f"Failed to delete file: {e}")

    def upload_image(
        self,
        file_path: str,
        file_content: bytes,
        content_type: str = "image/jpeg",
    ) -> str:
        """Upload an image to the public images bucket.

        Uses a separate public bucket so images get stable public URLs
        (no expiry, unlike signed URLs used for GeoJSON).

        Args:
            file_path: Path within the bucket (e.g., "projects/3/cover.jpg")
            file_content: Raw image bytes
            content_type: MIME type of the image

        Returns:
            Permanent public URL of the uploaded image

        Raises:
            StorageError: If upload fails
        """
        images_bucket = settings.SUPABASE_IMAGES_BUCKET
        try:
            # Ensure the images bucket exists and is public
            buckets = self.client.storage.list_buckets()
            bucket_names = [b.name for b in buckets]
            if images_bucket not in bucket_names:
                self.client.storage.create_bucket(
                    images_bucket,
                    options={"public": True},
                )
                logger.info(f"Created public images bucket: {images_bucket}")

            self.client.storage.from_(images_bucket).upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": content_type, "upsert": "true"},
            )

            # Use SUPABASE_PUBLIC_URL (or SUPABASE_URL as fallback) so the
            # generated link is accessible from the browser even when the
            # backend runs inside Docker with an internal hostname.
            base = settings.supabase_public_base_url
            public_url = f"{base}/storage/v1/object/public/{images_bucket}/{file_path}"
            logger.info(f"Uploaded image to {file_path}: {public_url}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload image {file_path}: {e}")
            raise StorageError(f"Failed to upload image: {e}")

    def delete_image(self, file_path: str) -> None:
        """Delete an image from the public images bucket.

        Args:
            file_path: Path within the images bucket

        Raises:
            StorageError: If deletion fails
        """
        try:
            self.client.storage.from_(settings.SUPABASE_IMAGES_BUCKET).remove([file_path])
            logger.info(f"Deleted image {file_path}")
        except Exception as e:
            logger.error(f"Failed to delete image {file_path}: {e}")
            raise StorageError(f"Failed to delete image: {e}")

    def list_files(self, folder_path: str = "") -> list[dict]:
        """List files in a folder.

        Args:
            folder_path: Folder path within the bucket (empty for root)

        Returns:
            List of file metadata dictionaries

        Raises:
            StorageError: If listing fails
        """
        try:
            files = self.client.storage.from_(self.bucket_name).list(folder_path)
            return files

        except Exception as e:
            logger.error(f"Failed to list files in {folder_path}: {e}")
            raise StorageError(f"Failed to list files: {e}")


# Global storage client instance
_storage_client: SupabaseStorageClient | None = None


def get_storage_client() -> SupabaseStorageClient:
    """Get or create the global Supabase Storage client instance.

    Returns:
        SupabaseStorageClient instance
    """
    global _storage_client
    if _storage_client is None:
        _storage_client = SupabaseStorageClient()
    return _storage_client
