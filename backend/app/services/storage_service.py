import io
import socket
import logging
from pathlib import Path
from urllib.parse import urlparse
from app.core.config import settings

logger = logging.getLogger(__name__)

LOCAL_STORAGE_ROOT = Path(__file__).resolve().parent.parent.parent / "storage"


def _is_minio_reachable() -> bool:
    try:
        endpoint = settings.MINIO_ENDPOINT
        if "://" in endpoint:
            parsed = urlparse(endpoint)
            host = parsed.hostname or "localhost"
            port = parsed.port or 9000
        elif ":" in endpoint:
            host, port_s = endpoint.split(":", 1)
            port = int(port_s)
        else:
            host, port = endpoint, 9000

        with socket.create_connection((host, port), timeout=0.25):
            return True
    except OSError:
        return False


def save_statement_bytes(storage_path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
    """
    Chế độ Lai (Hybrid Dual-Mode):
    1. Luôn lưu bản sao vật lý tại ổ đĩa cục bộ `backend/storage/...` để đảm bảo truy xuất tức thời.
    2. Nếu dịch vụ MinIO khả dụng, đồng thời đẩy lên bucket MinIO chuẩn Object Storage.
    """
    rel_path = storage_path.lstrip("/\\")
    local_target = LOCAL_STORAGE_ROOT / rel_path
    local_target.parent.mkdir(parents=True, exist_ok=True)
    local_target.write_bytes(content)

    if _is_minio_reachable():
        try:
            from minio import Minio

            client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ROOT_USER,
                secret_key=settings.MINIO_ROOT_PASSWORD,
                secure=settings.MINIO_USE_SSL,
            )
            bucket = settings.MINIO_BUCKET_NAME
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
            object_name = rel_path.replace("\\", "/")
            client.put_object(
                bucket_name=bucket,
                object_name=object_name,
                data=io.BytesIO(content),
                length=len(content),
                content_type=content_type,
            )
        except Exception as exc:
            logger.warning(f"MinIO upload fallback về Local Disk ({storage_path}): {exc}")

    return storage_path


def read_statement_bytes(storage_path: str) -> bytes:
    """
    Đọc nội dung file sao kê từ Local Disk hoặc MinIO Object Storage.
    """
    rel_path = storage_path.lstrip("/\\")
    local_target = LOCAL_STORAGE_ROOT / rel_path
    if local_target.exists():
        return local_target.read_bytes()

    if _is_minio_reachable():
        from minio import Minio

        client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD,
            secure=settings.MINIO_USE_SSL,
        )
        bucket = settings.MINIO_BUCKET_NAME
        object_name = rel_path.replace("\\", "/")
        resp = client.get_object(bucket, object_name)
        try:
            data = resp.read()
            local_target.parent.mkdir(parents=True, exist_ok=True)
            local_target.write_bytes(data)
            return data
        finally:
            resp.close()
            resp.release_conn()

    raise FileNotFoundError(f"Không tìm thấy file sao kê tại '{storage_path}'.")

