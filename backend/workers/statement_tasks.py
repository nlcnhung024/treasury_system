import asyncio
import logging
from workers.celery_app import celery
from app.services.ingestion_service import run_background_parse_task

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=3, default_retry_delay=5)
def parse_statement_file_task(self, file_id: int, storage_path: str, bank_code: str):
    """
    Background Task (Celery): Bóc tách file sao kê ngầm, chuẩn hóa và đối soát số dư 5 chế độ.
    """
    logger.info(f"[Task {self.request.id}] Bắt đầu bóc tách file ID: {file_id}, path: {storage_path}")
    try:
        asyncio.run(run_background_parse_task(file_id))
        return {
            "status": "COMPLETED",
            "file_id": file_id,
        }
    except Exception as exc:
        logger.error(f"[Task {self.request.id}] Lỗi xử lý file {file_id}: {exc}")
        raise self.retry(exc=exc)
