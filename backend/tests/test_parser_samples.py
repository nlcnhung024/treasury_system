from decimal import Decimal
from pathlib import Path
import pytest
from app.services.parser.universal_stream_parser import parse_statement_file

SAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "Resources" / "Samples_sao_ke"


@pytest.mark.parametrize(
    "filename,expected_template,expected_bank,expected_account,expected_rows,expected_mode",
    [
        (
            "Bang ket qua giao dich - 111386888 (2).xlsx",
            "MBB_CORP_XLSX",
            "MBB",
            "111386888",
            125,
            "MODE_1_FULL_HEADER_FOOTER",
        ),
        (
            "transaction_history 2.xlsx",
            "MBB_PERSONAL_XLSX",
            "MBB",
            "0869596789",
            207,
            "MODE_4_TOTAL_FLOW_ONLY",
        ),
        (
            "Bang ket qua giao dich - 86528888 2.xlsx",
            "MBV_CORP_XLSX",
            "MBV",
            "86528888",
            20,
            "MODE_2_INFERRED_OPENING_CLOSING",
        ),
        (
            "Saoketaikhoan_VPBank_446637355_20261026152303.xlsx",
            "VPB_CORP_XLSX",
            "VPB",
            "446637355",
            5,
            "MODE_5_CUTOFF_INTEREST_INCLUDED",
        ),
        (
            "TPBANK_HISTORY79868686889_27102026_135144876.xlsx",
            "TPB_CORP_XLSX",
            "TPB",
            "79868686889",
            91,
            "MODE_1_FULL_HEADER_FOOTER",
        ),
        (
            "lich-su-giao-dich(26-10-2026 04_12_20).xls",
            "CTG_EFAST_XLS",
            "CTG",
            "111602218989",
            144,
            "MODE_1_FULL_HEADER_FOOTER",
        ),
        (
            "TransactionHistory20264229_024204.xls",
            "SHB_CORP_XLS",
            "SHB",
            "2283866789",
            25,
            "MODE_3_DERIVED_RUNNING_BALANCE",
        ),
    ],
)
def test_parse_and_reconcile_all_7_samples(
    filename: str,
    expected_template: str,
    expected_bank: str,
    expected_account: str,
    expected_rows: int,
    expected_mode: str,
):
    file_path = SAMPLES_DIR / filename
    assert file_path.exists(), f"Không tìm thấy file mẫu: {file_path}"

    pkg = parse_statement_file(file_path)

    assert pkg.template_code == expected_template
    assert pkg.bank_code == expected_bank
    assert pkg.account_number == expected_account
    assert len(pkg.transactions) == expected_rows
    assert pkg.reconciliation.total_transactions_count == expected_rows
    assert pkg.reconciliation.reconciliation_mode == expected_mode
    assert pkg.reconciliation.reconciliation_status == "BALANCED"
    assert pkg.reconciliation.discrepancy_amount == Decimal("0.00")

    # Kiểm tra toàn bộ mã băm chống trùng 6 thành phần là duy nhất trong cùng 1 file (không trùng nhầm Phí/VAT)
    hashes = [tx["dedup_hash"] for tx in pkg.transactions]
    assert len(hashes) == len(set(hashes)), f"Phát hiện xung đột dedup_hash trong file {filename}"

    # Kiểm tra running_balance luôn có kiểu Decimal và không bị None
    # Đồng thời kiểm tra trường counter_party: đối tượng thụ hưởng/chuyển (để trống/None nếu file không có)
    has_counter_party_count = 0
    for tx in pkg.transactions:
        assert isinstance(tx["debit_amount"], Decimal)
        assert isinstance(tx["credit_amount"], Decimal)
        assert isinstance(tx["running_balance"], Decimal)
        assert len(tx["dedup_hash"]) == 64
        assert "counter_party" in tx
        if tx["counter_party"] is not None:
            assert isinstance(tx["counter_party"], str)
            assert len(tx["counter_party"].strip()) > 0
            has_counter_party_count += 1

    if expected_template in ["MBB_CORP_XLSX", "MBB_PERSONAL_XLSX", "MBV_CORP_XLSX", "TPB_CORP_XLSX", "CTG_EFAST_XLS", "VPB_CORP_XLSX", "SHB_CORP_XLS"]:
        assert has_counter_party_count > 0, f"Mẫu {expected_template} phải trích xuất được counter_party"

