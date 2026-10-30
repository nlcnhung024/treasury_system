from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.common import PaginationMeta
from pydantic import BaseModel

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

class AuditLogItem(BaseModel):
    log_id: int
    correlation_id: UUID
    actor: str
    action: str
    target_entity: str
    target_id: str
    details: Optional[dict] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True

@router.get("", response_model=dict)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at)).offset((page - 1) * limit).limit(limit)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    return {
        "data": [AuditLogItem.model_validate(l) for l in logs],
        "pagination": PaginationMeta(current_page=page, page_size=limit, total_records=len(logs), total_pages=1)
    }

