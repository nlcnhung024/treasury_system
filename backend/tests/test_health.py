from decimal import Decimal
from pathlib import Path
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

SAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "Resources" / "Samples_sao_ke"


@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "BSP" in data["app_name"] or "Bank Statement" in data["app_name"]


@pytest.mark.asyncio
async def test_templates_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/templates")
    assert response.status_code == 200
    templates = response.json()
    assert len(templates) >= 7
    bank_codes = [t["bank_code"] for t in templates]
    assert "MBB" in bank_codes
    assert "VPB" in bank_codes
    assert "TPB" in bank_codes


@pytest.mark.asyncio
async def test_end_to_end_upload_rules_and_reports_flow():
    """
    Kiểm thử tích hợp End-to-End:
    1. Upload file mẫu VPBank -> Tự động bóc tách 5 dòng, đối soát BALANCED.
    2. Chặn upload trùng file SHA-256 (409 Conflict).
    3. Tạo Danh mục & Quy tắc phân loại -> Chạy lại quy tắc (/rules/re-apply).
    4. Kiểm tra Báo cáo CFO (/reports/cfo/daily-liquidity) & Báo cáo CEO Waterfall (/reports/ceo/waterfall).
    5. Dọn dẹp dữ liệu test để giữ bảng categories & classification_rules trống.
    """
    vpb_path = SAMPLES_DIR / "Saoketaikhoan_VPBank_446637355_20261026152303.xlsx"
    file_bytes = vpb_path.read_bytes()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Kiểm tra xem người dùng đã tải file VPBank lên trước đó chưa
        list_stmt_res = await ac.get("/api/v1/statements?limit=100")
        assert list_stmt_res.status_code == 200
        existing_vpb = next(
            (s for s in list_stmt_res.json().get("data", []) if s["original_filename"] == vpb_path.name),
            None,
        )

        files = {"file": (vpb_path.name, file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        if existing_vpb is None:
            # 1. Upload file VPBank mới
            up_res = await ac.post("/api/v1/statements/upload", files=files, data={"bank_code": "AUTO_DETECT"})
            assert up_res.status_code == 202, up_res.text
            up_data = up_res.json()
            file_id = up_data["file_id"]
            assert up_data["detected_template_code"] == "VPB_CORP_XLSX"
            assert up_data["reconciliation_status"] == "BALANCED"
            assert up_data["processed_rows"] == 5
            should_delete_file = True
        else:
            file_id = existing_vpb["file_id"]
            should_delete_file = False

        # 2. Upload trùng file -> 409 Conflict
        dup_res = await ac.post("/api/v1/statements/upload", files=files)
        assert dup_res.status_code == 409

        # 3. Tạo Danh mục & Quy tắc phân loại và chạy lại quy tắc
        cat_res = await ac.post(
            "/api/v1/categories",
            json={
                "category_type": "EXPENSE",
                "category_name": "Phí dịch vụ ngân hàng Test",
                "color_code": "#EF4444",
                "display_order": 1,
            },
        )
        assert cat_res.status_code == 201
        cat_id = cat_res.json()["category_id"]

        rule_res = await ac.post(
            "/api/v1/rules",
            json={
                "rule_name": "Quy tắc Phí SMS VPBank Test",
                "category_id": cat_id,
                "priority": 1,
                "keyword_patterns": "THU PHI SMS",
                "match_type": "CONTAINS",
                "applies_to_flow": "DEBIT",
            },
        )
        assert rule_res.status_code == 201
        rule_id = rule_res.json()["rule_id"]

        reapply_res = await ac.post("/api/v1/rules/re-apply")
        assert reapply_res.status_code == 200
        assert reapply_res.json()["tagged_count"] >= 2

        # 4. Kiểm tra Báo cáo CFO & CEO Waterfall
        cfo_res = await ac.get("/api/v1/reports/cfo/daily-liquidity?timeframe=MTD&exclude_internal_transfers=true")
        assert cfo_res.status_code == 200
        cfo_data = cfo_res.json()
        assert Decimal(str(cfo_data["total_bank_balance"])) >= Decimal("64196071.00")
        assert "opening_consolidated_liquidity" in cfo_data
        assert "total_inflow_consolidated" in cfo_data
        assert "total_outflow_consolidated" in cfo_data
        assert "cash_summary" in cfo_data
        for b_item in cfo_data["bank_breakdown"]:
            b_open = Decimal(str(b_item["opening_balance"]))
            b_in = Decimal(str(b_item["total_inflow"]))
            b_out = Decimal(str(b_item["total_outflow"]))
            b_close = Decimal(str(b_item["closing_balance"]))
            assert b_open + b_in - b_out == b_close

        cfo_excel_res = await ac.get("/api/v1/reports/cfo/export-excel?timeframe=MTD")
        assert cfo_excel_res.status_code == 200
        assert "spreadsheetml" in cfo_excel_res.headers.get("content-type", "")

        ceo_res = await ac.get("/api/v1/reports/ceo/waterfall?timeframe=MTD")
        assert ceo_res.status_code == 200
        ceo_data = ceo_res.json()
        open_b = Decimal(str(ceo_data["opening_balance"]))
        inc_b = Decimal(str(ceo_data["total_income"]))
        exp_b = Decimal(str(ceo_data["total_expense"]))
        close_b = Decimal(str(ceo_data["closing_balance"]))
        assert open_b + inc_b - exp_b == close_b

        # 4.5. Kiểm tra sửa Số dư Lũy kế thủ công làm căn cứ tính lại toàn bộ chuỗi giao dịch của tài khoản
        tx_list_res = await ac.get("/api/v1/transactions?bank_code=VPB&limit=10")
        assert tx_list_res.status_code == 200
        vpb_txs = [t for t in tx_list_res.json()["data"] if t["file_id"] == file_id]
        assert len(vpb_txs) == 5
        anchor_tx = vpb_txs[0]  # Giao dịch mới nhất của VPB
        old_latest_bal = Decimal(str(anchor_tx["running_balance"]))
        new_latest_bal = old_latest_bal + Decimal("10000000.00")

        patch_bal_res = await ac.patch(
            f"/api/v1/transactions/{anchor_tx['transaction_id']}",
            json={"running_balance": str(new_latest_bal)},
        )
        assert patch_bal_res.status_code == 200
        assert Decimal(str(patch_bal_res.json()["running_balance"])) == new_latest_bal

        # Xác nhận các giao dịch còn lại của cùng tài khoản cũng được dịch chuyển đúng +10,000,000.00
        tx_list_after = (await ac.get("/api/v1/transactions?bank_code=VPB&limit=10")).json()["data"]
        vpb_txs_after = [t for t in tx_list_after if t["file_id"] == file_id]
        for before_item, after_item in zip(vpb_txs, vpb_txs_after):
            assert Decimal(str(after_item["running_balance"])) - Decimal(str(before_item["running_balance"])) == Decimal(
                "10000000.00"
            )

        # Khôi phục lại số dư gốc của tài khoản VPB sau khi test
        await ac.patch(
            f"/api/v1/transactions/{anchor_tx['transaction_id']}",
            json={"running_balance": str(old_latest_bal)},
        )

        # 5. Dọn dẹp dữ liệu kiểm thử để giữ trạng thái sạch ban đầu
        await ac.delete(f"/api/v1/rules/{rule_id}")
        await ac.delete(f"/api/v1/categories/{cat_id}")
        if should_delete_file:
            await ac.delete(f"/api/v1/statements/{file_id}")
