from celery import Celery
from app.core.config import settings

celery = Celery(
    "bsp_workers",
    broker=settings.get_celery_broker_url(),
    backend=settings.get_celery_result_backend(),
    include=["workers.statement_tasks"]
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=180, # Giới hạn tối đa 3 phút
    worker_prefetch_multiplier=1, # Đảm bảo fair dispatch cho file lớn
    task_acks_late=True, # Đảm bảo tính Idempotent khi worker restart
)

