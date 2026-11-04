import re
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, desc

from app.models.credit import CreditFacility, LoanRepaymentHistory, CreditStatementFile, CreditStatementItem
from app.models.transaction import BankTransaction
from app.models.account import BankAccount
from app.models.category_rule import Category
from app.models.audit_log import AuditLog
from app.schemas.credit import (
    UnreconciledDebtTransactionItem,
    RepaymentReconcileRequest,
    RepaymentReconcileResponse,
    LoanRepaymentHistoryItem,
    RepaymentRollbackResponse,
)

logger = logging.getLogger(__name__)


def quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _parse_amount_str(val_str: str) -> Optional[Decimal]:
    """Parse chuỗi số tiền có chứa dấu phẩy hoặc chấm phân tách nghìn thành Decimal (hỗ trợ số âm)."""
    try:
        is_negative = False
        val_str = val_str.strip()
        if val_str.startswith("-"):
            is_negative = True
            val_str = val_str[1:].strip()
        clean = val_str.replace(" ", "").replace(",", "").replace(".", "").strip()
        if not clean:
            return None
        amt = Decimal(clean)
        return -amt if is_negative else amt
    except Exception:
        return None


def extract_contract_and_amounts(description: str, active_contracts: Dict[str, CreditFacility]) -> Dict[str, Any]:
    """
    Phân tích Regex để bóc tách:
    1. Số khế ước nhận nợ: CHỈ gợi ý khế ước NẾU khế ước đó có trong danh mục active_contracts (đã nạp).
       Nếu không có trong danh mục khế ước đã nạp thì trả về None (để trống).
    2. Số tiền gốc / lãi gợi ý (nếu trong nội dung diễn giải có ghi rõ).
    """
    res: Dict[str, Any] = {
        "contract_number": None,
        "loan": None,
        "principal_amount": None,
        "interest_amount": None,
        "confidence": "NONE",
    }

    desc_upper = description.upper()

    # Chuẩn hóa map khế ước để tra cứu nhanh & không phân biệt ký tự đặc biệt
    norm_active: Dict[str, CreditFacility] = {}
    for c_no, loan in active_contracts.items():
        if c_no:
            norm_active[c_no.strip().upper()] = loan
            clean_k = re.sub(r"[^A-Z0-9]", "", c_no.upper())
            if clean_k:
                norm_active[clean_k] = loan

    # 1. Thử so khớp trực tiếp với danh sách các khế ước đang có trong hệ thống
    # Ưu tiên các số khế ước dài trước để tránh khớp nhầm chuỗi con
    sorted_contracts = sorted(active_contracts.keys(), key=lambda x: len(x), reverse=True)
    for contract_no in sorted_contracts:
        c_upper = contract_no.strip().upper()
        if len(c_upper) >= 5 and c_upper in desc_upper:
            res["contract_number"] = active_contracts[contract_no].contract_number
            res["loan"] = active_contracts[contract_no]
            res["confidence"] = "HIGH"
            break

    # 2. Nếu chưa tìm thấy khế ước có sẵn, trích xuất mã tiềm năng qua Regex
    # NHƯNG CHỈ chấp nhận nếu mã đó TỒN TẠI trong active_contracts (khế ước đã nạp)!
    if not res["contract_number"]:
        cand = None
        # Mẫu 1: Dãy 12 số VietinBank (80xxxxxxxxxx)
        m_ctg = re.search(r"\b(80\d{10})\b", description)
        if m_ctg:
            cand = m_ctg.group(1)

        # Mẫu 2: MBBank LD (LDxxxxxxxxxx hoặc PDLDxxxxxxxxxx)
        if not cand:
            m_mbb = re.search(r"\b((?:PD)?LD\d{8,12})\b", desc_upper)
            if m_mbb:
                cand = m_mbb.group(1)

        # Mẫu 3: MBBank tài khoản vay dạng 040MAZS...
        if not cand:
            m_mazs = re.search(r"\b(\d{3}MAZS\d{9})\b", desc_upper)
            if m_mazs:
                cand = m_mazs.group(1)

        # Mẫu 4: Các mẫu có từ khóa 'khe uoc', 'khoan vay', 'hdtd', 'tk'
        if not cand:
            m_kw = re.search(r"(?:KHE UOC|KHOAN VAY|HDTD|TK VAY|TK)\s*[:#\-]?\s*([A-Z0-9_\-\.]{5,25})", desc_upper)
            if m_kw:
                cand = m_kw.group(1).strip()

        # Kiểm tra đối chiếu chặt chẽ với danh sách khế ước đã nạp
        if cand:
            clean_cand = re.sub(r"[^A-Z0-9]", "", cand.upper())
            matched_loan = active_contracts.get(cand) or norm_active.get(cand.upper()) or norm_active.get(clean_cand)
            if matched_loan:
                res["contract_number"] = matched_loan.contract_number
                res["loan"] = matched_loan
                res["confidence"] = "HIGH"
            else:
                # Không có trong danh sách khế ước đã nạp -> Để trống theo yêu cầu người dùng
                res["contract_number"] = None
                res["loan"] = None
                res["confidence"] = "NONE"

    # 3. Trích xuất gợi ý phân bổ Gốc / Lãi
    # Mẫu diễn giải: "So tien goc: 4,483,000,000 VND, Lai cong don: 14,001,699 VND" hoặc "Lai cong don: -888,657 VND"
    m_goc = re.search(r"(?:SO TIEN GOC|GOC)\s*[:=]?\s*([\d\.,\s]+?)(?:VND|\s*,\s*LAI|$)", desc_upper)
    m_lai = re.search(r"(?:LAI CONG DON|SO TIEN LAI|LAI)\s*[:=]?\s*(-?\s*[\d\.,\s]+?)(?:VND|\s*,\s*|$)", desc_upper)

    if m_goc:
        amt = _parse_amount_str(m_goc.group(1))
        if amt:
            res["principal_amount"] = quantize_money(amt)

    if m_lai:
        amt = _parse_amount_str(m_lai.group(1))
        if amt:
            res["interest_amount"] = quantize_money(amt)

    # Nếu chỉ có "Thu lai..." mà không có nhắc đến nợ gốc
    if "THU LAI" in desc_upper and not m_goc and not res["principal_amount"]:
        # Có thể toàn bộ giao dịch là trả lãi
        res["suggest_all_interest"] = True
    elif "TRA NO KHOAN VAY" in desc_upper and not m_lai and not res["interest_amount"]:
        # Mặc định trả gốc
        res["suggest_all_principal"] = True

    return res


class DebtReconciliationService:
    @staticmethod
    async def get_unreconciled_transactions(
        db: AsyncSession,
        bank_code: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Lấy danh sách các giao dịch chi từ sao kê ngân hàng đã phân loại là "Trả nợ"
        chưa được đối soát, kèm thông tin gợi ý khế ước bóc tách được từ Regex.
        """
        # 1. Tải danh mục các khoản vay còn hiệu lực để đối chiếu
        stmt_loans = (
            select(CreditFacility)
            .where(CreditFacility.is_active == True)
        )
        loans = (await db.execute(stmt_loans)).scalars().all()
        active_contracts: Dict[str, CreditFacility] = {l.contract_number: l for l in loans}

        # 2. Xây dựng truy vấn các giao dịch chi danh mục 'Trả nợ' chưa đối soát
        # Loại trừ các transaction_id đã tồn tại trong loan_repayment_history
        reconciled_subquery = select(LoanRepaymentHistory.transaction_id)

        stmt = (
            select(BankTransaction, BankAccount, Category)
            .join(BankAccount, BankTransaction.account_id == BankAccount.account_id)
            .outerjoin(Category, BankTransaction.category_id == Category.category_id)
            .where(
                BankTransaction.debit_amount > 0,
                or_(
                    Category.category_name == "Trả nợ",
                    Category.category_name.ilike("%trả nợ%"),
                    Category.category_name.ilike("%vay%"),
                ),
                ~BankTransaction.transaction_id.in_(reconciled_subquery)
            )
        )

        if bank_code:
            stmt = stmt.where(BankAccount.bank_code == bank_code.upper())

        if keyword:
            kw = f"%{keyword.strip()}%"
            stmt = stmt.where(
                or_(
                    BankTransaction.description.ilike(kw),
                    BankTransaction.reference_number.ilike(kw),
                    BankAccount.account_number.ilike(kw),
                )
            )

        # Sắp xếp mới nhất lên trước
        stmt = stmt.order_by(BankTransaction.transaction_date.desc(), BankTransaction.transaction_id.desc())

        # Tính tổng số lượng và tổng số tiền
        count_stmt = select(
            func.count(BankTransaction.transaction_id),
            func.coalesce(func.sum(BankTransaction.debit_amount), Decimal("0.00"))
        ).select_from(BankTransaction).outerjoin(
            Category, BankTransaction.category_id == Category.category_id
        ).join(
            BankAccount, BankTransaction.account_id == BankAccount.account_id
        ).where(
            BankTransaction.debit_amount > 0,
            or_(
                Category.category_name == "Trả nợ",
                Category.category_name.ilike("%trả nợ%"),
                Category.category_name.ilike("%vay%"),
            ),
            ~BankTransaction.transaction_id.in_(reconciled_subquery)
        )

        if bank_code:
            count_stmt = count_stmt.where(BankAccount.bank_code == bank_code.upper())
        if keyword:
            kw = f"%{keyword.strip()}%"
            count_stmt = count_stmt.where(
                or_(
                    BankTransaction.description.ilike(kw),
                    BankTransaction.reference_number.ilike(kw),
                    BankAccount.account_number.ilike(kw),
                )
            )

        count_res = await db.execute(count_stmt)
        total_count, total_amount = count_res.first() or (0, Decimal("0.00"))

        # Phân trang
        stmt = stmt.offset(offset).limit(limit)
        rows = (await db.execute(stmt)).all()

        items: List[UnreconciledDebtTransactionItem] = []
        for t, acc, cat in rows:
            parsed = extract_contract_and_amounts(t.description, active_contracts)
            matched_loan: Optional[CreditFacility] = parsed.get("loan")

            # Quyết định số tiền gợi ý
            suggested_principal = Decimal("0.00")
            suggested_interest = Decimal("0.00")

            if parsed.get("suggest_all_interest"):
                suggested_interest = t.debit_amount
                suggested_principal = Decimal("0.00")
            elif parsed.get("principal_amount") is not None and parsed.get("interest_amount") is not None:
                suggested_principal = parsed["principal_amount"]
                suggested_interest = parsed["interest_amount"]
                # Nếu tổng khác debit_amount, bảo toàn gốc và tính lại phần lãi (hỗ trợ lãi âm khi tất toán)
                if suggested_principal + suggested_interest != t.debit_amount:
                    suggested_interest = t.debit_amount - suggested_principal
            elif parsed.get("principal_amount") is not None:
                suggested_principal = parsed["principal_amount"]
                suggested_interest = t.debit_amount - suggested_principal
            elif parsed.get("interest_amount") is not None:
                suggested_interest = parsed["interest_amount"]
                suggested_principal = max(Decimal("0.00"), t.debit_amount - suggested_interest)
            else:
                # Mặc định toàn bộ là trả gốc (yêu cầu người dùng)
                suggested_principal = t.debit_amount
                suggested_interest = Decimal("0.00")

            suggested_snapshot_date = None
            suggested_snapshot_balance = None
            timing_prediction = None

            if matched_loan:
                snap_dt = matched_loan.snapshot_date
                snap_bal = matched_loan.snapshot_principal_balance
                if not snap_dt:
                    stmt_file_dt = (
                        select(CreditStatementFile.statement_date, CreditStatementItem.principal_balance)
                        .join(CreditStatementItem, CreditStatementItem.file_id == CreditStatementFile.file_id)
                        .where(CreditStatementItem.loan_id == matched_loan.loan_id)
                        .order_by(CreditStatementFile.statement_date.desc(), CreditStatementFile.file_id.desc())
                        .limit(1)
                    )
                    res_file = (await db.execute(stmt_file_dt)).first()
                    if res_file:
                        snap_dt = res_file[0]
                        snap_bal = res_file[1]

                if snap_dt:
                    suggested_snapshot_date = snap_dt
                    suggested_snapshot_balance = quantize_money(snap_bal) if snap_bal else quantize_money(matched_loan.current_principal_balance)
                    tx_d = t.transaction_date.date() if isinstance(t.transaction_date, datetime) else t.transaction_date
                    timing_prediction = "PRE_SNAPSHOT" if tx_d <= snap_dt else "POST_SNAPSHOT"

            item = UnreconciledDebtTransactionItem(
                transaction_id=t.transaction_id,
                account_id=t.account_id,
                bank_code=acc.bank_code,
                account_number=acc.account_number,
                account_holder=acc.account_holder,
                transaction_date=t.transaction_date,
                reference_number=t.reference_number,
                counter_party=t.counter_party,
                description=t.description,
                debit_amount=quantize_money(t.debit_amount),
                category_id=t.category_id,
                category_name=cat.category_name if cat else "Trả nợ",
                suggested_contract_number=parsed.get("contract_number"),
                suggested_loan_id=matched_loan.loan_id if matched_loan else None,
                suggested_bank_code=matched_loan.bank_code if matched_loan else None,
                suggested_borrower_name=matched_loan.borrower_name if matched_loan else None,
                suggested_principal_balance=quantize_money(matched_loan.current_principal_balance) if matched_loan else None,
                suggested_snapshot_date=suggested_snapshot_date,
                suggested_snapshot_balance=suggested_snapshot_balance,
                timing_prediction=timing_prediction,
                suggested_interest_rate=matched_loan.interest_rate if matched_loan else None,
                suggested_principal_amount=quantize_money(suggested_principal),
                suggested_interest_amount=quantize_money(suggested_interest),
                match_confidence=parsed.get("confidence", "NONE"),
            )
            items.append(item)

        return {
            "items": items,
            "total_count": total_count,
            "total_unreconciled_amount": quantize_money(total_amount or Decimal("0.00")),
        }

    @staticmethod
    async def reconcile_transaction(
        db: AsyncSession,
        payload: RepaymentReconcileRequest,
        actor: str = "nhung.nghiem",
    ) -> RepaymentReconcileResponse:
        """
        Thực hiện đối soát giao dịch chi trả nợ:
        - Kiểm tra tính hợp lệ: Gốc + Lãi = Tổng tiền chi; Gốc <= Dư nợ hiện tại.
        - Giảm trừ dư nợ gốc trên CreditFacility.
        - Ghi nhận vào LoanRepaymentHistory với repayment_date = transaction.transaction_date.
        - Ghi vết kiểm toán AuditLog.
        """
        # 1. Khóa và lấy thông tin giao dịch sao kê
        stmt_tx = (
            select(BankTransaction)
            .where(BankTransaction.transaction_id == payload.transaction_id)
            .with_for_update()
        )
        tx = (await db.execute(stmt_tx)).scalar_one_or_none()
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy giao dịch ID {payload.transaction_id}",
            )

        if tx.debit_amount <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Giao dịch ID {payload.transaction_id} không phải là giao dịch chi (debit_amount <= 0)",
            )

        # 2. Kiểm tra xem giao dịch đã được đối soát trước đó chưa
        stmt_check = (
            select(LoanRepaymentHistory)
            .where(LoanRepaymentHistory.transaction_id == payload.transaction_id)
        )
        existing_repay = (await db.execute(stmt_check)).scalar_one_or_none()
        if existing_repay:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Giao dịch ID {payload.transaction_id} đã được đối soát với khế ước {existing_repay.contract_number} rồi.",
            )

        # 3. Khóa và lấy thông tin khoản vay
        stmt_loan = (
            select(CreditFacility)
            .where(CreditFacility.loan_id == payload.loan_id)
            .with_for_update()
        )
        loan = (await db.execute(stmt_loan)).scalar_one_or_none()
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản vay ID {payload.loan_id}",
            )

        # 4. Kiểm tra các ràng buộc toán học & Phân loại thời điểm Pre/Post Snapshot
        principal_amt = quantize_money(payload.principal_amount)
        interest_amt = quantize_money(payload.interest_amount)
        total_tx = quantize_money(tx.debit_amount)

        if principal_amt < Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số tiền trả gốc không được là số âm.",
            )

        if quantize_money(principal_amt + interest_amt) != total_tx:
            diff = quantize_money((principal_amt + interest_amt) - total_tx)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Ràng buộc không hợp lệ: Tổng tiền trả gốc ({principal_amt:,.0f} đ) + trả lãi ({interest_amt:,.0f} đ) "
                    f"= {principal_amt + interest_amt:,.0f} đ, khác với tổng số tiền giao dịch ({total_tx:,.0f} đ). "
                    f"Chênh lệch: {diff:,.0f} đ."
                ),
            )

        tx_date = tx.transaction_date.date() if isinstance(tx.transaction_date, datetime) else tx.transaction_date
        snap_date = loan.snapshot_date
        if not snap_date:
            stmt_snap = (
                select(CreditStatementFile.statement_date, CreditStatementItem.principal_balance)
                .join(CreditStatementItem, CreditStatementItem.file_id == CreditStatementFile.file_id)
                .where(CreditStatementItem.loan_id == loan.loan_id)
                .order_by(CreditStatementFile.statement_date.desc(), CreditStatementFile.file_id.desc())
                .limit(1)
            )
            res_snap = (await db.execute(stmt_snap)).first()
            if res_snap:
                snap_date = res_snap[0]
                loan.snapshot_date = snap_date
                if not loan.snapshot_principal_balance or loan.snapshot_principal_balance == Decimal("0.00"):
                    loan.snapshot_principal_balance = quantize_money(res_snap[1])

        if payload.repayment_timing in ("PRE_SNAPSHOT", "POST_SNAPSHOT"):
            timing = payload.repayment_timing
            is_pre_snapshot = (timing == "PRE_SNAPSHOT")
        else:
            is_pre_snapshot = bool(snap_date and tx_date <= snap_date)
            timing = "PRE_SNAPSHOT" if is_pre_snapshot else "POST_SNAPSHOT"

        prev_balance = loan.current_principal_balance

        # 5. Cập nhật số dư theo phân loại thời điểm
        if is_pre_snapshot:
            # GIAO DỊCH TRƯỚC/TẠI NGÀY XUẤT FILE:
            # Khoản tiền này ngân hàng đã trừ trong quá khứ để ra số dư snapshot trên file.
            # KHÔNG giảm trừ tiếp vào current_principal_balance (chống trừ 2 lần)!
            # Dùng để hoàn nguyên Dư nợ ban đầu:
            loan.repaid_before_snapshot = quantize_money(loan.repaid_before_snapshot + principal_amt)
            loan.original_principal_balance = quantize_money(loan.original_principal_balance + principal_amt)
            loan.total_repaid_principal = quantize_money(loan.total_repaid_principal + principal_amt)
            remaining_balance = prev_balance
            loan_status_str = loan.status
        else:
            # GIAO DỊCH SAU NGÀY XUẤT FILE:
            # Giảm trừ trực tiếp vào Dư nợ hiện tại:
            if principal_amt > loan.current_principal_balance:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Số tiền trả gốc ({principal_amt:,.0f} đ) vượt quá dư nợ gốc hiện tại "
                        f"của khoản vay {loan.contract_number} ({loan.current_principal_balance:,.0f} đ)."
                    ),
                )
            loan.repaid_after_snapshot = quantize_money(loan.repaid_after_snapshot + principal_amt)
            remaining_balance = quantize_money(prev_balance - principal_amt)
            loan.current_principal_balance = remaining_balance
            loan.total_repaid_principal = quantize_money(loan.total_repaid_principal + principal_amt)

            if remaining_balance == Decimal("0.00"):
                loan.status = "SETTLED"
                loan_status_str = "SETTLED"
            else:
                loan_status_str = loan.status

        # Nếu có thanh toán lãi và khoản vay đang có số dư lãi cộng dồn
        if interest_amt > Decimal("0.00") and loan.accrued_interest > Decimal("0.00"):
            loan.accrued_interest = max(Decimal("0.00"), quantize_money(loan.accrued_interest - interest_amt))

        # 6. Tạo bản ghi lịch sử trả nợ (LoanRepaymentHistory)
        # Thời điểm trả nợ ĐÚNG BẰNG thời điểm giao dịch trên sao kê!
        history_entry = LoanRepaymentHistory(
            loan_id=loan.loan_id,
            transaction_id=tx.transaction_id,
            contract_number=loan.contract_number,
            bank_code=loan.bank_code,
            repayment_date=tx.transaction_date,  # BẢO TOÀN THỜI ĐIỂM GIAO DỊCH THỰC TẾ
            repayment_timing=timing,
            snapshot_date=snap_date,
            principal_amount=principal_amt,
            interest_amount=interest_amt,
            total_amount=total_tx,
            previous_principal_balance=prev_balance,
            remaining_principal_balance=remaining_balance,
            notes=payload.notes or f"Đối soát tự động từ giao dịch sao kê ID {tx.transaction_id} ({timing})",
            reconciled_by=actor,
        )
        db.add(history_entry)
        await db.flush()

        # 7. Ghi nhận nhật ký kiểm toán AuditLog
        audit = AuditLog(
            actor=actor,
            action="REPAYMENT_RECONCILED",
            target_entity="CREDIT_FACILITY",
            target_id=str(loan.loan_id),
            details={
                "repayment_id": history_entry.repayment_id,
                "transaction_id": tx.transaction_id,
                "contract_number": loan.contract_number,
                "bank_code": loan.bank_code,
                "repayment_date": tx.transaction_date.isoformat(),
                "repayment_timing": timing,
                "snapshot_date": snap_date.isoformat() if snap_date else None,
                "principal_amount": str(principal_amt),
                "interest_amount": str(interest_amt),
                "total_amount": str(total_tx),
                "previous_principal_balance": str(prev_balance),
                "remaining_principal_balance": str(remaining_balance),
                "original_principal_balance": str(loan.original_principal_balance),
                "status_after": loan_status_str,
            },
        )
        db.add(audit)

        await db.commit()
        await db.refresh(history_entry)

        return RepaymentReconcileResponse(
            repayment_id=history_entry.repayment_id,
            loan_id=loan.loan_id,
            transaction_id=tx.transaction_id,
            contract_number=loan.contract_number,
            bank_code=loan.bank_code,
            repayment_date=history_entry.repayment_date,
            repayment_timing=timing,
            snapshot_date=snap_date,
            principal_amount=principal_amt,
            interest_amount=interest_amt,
            total_amount=total_tx,
            previous_principal_balance=prev_balance,
            remaining_principal_balance=remaining_balance,
            original_principal_balance=loan.original_principal_balance,
            total_repaid_principal=loan.total_repaid_principal,
            loan_status=loan_status_str,
            message=(
                f"Đã đối soát thành công giao dịch {total_tx:,.0f} đ (Trả nợ trước ngày xuất file {snap_date}) cho khế ước {loan.contract_number}. "
                f"Đã hoàn nguyên Dư nợ ban đầu lên {loan.original_principal_balance:,.0f} đ và bảo toàn Dư nợ hiện tại {remaining_balance:,.0f} đ."
                if is_pre_snapshot else
                f"Đã đối soát thành công giao dịch {total_tx:,.0f} đ cho khế ước {loan.contract_number}. "
                f"Dư nợ gốc giảm từ {prev_balance:,.0f} đ còn {remaining_balance:,.0f} đ."
                + (" (Khoản vay đã được TẤT TOÁN)" if remaining_balance == Decimal("0.00") else "")
            ),
        )

    @staticmethod
    async def rollback_repayment(
        db: AsyncSession,
        repayment_id: int,
        actor: str = "nhung.nghiem",
    ) -> RepaymentRollbackResponse:
        """
        Hoàn tác (Rollback) một lần đối soát:
        - Khôi phục lại dư nợ gốc trên CreditFacility.
        - Khôi phục trạng thái ACTIVE nếu khoản vay đang SETTLED.
        - Xóa bản ghi trong LoanRepaymentHistory.
        - Ghi vết kiểm toán AuditLog.
        """
        stmt_hist = (
            select(LoanRepaymentHistory)
            .where(LoanRepaymentHistory.repayment_id == repayment_id)
            .with_for_update()
        )
        hist = (await db.execute(stmt_hist)).scalar_one_or_none()
        if not hist:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy lịch sử trả nợ ID {repayment_id}",
            )

        stmt_loan = (
            select(CreditFacility)
            .where(CreditFacility.loan_id == hist.loan_id)
            .with_for_update()
        )
        loan = (await db.execute(stmt_loan)).scalar_one_or_none()
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản vay liên kết ID {hist.loan_id}",
            )

        # Khôi phục số dư theo phân loại thời điểm của giao dịch (Pre vs Post Snapshot)
        if hist.repayment_timing == "PRE_SNAPSHOT":
            loan.repaid_before_snapshot = max(Decimal("0.00"), quantize_money(loan.repaid_before_snapshot - hist.principal_amount))
            loan.original_principal_balance = max(loan.snapshot_principal_balance, quantize_money(loan.original_principal_balance - hist.principal_amount))
            loan.total_repaid_principal = max(Decimal("0.00"), quantize_money(loan.total_repaid_principal - hist.principal_amount))
            restored_balance = loan.current_principal_balance
        else:
            loan.repaid_after_snapshot = max(Decimal("0.00"), quantize_money(loan.repaid_after_snapshot - hist.principal_amount))
            restored_balance = quantize_money(loan.current_principal_balance + hist.principal_amount)
            loan.current_principal_balance = restored_balance
            loan.total_repaid_principal = max(Decimal("0.00"), quantize_money(loan.total_repaid_principal - hist.principal_amount))

            # Khôi phục trạng thái ACTIVE nếu đã bị tất toán
            if loan.status == "SETTLED" and restored_balance > Decimal("0.00"):
                loan.status = "ACTIVE"

        # Ghi Audit Log trước khi xóa
        audit = AuditLog(
            actor=actor,
            action="REPAYMENT_ROLLBACK",
            target_entity="CREDIT_FACILITY",
            target_id=str(loan.loan_id),
            details={
                "repayment_id": repayment_id,
                "transaction_id": hist.transaction_id,
                "contract_number": hist.contract_number,
                "restored_principal_amount": str(hist.principal_amount),
                "balance_after_rollback": str(restored_balance),
            },
        )
        db.add(audit)

        # Xóa bản ghi lịch sử
        await db.delete(hist)
        await db.commit()

        return RepaymentRollbackResponse(
            repayment_id=repayment_id,
            loan_id=loan.loan_id,
            contract_number=loan.contract_number,
            restored_balance=restored_balance,
            loan_status=loan.status,
            message=f"Đã hủy đối soát thành công. Dư nợ gốc khế ước {loan.contract_number} đã được hoàn trả về {restored_balance:,.0f} đ.",
        )

    @staticmethod
    async def list_repayment_history(
        db: AsyncSession,
        loan_id: Optional[int] = None,
        bank_code: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Lấy danh sách nhật ký lịch sử các lần đối soát trả nợ.
        """
        stmt = (
            select(LoanRepaymentHistory, BankTransaction.description, BankTransaction.reference_number)
            .outerjoin(BankTransaction, LoanRepaymentHistory.transaction_id == BankTransaction.transaction_id)
        )
        count_stmt = select(func.count(LoanRepaymentHistory.repayment_id)).select_from(LoanRepaymentHistory)

        if loan_id:
            stmt = stmt.where(LoanRepaymentHistory.loan_id == loan_id)
            count_stmt = count_stmt.where(LoanRepaymentHistory.loan_id == loan_id)
        if bank_code:
            stmt = stmt.where(LoanRepaymentHistory.bank_code == bank_code.upper())
            count_stmt = count_stmt.where(LoanRepaymentHistory.bank_code == bank_code.upper())
        if keyword:
            kw = f"%{keyword.strip()}%"
            kw_filter = or_(
                LoanRepaymentHistory.contract_number.ilike(kw),
                LoanRepaymentHistory.notes.ilike(kw),
                BankTransaction.description.ilike(kw),
                BankTransaction.reference_number.ilike(kw),
            )
            stmt = stmt.where(kw_filter)
            count_stmt = count_stmt.outerjoin(
                BankTransaction, LoanRepaymentHistory.transaction_id == BankTransaction.transaction_id
            ).where(kw_filter)

        total_count = (await db.execute(count_stmt)).scalar() or 0

        stmt = stmt.order_by(LoanRepaymentHistory.repayment_date.desc(), LoanRepaymentHistory.repayment_id.desc())
        stmt = stmt.offset(offset).limit(limit)

        rows = (await db.execute(stmt)).all()

        items: List[LoanRepaymentHistoryItem] = []
        for hist, desc, ref_no in rows:
            items.append(LoanRepaymentHistoryItem(
                repayment_id=hist.repayment_id,
                loan_id=hist.loan_id,
                transaction_id=hist.transaction_id,
                contract_number=hist.contract_number,
                bank_code=hist.bank_code,
                repayment_date=hist.repayment_date,
                repayment_timing=hist.repayment_timing or "POST_SNAPSHOT",
                snapshot_date=hist.snapshot_date,
                principal_amount=quantize_money(hist.principal_amount),
                interest_amount=quantize_money(hist.interest_amount),
                total_amount=quantize_money(hist.total_amount),
                previous_principal_balance=quantize_money(hist.previous_principal_balance),
                remaining_principal_balance=quantize_money(hist.remaining_principal_balance),
                notes=hist.notes,
                reconciled_by=hist.reconciled_by,
                created_at=hist.created_at,
                transaction_description=desc,
                reference_number=ref_no,
            ))

        return {
            "items": items,
            "total_count": total_count,
        }
