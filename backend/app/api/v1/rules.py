from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.category_rule import ClassificationRule, Category
from app.schemas.category_rule import RuleItem, CreateRulePayload, ReapplyRulesResponse
from app.services.rule_engine import reapply_all_rules

router = APIRouter(prefix="/rules", tags=["Rule Management"])


def _serialize_rule(r: ClassificationRule) -> RuleItem:
    cat = r.category
    return RuleItem(
        rule_id=r.rule_id,
        category_id=r.category_id,
        category_name=cat.category_name if cat else None,
        category_type=cat.category_type if cat else None,
        rule_name=r.rule_name,
        priority=r.priority,
        keyword_patterns=r.keyword_patterns,
        match_type=r.match_type,
        target_bank_code=r.target_bank_code,
        target_account_number=r.target_account_number,
        min_amount=r.min_amount,
        max_amount=r.max_amount,
        applies_to_flow=r.applies_to_flow,
        is_active=r.is_active,
    )


@router.get("", response_model=List[RuleItem])
async def list_rules(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(ClassificationRule)
        .options(selectinload(ClassificationRule.category))
        .where(ClassificationRule.is_active == True)
        .order_by(ClassificationRule.priority.asc(), ClassificationRule.rule_id.asc())
    )
    res = await db.execute(stmt)
    rules = res.scalars().all()
    return [_serialize_rule(r) for r in rules]


@router.post("", response_model=RuleItem, status_code=status.HTTP_201_CREATED)
async def create_rule(payload: CreateRulePayload, db: AsyncSession = Depends(get_db)):
    cat_stmt = select(Category).where(Category.category_id == payload.category_id)
    cat = (await db.execute(cat_stmt)).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Danh mục (category_id) không tồn tại.")

    new_rule = ClassificationRule(
        rule_name=payload.rule_name.strip(),
        category_id=payload.category_id,
        priority=payload.priority,
        keyword_patterns=payload.keyword_patterns.strip(),
        match_type=payload.match_type.upper(),
        target_bank_code=payload.target_bank_code.strip().upper() if payload.target_bank_code else None,
        target_account_number=payload.target_account_number.strip() if payload.target_account_number else None,
        min_amount=payload.min_amount,
        max_amount=payload.max_amount,
        applies_to_flow=payload.applies_to_flow.upper(),
        is_active=True,
    )
    db.add(new_rule)
    await db.commit()

    stmt = (
        select(ClassificationRule)
        .options(selectinload(ClassificationRule.category))
        .where(ClassificationRule.rule_id == new_rule.rule_id)
    )
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_rule(refreshed)


@router.put("/{rule_id}", response_model=RuleItem)
async def update_rule(rule_id: int, payload: CreateRulePayload, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(ClassificationRule)
        .options(selectinload(ClassificationRule.category))
        .where(ClassificationRule.rule_id == rule_id)
    )
    rule = (await db.execute(stmt)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Không tìm thấy quy tắc phân loại")

    rule.rule_name = payload.rule_name.strip()
    rule.category_id = payload.category_id
    rule.priority = payload.priority
    rule.keyword_patterns = payload.keyword_patterns.strip()
    rule.match_type = payload.match_type.upper()
    rule.target_bank_code = payload.target_bank_code.strip().upper() if payload.target_bank_code else None
    rule.target_account_number = payload.target_account_number.strip() if payload.target_account_number else None
    rule.min_amount = payload.min_amount
    rule.max_amount = payload.max_amount
    rule.applies_to_flow = payload.applies_to_flow.upper()

    await db.commit()
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_rule(refreshed)


@router.delete("/{rule_id}", status_code=status.HTTP_200_OK)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(ClassificationRule).where(ClassificationRule.rule_id == rule_id)
    rule = (await db.execute(stmt)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Không tìm thấy quy tắc phân loại")

    await db.delete(rule)
    await db.commit()
    return {"message": f"Đã xóa quy tắc '{rule.rule_name}'."}


@router.post("/re-apply", response_model=ReapplyRulesResponse)
async def reapply_rules(db: AsyncSession = Depends(get_db)):
    total_processed, tagged_count, skipped_manual = await reapply_all_rules(db)
    return ReapplyRulesResponse(
        total_processed=total_processed,
        tagged_count=tagged_count,
        skipped_manual_override_count=skipped_manual,
        message=(
            f"Đã chạy lại quy tắc trên {total_processed} giao dịch: "
            f"Gán nhãn tự động {tagged_count} dòng, bảo vệ nguyên vẹn {skipped_manual} dòng phân loại thủ công."
        ),
    )
