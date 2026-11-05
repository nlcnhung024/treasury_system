import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.models.corporate_entity import CorporateEntity
from app.schemas.corporate_entity import CorporateEntityCreate, CorporateEntityResponse

router = APIRouter(prefix="/corporate-entities", tags=["Corporate Entities"])


def slugify_code(text: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9]+', '_', text.upper()).strip('_')
    return cleaned[:40] or "ENTITY"


@router.get("", response_model=List[CorporateEntityResponse])
async def list_corporate_entities(db: AsyncSession = Depends(get_db)):
    """Lấy danh sách các pháp nhân và cá nhân thuộc hệ sinh thái."""
    query = (
        select(CorporateEntity)
        .where(CorporateEntity.is_active == True)
        .order_by(CorporateEntity.is_holding_parent.desc(), CorporateEntity.entity_id.asc())
    )
    res = await db.execute(query)
    entities = res.scalars().all()
    return [CorporateEntityResponse.model_validate(e) for e in entities]


@router.post("", response_model=CorporateEntityResponse, status_code=status.HTTP_201_CREATED)
async def create_corporate_entity(payload: CorporateEntityCreate, db: AsyncSession = Depends(get_db)):
    """Tạo mới một pháp nhân hoặc cá nhân thuộc hệ sinh thái."""
    company_name = payload.company_name.strip()
    short_name = payload.short_name.strip()
    tax_code = payload.tax_code.strip() if payload.tax_code else None

    # Tạo entity_code nếu chưa có
    if payload.entity_code and payload.entity_code.strip():
        code = slugify_code(payload.entity_code)
    else:
        code = slugify_code(short_name)

    # Kiểm tra trùng code hoặc tên
    existing_query = select(CorporateEntity).where(
        or_(
            CorporateEntity.entity_code == code,
            CorporateEntity.company_name == company_name
        )
    )
    existing = (await db.execute(existing_query)).scalar_one_or_none()
    if existing:
        # Nếu đã tồn tại nhưng bị deactive, active lại
        if not existing.is_active:
            existing.is_active = True
            existing.short_name = short_name
            existing.tax_code = tax_code
            existing.entity_type = payload.entity_type
            existing.description = payload.description
            existing.badge_label = payload.badge_label or existing.badge_label
            existing.color_class = payload.color_class or existing.color_class
            await db.commit()
            await db.refresh(existing)
            return CorporateEntityResponse.model_validate(existing)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Thực thể với mã '{code}' hoặc tên '{company_name}' đã tồn tại trong hệ thống."
        )

    # Set badge_label & color_class phù hợp nếu chưa có
    badge_label = payload.badge_label
    color_class = payload.color_class
    if not badge_label:
        badge_label = "Ủy quyền CEO" if payload.entity_type == "SPECIAL_CASH" else "Thành viên"
    if not color_class:
        if payload.entity_type == "SPECIAL_CASH":
            color_class = "bg-purple-50 text-purple-700 border-purple-200"
        elif payload.is_holding_parent:
            color_class = "bg-indigo-50 text-indigo-700 border-indigo-200"
        else:
            color_class = "bg-emerald-50 text-emerald-700 border-emerald-200"

    new_entity = CorporateEntity(
        entity_code=code,
        company_name=company_name,
        short_name=short_name,
        tax_code=tax_code,
        entity_type=payload.entity_type,
        is_holding_parent=payload.is_holding_parent,
        description=payload.description,
        badge_label=badge_label,
        color_class=color_class,
        is_active=True
    )
    db.add(new_entity)
    await db.commit()
    await db.refresh(new_entity)
    return CorporateEntityResponse.model_validate(new_entity)
