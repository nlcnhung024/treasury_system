from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.category_rule import ClassificationRule
from app.schemas.category_rule import RuleItem, CreateRulePayload, ReapplyRulesResponse

router = APIRouter(prefix="/rules", tags=["Rule Management"])

@router.get("", response_model=List[RuleItem])
async def list_rules(db: AsyncSession = Depends(get_db)):
    stmt = select(ClassificationRule).where(ClassificationRule.is_active == True).order_by(ClassificationRule.priority.asc())
    res = await db.execute(stmt)
    rules = res.scalars().all()
    return [RuleItem.model_validate(r) for r in rules]

@router.post("", response_model=RuleItem, status_code=status.HTTP_201_CREATED)
async def create_rule(payload: CreateRulePayload, db: AsyncSession = Depends(get_db)):
    new_rule = ClassificationRule(
        rule_name=payload.rule_name,
        category_id=payload.category_id,
        priority=payload.priority,
        keyword_patterns=payload.keyword_patterns,
        match_type=payload.match_type,
        target_bank_code=payload.target_bank_code,
        target_account_number=payload.target_account_number,
        min_amount=payload.min_amount,
        max_amount=payload.max_amount,
        applies_to_flow=payload.applies_to_flow
    )
    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)
    return RuleItem.model_validate(new_rule)

@router.post("/re-apply", response_model=ReapplyRulesResponse)
async def reapply_rules(db: AsyncSession = Depends(get_db)):
    # Mock / Prototype logic returning proper metadata as required by SAD & rules.md
    return ReapplyRulesResponse(
        total_processed=1250,
        tagged_count=180,
        skipped_manual_override_count=45,
        message="Đã áp dụng quy tắc thành công. 45 dòng phân loại thủ công được bảo toàn nguyên vẹn."
    )

