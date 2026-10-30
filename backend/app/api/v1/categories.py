from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.category_rule import Category
from app.schemas.category_rule import CategoryItem, CreateCategoryPayload

router = APIRouter(prefix="/categories", tags=["Rule Management"])


@router.get("", response_model=List[CategoryItem])
async def list_categories(category_type: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(Category).where(Category.is_active == True).order_by(Category.display_order.asc(), Category.category_id.asc())
    if category_type:
        query = query.where(Category.category_type == category_type.upper())
    res = await db.execute(query)
    cats = res.scalars().all()
    return [CategoryItem.model_validate(c) for c in cats]


@router.post("", response_model=CategoryItem, status_code=status.HTTP_201_CREATED)
async def create_category(payload: CreateCategoryPayload, db: AsyncSession = Depends(get_db)):
    cat_type = payload.category_type.upper()
    if cat_type not in ("INCOME", "EXPENSE"):
        raise HTTPException(status_code=400, detail="category_type phải là 'INCOME' hoặc 'EXPENSE'")

    existing_stmt = select(Category).where(
        Category.category_type == cat_type,
        Category.category_name == payload.category_name.strip(),
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        existing.is_active = True
        existing.color_code = payload.color_code
        existing.description = payload.description
        existing.display_order = payload.display_order
        await db.commit()
        await db.refresh(existing)
        return CategoryItem.model_validate(existing)

    new_cat = Category(
        category_type=cat_type,
        category_name=payload.category_name.strip(),
        color_code=payload.color_code,
        description=payload.description,
        display_order=payload.display_order,
        is_active=True,
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return CategoryItem.model_validate(new_cat)


@router.put("/{category_id}", response_model=CategoryItem)
async def update_category(category_id: int, payload: CreateCategoryPayload, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).where(Category.category_id == category_id)
    cat = (await db.execute(stmt)).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")

    cat.category_type = payload.category_type.upper()
    cat.category_name = payload.category_name.strip()
    cat.color_code = payload.color_code
    cat.description = payload.description
    cat.display_order = payload.display_order
    await db.commit()
    await db.refresh(cat)
    return CategoryItem.model_validate(cat)


@router.delete("/{category_id}", status_code=status.HTTP_200_OK)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).where(Category.category_id == category_id)
    cat = (await db.execute(stmt)).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")

    await db.delete(cat)
    await db.commit()
    return {"message": f"Đã xóa danh mục '{cat.category_name}'."}
