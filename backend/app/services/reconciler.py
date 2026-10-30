from dataclasses import dataclass
from decimal import Decimal
from typing import List, Optional, Dict, Any
from app.services.cleansing_service import generate_dedup_hash, TWO_PLACES


@dataclass
class ReconciliationResult:
    reconciliation_mode: str
    reconciliation_status: str  # "BALANCED" | "DISCREPANCY"
    header_opening_balance: Optional[Decimal]
    header_closing_balance: Optional[Decimal]
    calculated_closing_balance: Decimal
    total_debit_amount: Decimal
    total_credit_amount: Decimal
    total_transactions_count: int
    discrepancy_amount: Decimal
    details_note: str


def reconcile_statement(
    reconciliation_mode: str,
    account_number: str,
    transactions: List[Dict[str, Any]],
    metadata: Dict[str, Any],
    account_opening_balance: Decimal = Decimal("0.00"),
) -> ReconciliationResult:
    """
    Thực thi đối soát kế toán 5 chế độ (MODE_1 -> MODE_5) theo chuẩn Bank_Mapping_Matrix.md.
    Đồng thời nội suy running_balance cho các mẫu khuyết cột Số dư (MODE_3, MODE_4)
    và sinh mã băm chống trùng 6 thành phần (dedup_hash) cho từng giao dịch.
    """
    sum_debit = sum((tx["debit_amount"] for tx in transactions), Decimal("0.00")).quantize(TWO_PLACES)
    sum_credit = sum((tx["credit_amount"] for tx in transactions), Decimal("0.00")).quantize(TWO_PLACES)
    tx_count = len(transactions)

    header_opening: Optional[Decimal] = metadata.get("opening_balance")
    header_closing: Optional[Decimal] = metadata.get("closing_balance")
    reported_total_debit: Optional[Decimal] = metadata.get("total_debit")
    reported_total_credit: Optional[Decimal] = metadata.get("total_credit")

    discrepancy = Decimal("0.00")
    details_note = ""

    if reconciliation_mode == "MODE_1_FULL_HEADER_FOOTER":
        opening = header_opening if header_opening is not None else Decimal("0.00")
        closing = header_closing if header_closing is not None else Decimal("0.00")
        calc_closing = (opening + sum_credit - sum_debit).quantize(TWO_PLACES)
        discrepancy = abs(closing - calc_closing).quantize(TWO_PLACES)
        if reported_total_debit is not None:
            discrepancy += abs(reported_total_debit - sum_debit).quantize(TWO_PLACES)
        if reported_total_credit is not None:
            discrepancy += abs(reported_total_credit - sum_credit).quantize(TWO_PLACES)
        details_note = "Đối soát đầy đủ Số dư Đầu kỳ, Tổng Nợ/Có và Số dư Cuối kỳ trên Header/Footer."

    elif reconciliation_mode == "MODE_2_INFERRED_OPENING_CLOSING":
        # Giao dịch sắp xếp từ mới nhất (index 0) đến cũ nhất (index -1)
        if transactions:
            oldest = transactions[-1]
            newest = transactions[0]
            header_opening = (
                oldest["running_balance"] - oldest["credit_amount"] + oldest["debit_amount"]
            ).quantize(TWO_PLACES)
            header_closing = newest["running_balance"].quantize(TWO_PLACES)
        else:
            header_opening = Decimal("0.00")
            header_closing = Decimal("0.00")

        calc_closing = (header_opening + sum_credit - sum_debit).quantize(TWO_PLACES)
        discrepancy = abs(header_closing - calc_closing).quantize(TWO_PLACES)
        if reported_total_debit is not None:
            discrepancy += abs(reported_total_debit - sum_debit).quantize(TWO_PLACES)
        if reported_total_credit is not None:
            discrepancy += abs(reported_total_credit - sum_credit).quantize(TWO_PLACES)
        details_note = "Nội suy Số dư ĐK từ dòng cũ nhất và Số dư CK từ dòng mới nhất, đối chiếu khớp dòng TỔNG TIỀN."

    elif reconciliation_mode == "MODE_3_DERIVED_RUNNING_BALANCE":
        # SHB: Có Opening/Closing ở Header nhưng bảng giao dịch không có cột Số dư lũy kế
        opening = header_opening if header_opening is not None else Decimal("0.00")
        closing = header_closing if header_closing is not None else Decimal("0.00")

        curr_bal = opening
        # Duyệt ngược từ dòng cũ nhất (index -1) lên dòng mới nhất (index 0)
        for tx in reversed(transactions):
            curr_bal = (curr_bal + tx["credit_amount"] - tx["debit_amount"]).quantize(TWO_PLACES)
            tx["running_balance"] = curr_bal

        calc_closing = curr_bal.quantize(TWO_PLACES)
        discrepancy = abs(closing - calc_closing).quantize(TWO_PLACES)
        if reported_total_debit is not None:
            discrepancy += abs(reported_total_debit - sum_debit).quantize(TWO_PLACES)
        if reported_total_credit is not None:
            discrepancy += abs(reported_total_credit - sum_credit).quantize(TWO_PLACES)
        details_note = "Nội suy lũy kế ngược running_balance từ Opening Balance trên Header khớp 100% với Closing Balance."

    elif reconciliation_mode == "MODE_4_TOTAL_FLOW_ONLY":
        # MBB Personal: Không có Opening/Closing trên file, chỉ có Tổng phát sinh Nợ/Có ở Footer
        curr_bal = account_opening_balance.quantize(TWO_PLACES)
        for tx in reversed(transactions):
            curr_bal = (curr_bal + tx["credit_amount"] - tx["debit_amount"]).quantize(TWO_PLACES)
            tx["running_balance"] = curr_bal

        calc_closing = curr_bal.quantize(TWO_PLACES)
        if reported_total_debit is not None:
            discrepancy += abs(reported_total_debit - sum_debit).quantize(TWO_PLACES)
        if reported_total_credit is not None:
            discrepancy += abs(reported_total_credit - sum_credit).quantize(TWO_PLACES)
        details_note = "Đối soát tổng phát sinh Nợ/Có toàn kỳ với dòng Footer và nội suy running_balance từ số dư tài khoản."

    elif reconciliation_mode == "MODE_5_CUTOFF_INTEREST_INCLUDED":
        # VPBank: Bút toán trả lãi đầu kỳ (oldest row) đã được cộng sẵn vào Opening Balance trên Header
        opening = header_opening if header_opening is not None else Decimal("0.00")
        closing = header_closing if header_closing is not None else Decimal("0.00")

        effective_opening = opening
        if transactions:
            oldest = transactions[-1]
            if oldest.get("running_balance") == opening:
                effective_opening = (opening - oldest["credit_amount"] + oldest["debit_amount"]).quantize(TWO_PLACES)

        calc_closing = (effective_opening + sum_credit - sum_debit).quantize(TWO_PLACES)
        discrepancy = abs(closing - calc_closing).quantize(TWO_PLACES)
        if reported_total_debit is not None:
            discrepancy += abs(reported_total_debit - sum_debit).quantize(TWO_PLACES)
        if reported_total_credit is not None:
            discrepancy += abs(reported_total_credit - sum_credit).quantize(TWO_PLACES)
        details_note = "Đối soát có hiệu chỉnh bút toán trả lãi đầu kỳ đã gộp sẵn trong Opening Balance (Cutoff Interest)."

    else:
        opening = header_opening if header_opening is not None else Decimal("0.00")
        closing = header_closing if header_closing is not None else Decimal("0.00")
        calc_closing = (opening + sum_credit - sum_debit).quantize(TWO_PLACES)
        discrepancy = abs(closing - calc_closing).quantize(TWO_PLACES) if header_closing is not None else Decimal("0.00")
        details_note = f"Chế độ đối soát mặc định ({reconciliation_mode})."

    # Sinh mã băm chống trùng 6 thành phần cho toàn bộ giao dịch sau khi running_balance đã hoàn tất
    for tx in transactions:
        tx["dedup_hash"] = generate_dedup_hash(
            account_number=account_number,
            transaction_date=tx["transaction_date"],
            debit_amount=tx["debit_amount"],
            credit_amount=tx["credit_amount"],
            reference_number=tx.get("reference_number"),
            running_balance=tx["running_balance"],
        )

    status = "BALANCED" if discrepancy == Decimal("0.00") else "DISCREPANCY"

    return ReconciliationResult(
        reconciliation_mode=reconciliation_mode,
        reconciliation_status=status,
        header_opening_balance=header_opening,
        header_closing_balance=header_closing,
        calculated_closing_balance=calc_closing,
        total_debit_amount=sum_debit,
        total_credit_amount=sum_credit,
        total_transactions_count=tx_count,
        discrepancy_amount=discrepancy,
        details_note=details_note,
    )

