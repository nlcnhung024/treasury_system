from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.category_rule import Category
from app.schemas.category_rule import CategoryItem, CreateCategoryPayload

router = APIRouter(prefix="/categories", tags=["Rule Management"])

@router.get("", response_model=List[CategoryItem])
async def list_categories(category_type: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(Category).where(Category.is_active == True)
    if category_type:
        query = query.where(Category.category_type == category_type)
    res = await db.execute(query)
    cats = res.scalars().all()
    return [CategoryItem.model_validate(c) for c in cats]

@router.post("", response_model=CategoryItem, status_code=status.HTTP_201_CREATED)
async def create_category(payload: CreateCategoryPayload, db: AsyncSession = Depends(get_db)):
    new_cat = Category(
        category_type=payload.category_type,
        category_name=payload.category_name,
        color_code=payload.color_code,
        description=payload.description,
        display_order=payload.display_order
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return CategoryItem.model_validate(new_cat)

