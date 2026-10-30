import re
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category_rule import ClassificationRule
from app.models.transaction import BankTransaction
from app.models.account import BankAccount


def match_rule(
    rule: ClassificationRule,
    description: str,
    debit_amount: Decimal,
    credit_amount: Decimal,
    bank_code: str,
    account_number: str,
) -> bool:
    """
    Kiểm tra một giao dịch có thỏa mãn tổ hợp điều kiện đa trường (AND/OR) của ClassificationRule hay không.
    """
    if not rule.is_active:
        return False

    # 1. Kiểm tra luồng tiền (applies_to_flow: ALL, DEBIT, CREDIT)
    flow = (rule.applies_to_flow or "ALL").upper()
    if flow == "DEBIT" and debit_amount <= Decimal("0.00"):
        return False
    if flow == "CREDIT" and credit_amount <= Decimal("0.00"):
        return False

    # 2. Kiểm tra ngân hàng đích (target_bank_code)
    if rule.target_bank_code and rule.target_bank_code.strip():
        if rule.target_bank_code.strip().upper() != (bank_code or "").upper():
            return False

    # 3. Kiểm tra số tài khoản đích (target_account_number)
    if rule.target_account_number and rule.target_account_number.strip():
        if rule.target_account_number.strip() != (account_number or "").strip():
            return False

    # 4. Kiểm tra ngưỡng số tiền (min_amount, max_amount)
    tx_amount = debit_amount if debit_amount > Decimal("0.00") else credit_amount
    if rule.min_amount is not None and tx_amount < rule.min_amount:
        return False
    if rule.max_amount is not None and tx_amount > rule.max_amount:
        return False

    # 5. Kiểm tra từ khóa (keyword_patterns & match_type: CONTAINS, EXACT, REGEX)
    desc_text = description or ""
    match_type = (rule.match_type or "CONTAINS").upper()
    raw_patterns = rule.keyword_patterns or ""

    if match_type == "REGEX":
        try:
            return bool(re.search(raw_patterns, desc_text, flags=re.IGNORECASE))
        except re.error:
            return False

    keywords = [k.strip() for k in raw_patterns.split(",") if k.strip()]
    if not keywords:
        return False

    desc_upper = desc_text.upper()
    if match_type == "EXACT":
        return any(desc_upper == kw.upper() for kw in keywords)
    else:  # CONTAINS
        return any(kw.upper() in desc_upper for kw in keywords)


def find_matching_rule(
    rules: List[ClassificationRule],
    description: str,
    debit_amount: Decimal,
    credit_amount: Decimal,
    bank_code: str,
    account_number: str,
) -> Optional[ClassificationRule]:
    """
    Duyệt danh sách quy tắc đã sắp xếp theo priority ASC và trả về quy tắc khớp đầu tiên.
    """
    for rule in rules:
        if match_rule(
            rule=rule,
            description=description,
            debit_amount=debit_amount,
            credit_amount=credit_amount,
            bank_code=bank_code,
            account_number=account_number,
        ):
            return rule
    return None


async def reapply_all_rules(db: AsyncSession) -> Tuple[int, int, int]:
    """
    Chạy lại toàn bộ quy tắc đang hoạt động lên lịch sử giao dịch.
    TUYỆT ĐỐI BẢO VỆ các dòng có is_manual_override == True.
    Trả về: (total_processed, tagged_count, skipped_manual_override_count)
    """
    rule_stmt = (
        select(ClassificationRule)
        .where(ClassificationRule.is_active == True)
        .order_by(ClassificationRule.priority.asc(), ClassificationRule.rule_id.asc())
    )
    rule_res = await db.execute(rule_stmt)
    active_rules = list(rule_res.scalars().all())

    tx_stmt = select(BankTransaction).options(selectinload(BankTransaction.account))
    tx_res = await db.execute(tx_stmt)
    all_txs = list(tx_res.scalars().all())

    total_processed = len(all_txs)
    tagged_count = 0
    skipped_manual = 0

    for tx in all_txs:
        if tx.is_manual_override:
            skipped_manual += 1
            continue

        acc: Optional[BankAccount] = tx.account
        b_code = acc.bank_code if acc else ""
        acc_no = acc.account_number if acc else ""

        matched = find_matching_rule(
            rules=active_rules,
            description=tx.description,
            debit_amount=tx.debit_amount,
            credit_amount=tx.credit_amount,
            bank_code=b_code,
            account_number=acc_no,
        )
        if matched:
            tx.category_id = matched.category_id
            tx.applied_rule_id = matched.rule_id
            tagged_count += 1
        else:
            tx.category_id = None
            tx.applied_rule_id = None

    await db.commit()
    return total_processed, tagged_count, skipped_manual

