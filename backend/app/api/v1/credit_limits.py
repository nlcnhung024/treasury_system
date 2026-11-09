import json
import uuid
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_, text
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.credit import CreditFacility
from app.models.credit_limit import (
    CreditAgreement,
    CreditLimitDossier,
    CreditLimitDossierFile,
    CollateralAsset,
    CollateralValuation,
    CollateralDocument,
    CollateralAgreementHistory,
    PostLoanCovenant,
)
from app.models.transaction import BankTransaction
from app.models.account import BankAccount
from app.models.bank import Bank
from app.models.corporate_entity import CorporateEntity
from app.schemas.credit_limit import (
    SublimitItem,
    CreditAgreementResponse,
    CreditAgreementCreate,
    CreditAgreementUpdate,
    CreditAgreementRenewPayload,
    LinkedLoanBrief,
    LinkedCollateralBrief,
    CreditLimitDossierResponse,
    CreditLimitDossierCreate,
    CreditLimitDossierUpdate,
    CreditLimitDossierFileResponse,
    ChecklistItemSchema,
    CollateralAssetResponse,
    CollateralAssetCreate,
    CollateralAssetUpdate,
    CollateralValuationResponse,
    CollateralDocumentResponse,
    CollateralAgreementHistoryResponse,
    CollateralTransferAgreementRequest,
    PostLoanCovenantResponse,
    PostLoanCovenantCreate,
    PostLoanCovenantUpdate,
)
from app.services.storage_service import save_statement_bytes, read_statement_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/credit-limits", tags=["Credit Limit & Collateral Management"])

DEFAULT_DOSSIER_CHECKLIST = [
    {"key": "LEGAL", "label": "Hồ sơ pháp lý doanh nghiệp (ĐKKD, Điều lệ, CCCD đại diện)", "category": "LEGAL", "is_required": True, "is_completed": False},
    {"key": "FINANCIAL_REPORT", "label": "Báo cáo tài chính & Tờ khai thuế 2 năm gần nhất + Quý hiện tại", "category": "FINANCIAL_REPORT", "is_required": True, "is_completed": False},
    {"key": "BUSINESS_PLAN", "label": "Phương án sản xuất kinh doanh & Kế hoạch sử dụng vốn vay", "category": "BUSINESS_PLAN", "is_required": True, "is_completed": False},
    {"key": "BOARD_RESOLUTION", "label": "Biên bản họp & Nghị quyết HĐQT/HĐTV thông qua vay vốn & thế chấp", "category": "BOARD_RESOLUTION", "is_required": True, "is_completed": False},
    {"key": "COLLATERAL_DOCS", "label": "Hồ sơ Tài sản đảm bảo & Chứng thư thẩm định giá", "category": "CREDIT_PROPOSAL", "is_required": True, "is_completed": False},
    {"key": "CREDIT_CONTRACT", "label": "Thông báo phê duyệt cấp tín dụng & Hợp đồng tín dụng hạn mức đã ký", "category": "CREDIT_CONTRACT", "is_required": True, "is_completed": False},
]


def _normalize_bank_family(code: str) -> str:
    c = (code or "").strip().upper()
    if c in ("CTG", "VIETINBANK", "CTG_LEASING"):
        return "CTG"
    if c in ("MB", "MBB", "MBBANK"):
        return "MBB"
    if c in ("VPB", "VPBANK"):
        return "VPB"
    if c in ("BIDV", "BID"):
        return "BIDV"
    if c in ("VCB", "VIETCOMBANK"):
        return "VCB"
    return c


async def sync_facilities_to_agreements(db: AsyncSession, target_bank_code: Optional[str] = None) -> int:
    """
    Tự động gắn các Khế ước (CreditFacility) vào Hợp đồng tín dụng (CreditAgreement)
    khi Khế ước có cùng ngân hàng (hoặc nhóm ngân hàng) và Ngày giải ngân (disbursement_date)
    nằm trong khoảng thời gian hiệu lực [effective_from, effective_to] của Hợp đồng tín dụng.
    """
    agreements_stmt = select(CreditAgreement).order_by(desc(CreditAgreement.effective_from))
    if target_bank_code:
        norm = _normalize_bank_family(target_bank_code)
        variants = {target_bank_code, norm}
        if norm == "CTG":
            variants.update({"CTG", "VIETINBANK", "CTG_LEASING"})
        elif norm == "MBB":
            variants.update({"MB", "MBB", "MBBANK"})
        elif norm == "VPB":
            variants.update({"VPB", "VPBANK"})
        elif norm == "BIDV":
            variants.update({"BIDV", "BID"})
        elif norm == "VCB":
            variants.update({"VCB", "VIETCOMBANK"})
        agreements_stmt = agreements_stmt.where(CreditAgreement.bank_code.in_(list(variants)))
    agreements = (await db.execute(agreements_stmt)).scalars().all()

    if not agreements:
        return 0

    facilities_stmt = select(CreditFacility)
    if target_bank_code:
        norm = _normalize_bank_family(target_bank_code)
        variants = {target_bank_code, norm}
        if norm == "CTG":
            variants.update({"CTG", "VIETINBANK", "CTG_LEASING"})
        elif norm == "MBB":
            variants.update({"MB", "MBB", "MBBANK"})
        elif norm == "VPB":
            variants.update({"VPB", "VPBANK"})
        elif norm == "BIDV":
            variants.update({"BIDV", "BID"})
        elif norm == "VCB":
            variants.update({"VCB", "VIETCOMBANK"})
        facilities_stmt = facilities_stmt.where(CreditFacility.bank_code.in_(list(variants)))
    facilities = (await db.execute(facilities_stmt)).scalars().all()

    matched_count = 0
    for fac in facilities:
        if not fac.disbursement_date:
            continue
        fac_bank_fam = _normalize_bank_family(fac.bank_code)
        matched_ag: Optional[CreditAgreement] = None

        # Ưu tiên khớp chính xác bank_code + ngày giải ngân trong khoảng [effective_from, effective_to]
        for ag in agreements:
            ag_bank_fam = _normalize_bank_family(ag.bank_code)
            if ag_bank_fam == fac_bank_fam and ag.effective_from <= fac.disbursement_date <= ag.effective_to:
                # Nếu có nhiều thực thể, ưu tiên khớp tên pháp nhân vay
                if not fac.borrower_name or not ag.borrower_name or (
                    ag.borrower_name.strip().upper() in fac.borrower_name.strip().upper()
                    or fac.borrower_name.strip().upper() in ag.borrower_name.strip().upper()
                ):
                    matched_ag = ag
                    break

        # Fallback: chỉ cần khớp bank_family và khoảng thời gian hiệu lực
        if not matched_ag:
            for ag in agreements:
                if _normalize_bank_family(ag.bank_code) == fac_bank_fam and ag.effective_from <= fac.disbursement_date <= ag.effective_to:
                    matched_ag = ag
                    break

        if matched_ag and fac.agreement_id != matched_ag.agreement_id:
            fac.agreement_id = matched_ag.agreement_id
            matched_count += 1

    if matched_count > 0:
        await db.flush()
    return matched_count


def _compute_collateral_revaluation(latest_val_date: Optional[date], collateral_status: str) -> tuple[Optional[int], bool, Optional[str]]:
    """
    Kiểm tra nếu lần định giá gần nhất cách thời điểm hiện tại quá hơn 6 tháng (> 180 ngày)
    thì trả về requires_revaluation = True và thông báo 'Yêu cầu định giá lại'.
    """
    today = date.today()
    if collateral_status == "RELEASED":
        if latest_val_date:
            return (today - latest_val_date).days, False, None
        return None, False, None

    if not latest_val_date:
        return None, True, "Yêu cầu định giá lại (Chưa có ngày định giá)"

    days_diff = (today - latest_val_date).days
    # Quá 6 tháng (~180 ngày)
    if days_diff > 180:
        months_diff = round(days_diff / 30.0, 1)
        return days_diff, True, f"Yêu cầu định giá lại (Đã quá {months_diff} tháng / {days_diff} ngày)"
    return days_diff, False, None


async def ensure_credit_limit_tables(db: AsyncSession) -> None:
    """Đảm bảo các bảng phân hệ Quản lý hạn mức và cột agreement_id trên credit_facilities đã tồn tại."""
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS credit_agreements (
                agreement_id BIGSERIAL PRIMARY KEY,
                agreement_uuid UUID NOT NULL UNIQUE,
                bank_id BIGINT REFERENCES banks(bank_id) ON DELETE SET NULL,
                bank_code VARCHAR(20) NOT NULL,
                bank_name VARCHAR(100) NOT NULL,
                agreement_number VARCHAR(100) NOT NULL,
                agreement_name VARCHAR(255) NOT NULL,
                entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
                borrower_name VARCHAR(150) NOT NULL,
                total_credit_limit DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
                loan_sublimit DECIMAL(18, 2),
                guarantee_sublimit DECIMAL(18, 2),
                lc_sublimit DECIMAL(18, 2),
                sublimits_json TEXT DEFAULT '[]',
                contract_file_name VARCHAR(255),
                contract_file_path VARCHAR(500),
                contract_file_size BIGINT,
                currency VARCHAR(5) NOT NULL DEFAULT 'VND',
                signed_date DATE,
                effective_from DATE NOT NULL,
                effective_to DATE NOT NULL,
                interest_rate_framework VARCHAR(255),
                collateral_summary TEXT,
                status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
                parent_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                renewed_to_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                notes TEXT,
                created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_credit_agreement_bank_number UNIQUE (bank_code, agreement_number)
            );
            """)
    )
    await db.execute(text("CREATE INDEX IF NOT EXISTS idx_credit_agreements_bank_id ON credit_agreements(bank_id);"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS idx_credit_agreements_bank_code ON credit_agreements(bank_code);"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS idx_credit_agreements_entity_id ON credit_agreements(entity_id);"))
    await db.execute(
        text("""
            """
        )
    )
    await db.execute(
        text("ALTER TABLE credit_facilities ADD COLUMN IF NOT EXISTS agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL;")
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS credit_limit_dossiers (
                dossier_id BIGSERIAL PRIMARY KEY,
                dossier_uuid UUID NOT NULL UNIQUE,
                agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                bank_code VARCHAR(20) NOT NULL,
                bank_name VARCHAR(100) NOT NULL,
                borrower_name VARCHAR(150) NOT NULL,
                dossier_code VARCHAR(80) NOT NULL UNIQUE,
                dossier_title VARCHAR(255) NOT NULL,
                dossier_type VARCHAR(40) NOT NULL DEFAULT 'RENEWAL',
                proposed_limit_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
                approved_limit_amount DECIMAL(18, 2),
                submission_date DATE,
                approval_date DATE,
                expiry_review_date DATE,
                status VARCHAR(30) NOT NULL DEFAULT 'PREPARING',
                checklist_json TEXT NOT NULL DEFAULT '[]',
                responsible_person VARCHAR(120),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS credit_limit_dossier_files (
                file_id BIGSERIAL PRIMARY KEY,
                file_uuid UUID NOT NULL UNIQUE,
                dossier_id BIGINT NOT NULL REFERENCES credit_limit_dossiers(dossier_id) ON DELETE CASCADE,
                category VARCHAR(50) NOT NULL DEFAULT 'LEGAL',
                file_name VARCHAR(255) NOT NULL,
                storage_path VARCHAR(500) NOT NULL,
                file_size_bytes BIGINT NOT NULL DEFAULT 0,
                mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
                description TEXT,
                uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS collateral_assets (
                asset_id BIGSERIAL PRIMARY KEY,
                asset_uuid UUID NOT NULL UNIQUE,
                asset_code VARCHAR(80) NOT NULL UNIQUE,
                asset_name VARCHAR(255) NOT NULL,
                asset_type VARCHAR(50) NOT NULL DEFAULT 'REAL_ESTATE_LAND',
                owner_name VARCHAR(200) NOT NULL,
                owner_id_or_tax_code VARCHAR(50),
                ownership_relation VARCHAR(50) NOT NULL DEFAULT 'BORROWER_OWNED',
                borrower_name VARCHAR(150),
                bank_code VARCHAR(20),
                bank_name VARCHAR(100),
                agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                appraised_value DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
                ltv_ratio DECIMAL(6, 2) NOT NULL DEFAULT 70.00,
                max_secured_loan_value DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
                currency VARCHAR(5) NOT NULL DEFAULT 'VND',
                collateral_status VARCHAR(30) NOT NULL DEFAULT 'MORTGAGED',
                latest_valuation_date DATE,
                certificate_number VARCHAR(100),
                certificate_issue_date DATE,
                certificate_issued_by VARCHAR(200),
                address TEXT,
                land_area_m2 DECIMAL(14, 2),
                google_maps_url TEXT,
                latitude DECIMAL(10, 7),
                longitude DECIMAL(10, 7),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS collateral_valuations (
                valuation_id BIGSERIAL PRIMARY KEY,
                valuation_uuid UUID NOT NULL UNIQUE,
                asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
                valuation_org VARCHAR(255) NOT NULL,
                valuation_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
                valuation_date DATE NOT NULL,
                valuer_name VARCHAR(150),
                report_number VARCHAR(100),
                report_file_name VARCHAR(255),
                report_storage_path VARCHAR(500),
                report_file_size BIGINT,
                report_mime_type VARCHAR(100),
                notes TEXT,
                created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS collateral_documents (
                doc_id BIGSERIAL PRIMARY KEY,
                doc_uuid UUID NOT NULL UNIQUE,
                asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
                doc_category VARCHAR(50) NOT NULL DEFAULT 'RED_BOOK',
                file_name VARCHAR(255) NOT NULL,
                storage_path VARCHAR(500) NOT NULL,
                file_size_bytes BIGINT NOT NULL DEFAULT 0,
                mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
                description TEXT,
                uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS collateral_agreement_history (
                history_id BIGSERIAL PRIMARY KEY,
                asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
                from_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                from_agreement_number VARCHAR(100),
                to_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
                to_agreement_number VARCHAR(100),
                bank_code VARCHAR(20),
                action_type VARCHAR(40) NOT NULL DEFAULT 'INITIAL_MORTGAGE',
                effective_date DATE NOT NULL,
                notes TEXT,
                performed_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS post_loan_covenants (
                covenant_id BIGSERIAL PRIMARY KEY,
                covenant_uuid UUID NOT NULL UNIQUE,
                agreement_id BIGINT NOT NULL REFERENCES credit_agreements(agreement_id) ON DELETE CASCADE,
                loan_id BIGINT REFERENCES credit_facilities(loan_id) ON DELETE SET NULL,
                bank_code VARCHAR(20) NOT NULL,
                bank_name VARCHAR(100) NOT NULL,
                borrower_name VARCHAR(150) NOT NULL,
                covenant_title VARCHAR(255) NOT NULL,
                covenant_category VARCHAR(50) NOT NULL DEFAULT 'CASHFLOW_TURNOVER',
                frequency VARCHAR(30) NOT NULL DEFAULT 'QUARTERLY',
                linked_account_id BIGINT REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
                linked_account_number VARCHAR(50),
                period_start DATE,
                due_date DATE NOT NULL,
                target_value DECIMAL(18, 2),
                actual_value DECIMAL(18, 2),
                unit VARCHAR(30) NOT NULL DEFAULT 'VND',
                compliance_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
                evidence_file_name VARCHAR(255),
                evidence_storage_path VARCHAR(500),
                responsible_person VARCHAR(120),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.commit()


async def ensure_credit_limit_seed_data(db: AsyncSession) -> None:
    """Đảm bảo các bảng phân hệ Quản lý hạn mức đã tồn tại và đồng bộ liên kết khế ước nếu có."""
    await ensure_credit_limit_tables(db)
    count_ag = (await db.execute(select(func.count(CreditAgreement.agreement_id)))).scalar() or 0
    if count_ag > 0:
        await sync_facilities_to_agreements(db)
        await db.commit()


async def _build_agreement_response(ag: CreditAgreement, all_agreements_map: dict[int, str], db: AsyncSession) -> CreditAgreementResponse:
    today = date.today()
    days_to_expiry = (ag.effective_to - today).days

    if ag.status == "SETTLED" or ag.status == "RENEWED":
        computed_status = ag.status
    elif days_to_expiry < 0:
        computed_status = "EXPIRED"
    elif days_to_expiry <= 30:
        computed_status = "EXPIRING_SOON"
    else:
        computed_status = "ACTIVE"

    facs_stmt = select(CreditFacility).where(CreditFacility.agreement_id == ag.agreement_id).order_by(desc(CreditFacility.disbursement_date))
    facs = (await db.execute(facs_stmt)).scalars().all()

    cols_stmt = select(CollateralAsset).where(CollateralAsset.agreement_id == ag.agreement_id).order_by(CollateralAsset.asset_code)
    cols = (await db.execute(cols_stmt)).scalars().all()

    active_loans = [f for f in facs if f.status == "ACTIVE"]
    utilized_amount = sum((f.current_principal_balance or Decimal("0.00")) for f in active_loans)
    available_limit = max(Decimal("0.00"), (ag.total_credit_limit or Decimal("0.00")) - utilized_amount)
    utilization_pct = (
        (utilized_amount / ag.total_credit_limit * Decimal("100.00")).quantize(Decimal("0.01"))
        if ag.total_credit_limit and ag.total_credit_limit > Decimal("0.00")
        else Decimal("0.00")
    )

    total_col_val = sum((c.appraised_value or Decimal("0.00")) for c in cols if c.collateral_status != "RELEASED")
    total_max_sec = sum((c.max_secured_loan_value or Decimal("0.00")) for c in cols if c.collateral_status != "RELEASED")

    linked_loans = [
        LinkedLoanBrief(
            loan_id=f.loan_id,
            contract_number=f.contract_number,
            borrower_name=f.borrower_name,
            disbursement_date=f.disbursement_date,
            maturity_date=f.maturity_date,
            interest_rate=f.interest_rate,
            original_principal_balance=f.original_principal_balance,
            current_principal_balance=f.current_principal_balance,
            status=f.status,
        )
        for f in facs
    ]

    linked_collaterals = []
    for c in cols:
        _, req_reval, _ = _compute_collateral_revaluation(c.latest_valuation_date, c.collateral_status)
        linked_collaterals.append(
            LinkedCollateralBrief(
                asset_id=c.asset_id,
                asset_code=c.asset_code,
                asset_name=c.asset_name,
                owner_name=c.owner_name,
                appraised_value=c.appraised_value,
                ltv_ratio=c.ltv_ratio,
                max_secured_loan_value=c.max_secured_loan_value,
                collateral_status=c.collateral_status,
                latest_valuation_date=c.latest_valuation_date,
                requires_revaluation=req_reval,
            )
        )

    entity_code = None
    entity_short_name = None
    if ag.entity_id:
        ent = await db.get(CorporateEntity, ag.entity_id)
        if ent:
            entity_code = ent.entity_code
            entity_short_name = ent.short_name

    parsed_sublimits = []
    try:
        raw_subs = json.loads(ag.sublimits_json or "[]")
        if isinstance(raw_subs, list):
            for s in raw_subs:
                if isinstance(s, dict) and "name" in s and "amount" in s:
                    parsed_sublimits.append(SublimitItem(name=str(s["name"]), amount=Decimal(str(s["amount"]))))
    except Exception:
        pass

    # Tự động suy diễn nếu sublimits_json chưa có nhưng các trường cũ có giá trị
    if not parsed_sublimits:
        if ag.loan_sublimit and ag.loan_sublimit > Decimal("0.00"):
            parsed_sublimits.append(SublimitItem(name="Hạn mức Cho vay (Loan)", amount=ag.loan_sublimit))
        if ag.guarantee_sublimit and ag.guarantee_sublimit > Decimal("0.00"):
            parsed_sublimits.append(SublimitItem(name="Hạn mức Bảo lãnh", amount=ag.guarantee_sublimit))
        if ag.lc_sublimit and ag.lc_sublimit > Decimal("0.00"):
            parsed_sublimits.append(SublimitItem(name="Hạn mức L/C", amount=ag.lc_sublimit))

    return CreditAgreementResponse(
        agreement_id=ag.agreement_id,
        agreement_uuid=ag.agreement_uuid,
        bank_id=ag.bank_id,
        bank_code=ag.bank_code,
        bank_name=ag.bank_name,
        agreement_number=ag.agreement_number,
        agreement_name=ag.agreement_name,
        entity_id=ag.entity_id,
        entity_code=entity_code,
        entity_short_name=entity_short_name,
        borrower_name=ag.borrower_name,
        total_credit_limit=ag.total_credit_limit,
        loan_sublimit=ag.loan_sublimit,
        guarantee_sublimit=ag.guarantee_sublimit,
        lc_sublimit=ag.lc_sublimit,
        sublimits_json=ag.sublimits_json or "[]",
        sublimits=parsed_sublimits,
        contract_file_name=ag.contract_file_name,
        contract_file_path=ag.contract_file_path,
        contract_file_size=ag.contract_file_size,
        currency=ag.currency,
        signed_date=ag.signed_date,
        effective_from=ag.effective_from,
        effective_to=ag.effective_to,
        interest_rate_framework=ag.interest_rate_framework,
        collateral_summary=ag.collateral_summary,
        status=ag.status,
        computed_status=computed_status,
        days_to_expiry=days_to_expiry,
        parent_agreement_id=ag.parent_agreement_id,
        parent_agreement_number=all_agreements_map.get(ag.parent_agreement_id) if ag.parent_agreement_id else None,
        renewed_to_agreement_id=ag.renewed_to_agreement_id,
        renewed_to_agreement_number=all_agreements_map.get(ag.renewed_to_agreement_id) if ag.renewed_to_agreement_id else None,
        notes=ag.notes,
        created_by=ag.created_by,
        created_at=ag.created_at,
        updated_at=ag.updated_at,
        active_loans_count=len(active_loans),
        total_loans_count=len(facs),
        utilized_loan_amount=utilized_amount,
        available_credit_limit=available_limit,
        utilization_pct=utilization_pct,
        collateral_count=len(cols),
        total_collateral_value=total_col_val,
        total_max_secured_value=total_max_sec,
        linked_loans=linked_loans,
        linked_collaterals=linked_collaterals,
    )


# =============================================================================
# ENDPOINTS 1: HỢP ĐỒNG TÍN DỤNG (CREDIT AGREEMENTS)
# =============================================================================

@router.get("/agreements", response_model=List[CreditAgreementResponse])
async def list_credit_agreements(
    bank_code: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    borrower_name: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await ensure_credit_limit_seed_data(db)

    stmt = select(CreditAgreement).order_by(desc(CreditAgreement.effective_to), CreditAgreement.bank_code)
    if bank_code:
        stmt = stmt.where(CreditAgreement.bank_code == bank_code)
    if entity_id:
        stmt = stmt.where(CreditAgreement.entity_id == entity_id)
    if borrower_name:
        stmt = stmt.where(CreditAgreement.borrower_name == borrower_name)

    agreements = (await db.execute(stmt)).scalars().all()
    all_map = {a.agreement_id: a.agreement_number for a in agreements}

    results = []
    for ag in agreements:
        resp = await _build_agreement_response(ag, all_map, db)
        if status_filter and resp.computed_status != status_filter and resp.status != status_filter:
            continue
        results.append(resp)
    return results


@router.post("/agreements", response_model=CreditAgreementResponse, status_code=status.HTTP_201_CREATED)
async def create_credit_agreement(
    payload: CreditAgreementCreate,
    db: AsyncSession = Depends(get_db),
):
    if payload.effective_to < payload.effective_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ngày hết hạn hạn mức phải lớn hơn hoặc bằng Ngày bắt đầu hiệu lực.",
        )

    dup_stmt = select(CreditAgreement).where(
        CreditAgreement.bank_code == payload.bank_code.strip().upper(),
        CreditAgreement.agreement_number == payload.agreement_number.strip(),
    )
    if (await db.execute(dup_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Số Hợp đồng tín dụng '{payload.agreement_number}' tại ngân hàng {payload.bank_code} đã tồn tại.",
        )

    # Tự động truy vấn và gắn bank_id từ bảng banks qua bank_code nếu chưa có
    resolved_bank_id = payload.bank_id
    if not resolved_bank_id and payload.bank_code:
        bank_obj = (
            await db.execute(select(Bank).where(Bank.bank_code == payload.bank_code.strip().upper()))
        ).scalar_one_or_none()
        if bank_obj:
            resolved_bank_id = bank_obj.bank_id

    # Xử lý các loại hạn mức con & kiểm tra điều kiện không vượt quá tổng hạn mức
    sublimits_to_save = []
    if payload.sublimits:
        for sub in payload.sublimits:
            if sub.amount > payload.total_credit_limit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Loại hạn mức '{sub.name}' ({sub.amount:,.0f} VND) không được cao hơn Tổng hạn mức ({payload.total_credit_limit:,.0f} VND).",
                )
            sublimits_to_save.append({"name": sub.name.strip(), "amount": float(sub.amount)})
    elif payload.sublimits_json:
        try:
            raw_subs = json.loads(payload.sublimits_json)
            for sub in raw_subs:
                amt = Decimal(str(sub.get("amount", 0)))
                s_name = str(sub.get("name", "")).strip()
                if amt > payload.total_credit_limit:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Loại hạn mức '{s_name}' ({amt:,.0f} VND) không được cao hơn Tổng hạn mức ({payload.total_credit_limit:,.0f} VND).",
                    )
                sublimits_to_save.append({"name": s_name, "amount": float(amt)})
        except HTTPException:
            raise
        except Exception:
            pass

    sublimits_json_str = json.dumps(sublimits_to_save, ensure_ascii=False) if sublimits_to_save else (payload.sublimits_json or "[]")

    entity_id_val = payload.entity_id
    borrower_name_val = payload.borrower_name.strip() if payload.borrower_name else ""
    if entity_id_val:
        corp = await db.get(CorporateEntity, entity_id_val)
        if corp and not borrower_name_val:
            borrower_name_val = corp.company_name

    new_ag = CreditAgreement(
        bank_id=resolved_bank_id,
        bank_code=payload.bank_code.strip().upper(),
        bank_name=payload.bank_name.strip(),
        entity_id=entity_id_val,
        agreement_number=payload.agreement_number.strip(),
        agreement_name=payload.agreement_name.strip(),
        borrower_name=borrower_name_val,
        total_credit_limit=payload.total_credit_limit,
        loan_sublimit=payload.loan_sublimit,
        guarantee_sublimit=payload.guarantee_sublimit,
        lc_sublimit=payload.lc_sublimit,
        sublimits_json=sublimits_json_str,
        contract_file_name=payload.contract_file_name,
        contract_file_path=payload.contract_file_path,
        contract_file_size=payload.contract_file_size,
        currency=payload.currency,
        signed_date=payload.signed_date or payload.effective_from,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        interest_rate_framework=payload.interest_rate_framework,
        collateral_summary=payload.collateral_summary,
        status=payload.status,
        parent_agreement_id=payload.parent_agreement_id,
        notes=payload.notes,
    )
    db.add(new_ag)
    await db.flush()

    # Nếu kế thừa từ HĐTD cũ hết hạn và chọn chuyển tiếp Tài sản đảm bảo
    if payload.parent_agreement_id:
        parent_ag = (
            await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == payload.parent_agreement_id))
        ).scalar_one_or_none()
        if parent_ag:
            parent_ag.renewed_to_agreement_id = new_ag.agreement_id
            if payload.transfer_collaterals_from_parent:
                cols = (
                    await db.execute(
                        select(CollateralAsset).where(
                            CollateralAsset.agreement_id == parent_ag.agreement_id,
                            CollateralAsset.collateral_status != "RELEASED",
                        )
                    )
                ).scalars().all()
                for col in cols:
                    col.agreement_id = new_ag.agreement_id
                    col.bank_code = new_ag.bank_code
                    col.bank_name = new_ag.bank_name
                    db.add(
                        CollateralAgreementHistory(
                            asset_id=col.asset_id,
                            from_agreement_id=parent_ag.agreement_id,
                            from_agreement_number=parent_ag.agreement_number,
                            to_agreement_id=new_ag.agreement_id,
                            to_agreement_number=new_ag.agreement_number,
                            bank_code=new_ag.bank_code,
                            action_type="ROLLOVER_TRANSFER",
                            effective_date=new_ag.effective_from,
                            notes=f"Tự động chuyển tiếp tài sản đảm bảo từ HĐTD hết hạn {parent_ag.agreement_number} sang HĐTD mới {new_ag.agreement_number}.",
                            performed_by="SYSTEM",
                        )
                    )

    # Tự động liên kết các Khế ước có ngày giải ngân trong khoảng hiệu lực của HĐTD mới
    await sync_facilities_to_agreements(db, target_bank_code=new_ag.bank_code)
    await db.commit()
    await db.refresh(new_ag)

    all_ags = (await db.execute(select(CreditAgreement))).scalars().all()
    all_map = {a.agreement_id: a.agreement_number for a in all_ags}
    return await _build_agreement_response(new_ag, all_map, db)


@router.put("/agreements/{agreement_id}", response_model=CreditAgreementResponse)
async def update_credit_agreement(
    agreement_id: int,
    payload: CreditAgreementUpdate,
    db: AsyncSession = Depends(get_db),
):
    ag = (await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == agreement_id))).scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng.")

    update_data = payload.model_dump(exclude_unset=True)
    target_total = update_data.get("total_credit_limit", ag.total_credit_limit)
    if payload.sublimits is not None:
        sublimits_to_save = []
        for sub in payload.sublimits:
            if sub.amount > target_total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Loại hạn mức '{sub.name}' ({sub.amount:,.0f} VND) không được cao hơn Tổng hạn mức ({target_total:,.0f} VND).",
                )
            sublimits_to_save.append({"name": sub.name.strip(), "amount": float(sub.amount)})
        ag.sublimits_json = json.dumps(sublimits_to_save, ensure_ascii=False)
        update_data.pop("sublimits", None)
        update_data.pop("sublimits_json", None)
    elif "sublimits_json" in update_data and update_data["sublimits_json"]:
        try:
            raw_subs = json.loads(update_data["sublimits_json"])
            for sub in raw_subs:
                amt = Decimal(str(sub.get("amount", 0)))
                s_name = str(sub.get("name", "")).strip()
                if amt > target_total:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Loại hạn mức '{s_name}' ({amt:,.0f} VND) không được cao hơn Tổng hạn mức ({target_total:,.0f} VND).",
                    )
        except HTTPException:
            raise
        except Exception:
            pass

    if "bank_code" in update_data and update_data["bank_code"]:
        update_data["bank_code"] = update_data["bank_code"].strip().upper()
        bank_obj = (
            await db.execute(select(Bank).where(Bank.bank_code == update_data["bank_code"]))
        ).scalar_one_or_none()
        if bank_obj:
            ag.bank_id = bank_obj.bank_id
    for k, v in update_data.items():
        setattr(ag, k, v)

    await db.flush()
    await sync_facilities_to_agreements(db)
    await db.commit()
    await db.refresh(ag)

    all_ags = (await db.execute(select(CreditAgreement))).scalars().all()
    all_map = {a.agreement_id: a.agreement_number for a in all_ags}
    return await _build_agreement_response(ag, all_map, db)


@router.delete("/agreements/{agreement_id}")
async def delete_credit_agreement(
    agreement_id: int,
    db: AsyncSession = Depends(get_db),
):
    ag = (await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == agreement_id))).scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng.")

    # Gỡ liên kết khế ước & tài sản đảm bảo trước khi xóa
    facs = (await db.execute(select(CreditFacility).where(CreditFacility.agreement_id == agreement_id))).scalars().all()
    for f in facs:
        f.agreement_id = None

    cols = (await db.execute(select(CollateralAsset).where(CollateralAsset.agreement_id == agreement_id))).scalars().all()
    for c in cols:
        c.agreement_id = None

    await db.delete(ag)
    await db.commit()
    return {"message": f"Đã xóa Hợp đồng tín dụng {ag.agreement_number} thành công."}


@router.post("/agreements/{agreement_id}/file", response_model=CreditAgreementResponse)
async def upload_agreement_file(
    agreement_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    ag = (await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == agreement_id))).scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng.")

    filename = file.filename or "hop_dong_tin_dung.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chỉ chấp nhận tệp định dạng PDF cho Hợp đồng tín dụng.")

    content = await file.read()
    f_uuid = uuid.uuid4()
    storage_path = f"credit_agreements/{ag.bank_code}/{ag.agreement_id}/{f_uuid}_{filename}"
    save_statement_bytes(storage_path, content, content_type="application/pdf")

    ag.contract_file_name = filename
    ag.contract_file_path = storage_path
    ag.contract_file_size = len(content)
    await db.commit()
    await db.refresh(ag)

    all_ags = (await db.execute(select(CreditAgreement))).scalars().all()
    all_map = {a.agreement_id: a.agreement_number for a in all_ags}
    return await _build_agreement_response(ag, all_map, db)


@router.get("/agreements/{agreement_id}/file")
async def download_agreement_file(
    agreement_id: int,
    db: AsyncSession = Depends(get_db),
):
    ag = (await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == agreement_id))).scalar_one_or_none()
    if not ag or not ag.contract_file_name or not ag.contract_file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hợp đồng tín dụng này chưa có tệp PDF đính kèm.")

    try:
        raw_bytes = read_statement_bytes(ag.contract_file_path)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp PDF trên hệ thống lưu trữ.")

    return StreamingResponse(
        io.BytesIO(raw_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{ag.contract_file_name}"'},
    )


@router.delete("/agreements/{agreement_id}/file")
async def delete_agreement_file(
    agreement_id: int,
    db: AsyncSession = Depends(get_db),
):
    ag = (await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == agreement_id))).scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng.")

    ag.contract_file_name = None
    ag.contract_file_path = None
    ag.contract_file_size = None
    await db.commit()
    await db.refresh(ag)
    return {"message": "Đã xóa tệp PDF đính kèm của Hợp đồng tín dụng."}


@router.post("/agreements/sync-loans")
async def trigger_sync_loans_to_agreements(
    db: AsyncSession = Depends(get_db),
):
    matched = await sync_facilities_to_agreements(db)
    await db.commit()
    return {
        "matched_count": matched,
        "message": f"Đã rà soát và tự động gắn kết {matched} khế ước vào các Hợp đồng tín dụng có thời gian hiệu lực tương ứng.",
    }


@router.post("/agreements/{old_agreement_id}/renew", response_model=CreditAgreementResponse)
async def renew_agreement_and_transfer_collaterals(
    old_agreement_id: int,
    payload: CreditAgreementRenewPayload,
    db: AsyncSession = Depends(get_db),
):
    old_ag = (
        await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == old_agreement_id))
    ).scalar_one_or_none()
    if not old_ag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng cũ.")

    resolved_bank_id = old_ag.bank_id
    if not resolved_bank_id and old_ag.bank_code:
        bank_obj = (
            await db.execute(select(Bank).where(Bank.bank_code == old_ag.bank_code))
        ).scalar_one_or_none()
        if bank_obj:
            resolved_bank_id = bank_obj.bank_id

    new_ag = CreditAgreement(
        bank_id=resolved_bank_id,
        bank_code=old_ag.bank_code,
        bank_name=old_ag.bank_name,
        agreement_number=payload.new_agreement_number.strip(),
        agreement_name=payload.new_agreement_name.strip(),
        borrower_name=old_ag.borrower_name,
        total_credit_limit=payload.total_credit_limit,
        loan_sublimit=payload.loan_sublimit,
        guarantee_sublimit=payload.guarantee_sublimit,
        lc_sublimit=payload.lc_sublimit,
        currency=old_ag.currency,
        signed_date=payload.signed_date or payload.effective_from,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        interest_rate_framework=payload.interest_rate_framework or old_ag.interest_rate_framework,
        collateral_summary=old_ag.collateral_summary,
        status="ACTIVE",
        parent_agreement_id=old_ag.agreement_id,
        notes=payload.notes,
    )
    db.add(new_ag)
    await db.flush()

    old_ag.status = "EXPIRED"
    old_ag.renewed_to_agreement_id = new_ag.agreement_id

    # Chuyển tiếp TSĐB từ HĐTD cũ sang HĐTD mới
    col_stmt = select(CollateralAsset).where(
        CollateralAsset.agreement_id == old_ag.agreement_id,
        CollateralAsset.collateral_status != "RELEASED",
    )
    if payload.transfer_collateral_ids is not None:
        col_stmt = col_stmt.where(CollateralAsset.asset_id.in_(payload.transfer_collateral_ids))

    cols_to_transfer = (await db.execute(col_stmt)).scalars().all()
    for col in cols_to_transfer:
        col.agreement_id = new_ag.agreement_id
        col.bank_code = new_ag.bank_code
        col.bank_name = new_ag.bank_name
        db.add(
            CollateralAgreementHistory(
                asset_id=col.asset_id,
                from_agreement_id=old_ag.agreement_id,
                from_agreement_number=old_ag.agreement_number,
                to_agreement_id=new_ag.agreement_id,
                to_agreement_number=new_ag.agreement_number,
                bank_code=new_ag.bank_code,
                action_type="ROLLOVER_TRANSFER",
                effective_date=new_ag.effective_from,
                notes=f"Chuyển tiếp TSĐB khi tái cấp từ HĐTD hết hạn {old_ag.agreement_number} sang HĐTD mới {new_ag.agreement_number}.",
                performed_by="Chị Cẩm Nhung",
            )
        )

    await sync_facilities_to_agreements(db, target_bank_code=new_ag.bank_code)
    await db.commit()
    await db.refresh(new_ag)

    all_ags = (await db.execute(select(CreditAgreement))).scalars().all()
    all_map = {a.agreement_id: a.agreement_number for a in all_ags}
    return await _build_agreement_response(new_ag, all_map, db)


# =============================================================================
# ENDPOINTS 2: HỒ SƠ HẠN MỨC (CREDIT LIMIT DOSSIERS)
# =============================================================================

def _format_dossier_response(dos: CreditLimitDossier, ag_number: Optional[str]) -> CreditLimitDossierResponse:
    try:
        raw_cl = json.loads(dos.checklist_json or "[]")
    except Exception:
        raw_cl = DEFAULT_DOSSIER_CHECKLIST
    checklist = [ChecklistItemSchema(**item) for item in raw_cl]
    total_req = len(checklist)
    done_cnt = sum(1 for item in checklist if item.is_completed)
    pct = int(round((done_cnt / total_req) * 100)) if total_req > 0 else 0

    return CreditLimitDossierResponse(
        dossier_id=dos.dossier_id,
        dossier_uuid=dos.dossier_uuid,
        agreement_id=dos.agreement_id,
        agreement_number=ag_number,
        bank_code=dos.bank_code,
        bank_name=dos.bank_name,
        borrower_name=dos.borrower_name,
        dossier_code=dos.dossier_code,
        dossier_title=dos.dossier_title,
        dossier_type=dos.dossier_type,
        proposed_limit_amount=dos.proposed_limit_amount,
        approved_limit_amount=dos.approved_limit_amount,
        submission_date=dos.submission_date,
        approval_date=dos.approval_date,
        expiry_review_date=dos.expiry_review_date,
        status=dos.status,
        checklist=checklist,
        completion_pct=pct,
        responsible_person=dos.responsible_person,
        notes=dos.notes,
        files=[CreditLimitDossierFileResponse.model_validate(f) for f in dos.files],
        created_at=dos.created_at,
        updated_at=dos.updated_at,
    )


@router.get("/dossiers", response_model=List[CreditLimitDossierResponse])
async def list_credit_limit_dossiers(
    bank_code: Optional[str] = Query(None),
    borrower_name: Optional[str] = Query(None),
    agreement_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await ensure_credit_limit_seed_data(db)

    stmt = (
        select(CreditLimitDossier)
        .options(selectinload(CreditLimitDossier.files), selectinload(CreditLimitDossier.agreement))
        .order_by(desc(CreditLimitDossier.created_at))
    )
    if bank_code:
        stmt = stmt.where(CreditLimitDossier.bank_code == bank_code)
    if borrower_name:
        stmt = stmt.where(CreditLimitDossier.borrower_name == borrower_name)
    if agreement_id:
        stmt = stmt.where(CreditLimitDossier.agreement_id == agreement_id)

    dossiers = (await db.execute(stmt)).scalars().all()
    return [
        _format_dossier_response(d, d.agreement.agreement_number if d.agreement else None)
        for d in dossiers
    ]


@router.post("/dossiers", response_model=CreditLimitDossierResponse, status_code=status.HTTP_201_CREATED)
async def create_credit_limit_dossier(
    payload: CreditLimitDossierCreate,
    db: AsyncSession = Depends(get_db),
):
    checklist_data = (
        [item.model_dump() for item in payload.checklist]
        if payload.checklist is not None
        else DEFAULT_DOSSIER_CHECKLIST
    )
    dos = CreditLimitDossier(
        agreement_id=payload.agreement_id,
        bank_code=payload.bank_code.strip().upper(),
        bank_name=payload.bank_name.strip(),
        borrower_name=payload.borrower_name.strip(),
        dossier_code=payload.dossier_code.strip(),
        dossier_title=payload.dossier_title.strip(),
        dossier_type=payload.dossier_type,
        proposed_limit_amount=payload.proposed_limit_amount,
        approved_limit_amount=payload.approved_limit_amount,
        submission_date=payload.submission_date,
        approval_date=payload.approval_date,
        expiry_review_date=payload.expiry_review_date,
        status=payload.status,
        checklist_json=json.dumps(checklist_data, ensure_ascii=False),
        responsible_person=payload.responsible_person,
        notes=payload.notes,
    )
    db.add(dos)
    await db.commit()

    stmt = (
        select(CreditLimitDossier)
        .options(selectinload(CreditLimitDossier.files), selectinload(CreditLimitDossier.agreement))
        .where(CreditLimitDossier.dossier_id == dos.dossier_id)
    )
    dos_loaded = (await db.execute(stmt)).scalar_one()
    return _format_dossier_response(dos_loaded, dos_loaded.agreement.agreement_number if dos_loaded.agreement else None)


@router.put("/dossiers/{dossier_id}", response_model=CreditLimitDossierResponse)
async def update_credit_limit_dossier(
    dossier_id: int,
    payload: CreditLimitDossierUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CreditLimitDossier)
        .options(selectinload(CreditLimitDossier.files), selectinload(CreditLimitDossier.agreement))
        .where(CreditLimitDossier.dossier_id == dossier_id)
    )
    dos = (await db.execute(stmt)).scalar_one_or_none()
    if not dos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Bộ hồ sơ hạn mức.")

    data = payload.model_dump(exclude_unset=True)
    if "checklist" in data and data["checklist"] is not None:
        dos.checklist_json = json.dumps(data.pop("checklist"), ensure_ascii=False)
    for k, v in data.items():
        setattr(dos, k, v)

    await db.commit()
    await db.refresh(dos)
    return _format_dossier_response(dos, dos.agreement.agreement_number if dos.agreement else None)


@router.delete("/dossiers/{dossier_id}")
async def delete_credit_limit_dossier(
    dossier_id: int,
    db: AsyncSession = Depends(get_db),
):
    dos = (await db.execute(select(CreditLimitDossier).where(CreditLimitDossier.dossier_id == dossier_id))).scalar_one_or_none()
    if not dos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Bộ hồ sơ hạn mức.")
    await db.delete(dos)
    await db.commit()
    return {"message": "Đã xóa Bộ hồ sơ hạn mức thành công."}


@router.post("/dossiers/{dossier_id}/files", response_model=CreditLimitDossierFileResponse)
async def upload_dossier_file(
    dossier_id: int,
    file: UploadFile = File(...),
    category: str = Form("LEGAL"),
    description: Optional[str] = Form(None),
    uploaded_by: str = Form("Chị Cẩm Nhung"),
    db: AsyncSession = Depends(get_db),
):
    dos = (await db.execute(select(CreditLimitDossier).where(CreditLimitDossier.dossier_id == dossier_id))).scalar_one_or_none()
    if not dos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Bộ hồ sơ hạn mức.")

    content = await file.read()
    f_uuid = uuid.uuid4()
    fname = file.filename or "document.pdf"
    storage_path = f"credit_limit_dossiers/{dos.bank_code}/{dos.dossier_id}/{f_uuid}_{fname}"
    save_statement_bytes(storage_path, content, content_type=file.content_type or "application/pdf")

    f_rec = CreditLimitDossierFile(
        file_uuid=f_uuid,
        dossier_id=dossier_id,
        category=category,
        file_name=fname,
        storage_path=storage_path,
        file_size_bytes=len(content),
        mime_type=file.content_type or "application/pdf",
        description=description,
        uploaded_by=uploaded_by,
    )
    db.add(f_rec)

    # Tự động đánh dấu hoàn thành mục checklist tương ứng
    try:
        cl = json.loads(dos.checklist_json or "[]")
        for item in cl:
            if item.get("category") == category or item.get("key") == category:
                item["is_completed"] = True
        dos.checklist_json = json.dumps(cl, ensure_ascii=False)
    except Exception:
        pass

    await db.commit()
    await db.refresh(f_rec)
    return CreditLimitDossierFileResponse.model_validate(f_rec)


@router.delete("/dossiers/files/{file_id}")
async def delete_dossier_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
):
    f_rec = (await db.execute(select(CreditLimitDossierFile).where(CreditLimitDossierFile.file_id == file_id))).scalar_one_or_none()
    if not f_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp đính kèm.")
    await db.delete(f_rec)
    await db.commit()
    return {"message": "Đã xóa tệp chứng từ khỏi bộ hồ sơ hạn mức."}


# =============================================================================
# ENDPOINTS 3: TÀI SẢN ĐẢM BẢO (COLLATERAL ASSETS)
# =============================================================================

def _format_collateral_response(col: CollateralAsset) -> CollateralAssetResponse:
    days_since, req_reval, warning_msg = _compute_collateral_revaluation(
        col.latest_valuation_date, col.collateral_status
    )
    ag_num = col.agreement.agreement_number if col.agreement else None
    ag_status = col.agreement.status if col.agreement else None
    ag_eff_to = col.agreement.effective_to if col.agreement else None
    if col.agreement and col.agreement.effective_to < date.today():
        ag_status = "EXPIRED"

    return CollateralAssetResponse(
        asset_id=col.asset_id,
        asset_uuid=col.asset_uuid,
        asset_code=col.asset_code,
        asset_name=col.asset_name,
        asset_type=col.asset_type,
        owner_name=col.owner_name,
        owner_id_or_tax_code=col.owner_id_or_tax_code,
        ownership_relation=col.ownership_relation,
        borrower_name=col.borrower_name,
        bank_code=col.bank_code,
        bank_name=col.bank_name,
        agreement_id=col.agreement_id,
        agreement_number=ag_num,
        agreement_status=ag_status,
        agreement_effective_to=ag_eff_to,
        appraised_value=col.appraised_value,
        ltv_ratio=col.ltv_ratio,
        max_secured_loan_value=col.max_secured_loan_value,
        currency=col.currency,
        collateral_status=col.collateral_status,
        latest_valuation_date=col.latest_valuation_date,
        days_since_valuation=days_since,
        requires_revaluation=req_reval,
        revaluation_warning=warning_msg,
        certificate_number=col.certificate_number,
        certificate_issue_date=col.certificate_issue_date,
        certificate_issued_by=col.certificate_issued_by,
        address=col.address,
        land_area_m2=col.land_area_m2,
        google_maps_url=col.google_maps_url,
        latitude=col.latitude,
        longitude=col.longitude,
        notes=col.notes,
        created_at=col.created_at,
        updated_at=col.updated_at,
        valuations=[CollateralValuationResponse.model_validate(v) for v in col.valuations],
        documents=[CollateralDocumentResponse.model_validate(d) for d in col.documents],
        agreement_history=[CollateralAgreementHistoryResponse.model_validate(h) for h in col.agreement_history],
    )


@router.get("/collaterals", response_model=List[CollateralAssetResponse])
async def list_collateral_assets(
    bank_code: Optional[str] = Query(None),
    collateral_status: Optional[str] = Query(None),
    requires_revaluation: Optional[bool] = Query(None),
    agreement_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await ensure_credit_limit_seed_data(db)

    stmt = (
        select(CollateralAsset)
        .options(
            selectinload(CollateralAsset.agreement),
            selectinload(CollateralAsset.valuations),
            selectinload(CollateralAsset.documents),
            selectinload(CollateralAsset.agreement_history),
        )
        .order_by(CollateralAsset.asset_code)
    )
    if bank_code:
        stmt = stmt.where(CollateralAsset.bank_code == bank_code)
    if collateral_status:
        stmt = stmt.where(CollateralAsset.collateral_status == collateral_status)
    if agreement_id:
        stmt = stmt.where(CollateralAsset.agreement_id == agreement_id)

    assets = (await db.execute(stmt)).scalars().all()
    results = []
    for a in assets:
        resp = _format_collateral_response(a)
        if requires_revaluation is not None and resp.requires_revaluation != requires_revaluation:
            continue
        results.append(resp)
    return results


@router.post("/collaterals", response_model=CollateralAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_collateral_asset(
    payload: CollateralAssetCreate,
    db: AsyncSession = Depends(get_db),
):
    dup = (
        await db.execute(select(CollateralAsset).where(CollateralAsset.asset_code == payload.asset_code.strip()))
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã tài sản đảm bảo '{payload.asset_code}' đã tồn tại.",
        )

    bank_code = payload.bank_code.strip().upper() if payload.bank_code else None
    bank_name = payload.bank_name.strip() if payload.bank_name else None
    ag_number = None

    # Ràng buộc: Mỗi tài sản chỉ thế chấp tại 1 ngân hàng, gắn liền với Hợp đồng tín dụng của ngân hàng đó
    if payload.agreement_id:
        ag = (
            await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == payload.agreement_id))
        ).scalar_one_or_none()
        if not ag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hợp đồng tín dụng được chọn không tồn tại.")
        bank_code = ag.bank_code
        bank_name = ag.bank_name
        ag_number = ag.agreement_number

    max_secured = (payload.appraised_value * payload.ltv_ratio / Decimal("100.00")).quantize(Decimal("0.01"))

    asset = CollateralAsset(
        asset_code=payload.asset_code.strip(),
        asset_name=payload.asset_name.strip(),
        asset_type=payload.asset_type,
        owner_name=payload.owner_name.strip(),
        owner_id_or_tax_code=payload.owner_id_or_tax_code,
        ownership_relation=payload.ownership_relation,
        borrower_name=payload.borrower_name,
        bank_code=bank_code,
        bank_name=bank_name,
        agreement_id=payload.agreement_id,
        appraised_value=payload.appraised_value,
        ltv_ratio=payload.ltv_ratio,
        max_secured_loan_value=max_secured,
        collateral_status=payload.collateral_status,
        latest_valuation_date=payload.latest_valuation_date,
        certificate_number=payload.certificate_number,
        certificate_issue_date=payload.certificate_issue_date,
        certificate_issued_by=payload.certificate_issued_by,
        address=payload.address,
        land_area_m2=payload.land_area_m2,
        google_maps_url=payload.google_maps_url,
        latitude=payload.latitude,
        longitude=payload.longitude,
        notes=payload.notes,
    )
    db.add(asset)
    await db.flush()

    if payload.agreement_id:
        db.add(
            CollateralAgreementHistory(
                asset_id=asset.asset_id,
                from_agreement_id=None,
                from_agreement_number=None,
                to_agreement_id=payload.agreement_id,
                to_agreement_number=ag_number,
                bank_code=bank_code,
                action_type="INITIAL_MORTGAGE",
                effective_date=date.today(),
                notes=f"Gắn tài sản đảm bảo vào Hợp đồng tín dụng {ag_number} tại {bank_name}.",
                performed_by="Chị Cẩm Nhung",
            )
        )

    await db.commit()

    stmt = (
        select(CollateralAsset)
        .options(
            selectinload(CollateralAsset.agreement),
            selectinload(CollateralAsset.valuations),
            selectinload(CollateralAsset.documents),
            selectinload(CollateralAsset.agreement_history),
        )
        .where(CollateralAsset.asset_id == asset.asset_id)
    )
    loaded = (await db.execute(stmt)).scalar_one()
    return _format_collateral_response(loaded)


@router.put("/collaterals/{asset_id}", response_model=CollateralAssetResponse)
async def update_collateral_asset(
    asset_id: int,
    payload: CollateralAssetUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CollateralAsset)
        .options(
            selectinload(CollateralAsset.agreement),
            selectinload(CollateralAsset.valuations),
            selectinload(CollateralAsset.documents),
            selectinload(CollateralAsset.agreement_history),
        )
        .where(CollateralAsset.asset_id == asset_id)
    )
    asset = (await db.execute(stmt)).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Tài sản đảm bảo.")

    old_ag_id = asset.agreement_id
    old_ag_num = asset.agreement.agreement_number if asset.agreement else None

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(asset, k, v)

    # Cập nhật lại max_secured_loan_value từ appraised_value và ltv_ratio độc lập trên tài sản
    asset.max_secured_loan_value = (
        (asset.appraised_value or Decimal("0.00")) * (asset.ltv_ratio or Decimal("0.00")) / Decimal("100.00")
    ).quantize(Decimal("0.01"))

    if "agreement_id" in data and data["agreement_id"] != old_ag_id:
        new_ag_num = None
        if data["agreement_id"]:
            new_ag = (
                await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == data["agreement_id"]))
            ).scalar_one_or_none()
            if new_ag:
                asset.bank_code = new_ag.bank_code
                asset.bank_name = new_ag.bank_name
                new_ag_num = new_ag.agreement_number
        db.add(
            CollateralAgreementHistory(
                asset_id=asset.asset_id,
                from_agreement_id=old_ag_id,
                from_agreement_number=old_ag_num,
                to_agreement_id=data["agreement_id"],
                to_agreement_number=new_ag_num,
                bank_code=asset.bank_code,
                action_type="ROLLOVER_TRANSFER" if old_ag_id and data["agreement_id"] else "MANUAL_REASSIGN",
                effective_date=date.today(),
                notes=f"Cập nhật liên kết Hợp đồng tín dụng từ {old_ag_num or 'Chưa gắn'} sang {new_ag_num or 'Giải chấp'}.",
                performed_by="Chị Cẩm Nhung",
            )
        )

    await db.commit()
    loaded = (await db.execute(stmt)).scalar_one()
    return _format_collateral_response(loaded)


@router.post("/collaterals/{asset_id}/transfer-agreement", response_model=CollateralAssetResponse)
async def transfer_collateral_to_new_agreement(
    asset_id: int,
    payload: CollateralTransferAgreementRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CollateralAsset)
        .options(
            selectinload(CollateralAsset.agreement),
            selectinload(CollateralAsset.valuations),
            selectinload(CollateralAsset.documents),
            selectinload(CollateralAsset.agreement_history),
        )
        .where(CollateralAsset.asset_id == asset_id)
    )
    asset = (await db.execute(stmt)).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Tài sản đảm bảo.")

    old_ag_id = asset.agreement_id
    old_ag_num = asset.agreement.agreement_number if asset.agreement else None
    new_ag_num = None

    if payload.action_type == "RELEASE" or not payload.to_agreement_id:
        asset.agreement_id = None
        asset.collateral_status = "RELEASED"
    else:
        new_ag = (
            await db.execute(select(CreditAgreement).where(CreditAgreement.agreement_id == payload.to_agreement_id))
        ).scalar_one_or_none()
        if not new_ag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Hợp đồng tín dụng đích.")
        asset.agreement_id = new_ag.agreement_id
        asset.bank_code = new_ag.bank_code
        asset.bank_name = new_ag.bank_name
        asset.collateral_status = "MORTGAGED"
        new_ag_num = new_ag.agreement_number

    db.add(
        CollateralAgreementHistory(
            asset_id=asset.asset_id,
            from_agreement_id=old_ag_id,
            from_agreement_number=old_ag_num,
            to_agreement_id=payload.to_agreement_id,
            to_agreement_number=new_ag_num,
            bank_code=asset.bank_code,
            action_type=payload.action_type,
            effective_date=payload.effective_date,
            notes=payload.notes or f"Chuyển tiếp TSĐB sang HĐTD {new_ag_num or 'Giải chấp'}",
            performed_by=payload.performed_by,
        )
    )

    await db.commit()
    loaded = (await db.execute(stmt)).scalar_one()
    return _format_collateral_response(loaded)


@router.delete("/collaterals/{asset_id}")
async def delete_collateral_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
):
    asset = (await db.execute(select(CollateralAsset).where(CollateralAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Tài sản đảm bảo.")
    await db.delete(asset)
    await db.commit()
    return {"message": f"Đã xóa Tài sản đảm bảo {asset.asset_code} thành công."}


# --- LỊCH SỬ ĐỊNH GIÁ TÀI SẢN (Độc lập với Giá trị thẩm định & LTV trên Tài sản) ---

@router.post("/collaterals/{asset_id}/valuations", response_model=CollateralValuationResponse, status_code=status.HTTP_201_CREATED)
async def add_collateral_valuation(
    asset_id: int,
    valuation_org: str = Form(...),
    valuation_amount: Decimal = Form(...),
    valuation_date: date = Form(...),
    valuer_name: Optional[str] = Form(None),
    report_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    created_by: str = Form("Chị Cẩm Nhung"),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    asset = (await db.execute(select(CollateralAsset).where(CollateralAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Tài sản đảm bảo.")

    report_file_name = None
    report_storage_path = None
    report_file_size = None
    report_mime_type = None

    if file and file.filename:
        content = await file.read()
        v_uuid = uuid.uuid4()
        report_file_name = file.filename
        report_storage_path = f"collateral_valuations/{asset.asset_code}/{v_uuid}_{file.filename}"
        report_file_size = len(content)
        report_mime_type = file.content_type or "application/pdf"
        save_statement_bytes(report_storage_path, content, content_type=report_mime_type)

    val_rec = CollateralValuation(
        asset_id=asset_id,
        valuation_org=valuation_org.strip(),
        valuation_amount=valuation_amount,
        valuation_date=valuation_date,
        valuer_name=valuer_name,
        report_number=report_number,
        report_file_name=report_file_name,
        report_storage_path=report_storage_path,
        report_file_size=report_file_size,
        report_mime_type=report_mime_type,
        notes=notes,
        created_by=created_by,
    )
    db.add(val_rec)
    # Lưu ý: Theo đúng yêu cầu của người dùng, Giá trị thẩm định (appraised_value) và LTV (ltv_ratio) trên Tài sản
    # được nhập độc lập với bảng Lịch sử định giá (không tự động ghi đè appraised_value/ltv_ratio).
    # Chỉ cập nhật latest_valuation_date nếu ngày định giá mới lớn hơn ngày định giá gần nhất hiện tại (hoặc chưa có).
    if not asset.latest_valuation_date or valuation_date > asset.latest_valuation_date:
        asset.latest_valuation_date = valuation_date

    await db.commit()
    await db.refresh(val_rec)
    return CollateralValuationResponse.model_validate(val_rec)


@router.delete("/collaterals/valuations/{valuation_id}")
async def delete_collateral_valuation(
    valuation_id: int,
    db: AsyncSession = Depends(get_db),
):
    val_rec = (
        await db.execute(select(CollateralValuation).where(CollateralValuation.valuation_id == valuation_id))
    ).scalar_one_or_none()
    if not val_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bản ghi Lịch sử định giá.")
    await db.delete(val_rec)
    await db.commit()
    return {"message": "Đã xóa bản ghi Lịch sử định giá."}


@router.get("/collaterals/valuations/{valuation_id}/download")
async def download_valuation_report(
    valuation_id: int,
    db: AsyncSession = Depends(get_db),
):
    val_rec = (
        await db.execute(select(CollateralValuation).where(CollateralValuation.valuation_id == valuation_id))
    ).scalar_one_or_none()
    if not val_rec or not val_rec.report_file_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bản ghi này chưa có File Biên bản định giá.")

    try:
        if val_rec.report_storage_path:
            raw_bytes = read_statement_bytes(val_rec.report_storage_path)
        else:
            raise FileNotFoundError()
    except Exception:
        # Tạo PDF mẫu nếu là dữ liệu seed demo
        demo_text = f"BIEN BAN DINH GIA TAI SAN\nTo chuc: {val_rec.valuation_org}\nGia tri: {val_rec.valuation_amount:,.0f} VND\nNgay dinh gia: {val_rec.valuation_date}"
        raw_bytes = demo_text.encode("utf-8")

    return StreamingResponse(
        io.BytesIO(raw_bytes),
        media_type=val_rec.report_mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{val_rec.report_file_name}"'},
    )


# --- BỘ HỒ SƠ TÀI SẢN (File Sổ đỏ/Sổ hồng, Ảnh chụp thực tế, HĐ thế chấp) ---

@router.post("/collaterals/{asset_id}/documents", response_model=CollateralDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_collateral_document(
    asset_id: int,
    file: UploadFile = File(...),
    doc_category: str = Form("RED_BOOK"),
    description: Optional[str] = Form(None),
    uploaded_by: str = Form("Chị Cẩm Nhung"),
    db: AsyncSession = Depends(get_db),
):
    asset = (await db.execute(select(CollateralAsset).where(CollateralAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Tài sản đảm bảo.")

    content = await file.read()
    d_uuid = uuid.uuid4()
    fname = file.filename or "asset_doc.pdf"
    storage_path = f"collateral_docs/{asset.asset_code}/{d_uuid}_{fname}"
    mime_type = file.content_type or "application/pdf"
    save_statement_bytes(storage_path, content, content_type=mime_type)

    doc_rec = CollateralDocument(
        doc_uuid=d_uuid,
        asset_id=asset_id,
        doc_category=doc_category,
        file_name=fname,
        storage_path=storage_path,
        file_size_bytes=len(content),
        mime_type=mime_type,
        description=description,
        uploaded_by=uploaded_by,
    )
    db.add(doc_rec)
    await db.commit()
    await db.refresh(doc_rec)
    return CollateralDocumentResponse.model_validate(doc_rec)


@router.delete("/collaterals/documents/{doc_id}")
async def delete_collateral_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
):
    doc_rec = (
        await db.execute(select(CollateralDocument).where(CollateralDocument.doc_id == doc_id))
    ).scalar_one_or_none()
    if not doc_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu trong Bộ hồ sơ tài sản.")
    await db.delete(doc_rec)
    await db.commit()
    return {"message": "Đã xóa tệp khỏi Bộ hồ sơ tài sản."}


@router.get("/collaterals/documents/{doc_id}/download")
async def download_collateral_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
):
    doc_rec = (
        await db.execute(select(CollateralDocument).where(CollateralDocument.doc_id == doc_id))
    ).scalar_one_or_none()
    if not doc_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tệp tài liệu.")

    try:
        raw_bytes = read_statement_bytes(doc_rec.storage_path)
    except Exception:
        raw_bytes = f"HO SO TAI SAN DAM BAO: {doc_rec.file_name}\nMo ta: {doc_rec.description or ''}".encode("utf-8")

    return StreamingResponse(
        io.BytesIO(raw_bytes),
        media_type=doc_rec.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc_rec.file_name}"'},
    )


# =============================================================================
# ENDPOINTS 4: CAM KẾT SAU VAY (POST-LOAN COVENANTS)
# =============================================================================

async def _build_covenant_response(cov: PostLoanCovenant, db: AsyncSession) -> PostLoanCovenantResponse:
    today = date.today()
    days_until = (cov.due_date - today).days

    auto_casa: Optional[Decimal] = None
    actual_val = cov.actual_value

    # Nếu là Cam kết Doanh số chuyển tiền CASA, tự động đối chiếu với bảng giao dịch ngân hàng (bank_transactions)
    if cov.covenant_category == "CASHFLOW_TURNOVER":
        tx_stmt = select(func.coalesce(func.sum(BankTransaction.credit_amount), Decimal("0.00"))).join(
            BankAccount, BankAccount.account_id == BankTransaction.account_id
        )
        if cov.linked_account_id:
            tx_stmt = tx_stmt.where(BankTransaction.account_id == cov.linked_account_id)
        else:
            tx_stmt = tx_stmt.where(BankAccount.bank_code == cov.bank_code)

        if cov.period_start:
            tx_stmt = tx_stmt.where(func.date(BankTransaction.transaction_date) >= cov.period_start)
        tx_stmt = tx_stmt.where(func.date(BankTransaction.transaction_date) <= cov.due_date)
        casa_sum = (await db.execute(tx_stmt)).scalar() or Decimal("0.00")
        auto_casa = casa_sum
        if casa_sum > Decimal("0.00") and (actual_val is None or actual_val == Decimal("0.00")):
            actual_val = casa_sum

    achievement_pct: Optional[Decimal] = None
    if cov.target_value and cov.target_value > Decimal("0.00") and actual_val is not None:
        achievement_pct = (actual_val / cov.target_value * Decimal("100.00")).quantize(Decimal("0.01"))

    if cov.compliance_status == "COMPLIANT":
        computed_status = "COMPLIANT"
    elif cov.compliance_status == "BREACHED" or (days_until < 0 and (achievement_pct is None or achievement_pct < Decimal("100.00"))):
        computed_status = "BREACHED"
    elif days_until <= 7:
        computed_status = "DUE_SOON"
    else:
        computed_status = cov.compliance_status

    return PostLoanCovenantResponse(
        covenant_id=cov.covenant_id,
        covenant_uuid=cov.covenant_uuid,
        agreement_id=cov.agreement_id,
        agreement_number=cov.agreement.agreement_number if cov.agreement else None,
        loan_id=cov.loan_id,
        loan_contract_number=cov.loan.contract_number if cov.loan else None,
        bank_code=cov.bank_code,
        bank_name=cov.bank_name,
        borrower_name=cov.borrower_name,
        covenant_title=cov.covenant_title,
        covenant_category=cov.covenant_category,
        frequency=cov.frequency,
        linked_account_id=cov.linked_account_id,
        linked_account_number=cov.linked_account_number,
        period_start=cov.period_start,
        due_date=cov.due_date,
        days_until_due=days_until,
        target_value=cov.target_value,
        actual_value=actual_val,
        auto_casa_credit_turnover=auto_casa,
        achievement_pct=achievement_pct,
        unit=cov.unit,
        compliance_status=cov.compliance_status,
        computed_compliance_status=computed_status,
        evidence_file_name=cov.evidence_file_name,
        evidence_storage_path=cov.evidence_storage_path,
        responsible_person=cov.responsible_person,
        notes=cov.notes,
        created_at=cov.created_at,
        updated_at=cov.updated_at,
    )


@router.get("/covenants", response_model=List[PostLoanCovenantResponse])
async def list_post_loan_covenants(
    bank_code: Optional[str] = Query(None),
    covenant_category: Optional[str] = Query(None),
    agreement_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await ensure_credit_limit_seed_data(db)

    stmt = (
        select(PostLoanCovenant)
        .options(selectinload(PostLoanCovenant.agreement), selectinload(PostLoanCovenant.loan))
        .order_by(PostLoanCovenant.due_date)
    )
    if bank_code:
        stmt = stmt.where(PostLoanCovenant.bank_code == bank_code)
    if covenant_category:
        stmt = stmt.where(PostLoanCovenant.covenant_category == covenant_category)
    if agreement_id:
        stmt = stmt.where(PostLoanCovenant.agreement_id == agreement_id)

    covenants = (await db.execute(stmt)).scalars().all()
    results = []
    for c in covenants:
        results.append(await _build_covenant_response(c, db))
    return results


@router.post("/covenants", response_model=PostLoanCovenantResponse, status_code=status.HTTP_201_CREATED)
async def create_post_loan_covenant(
    payload: PostLoanCovenantCreate,
    db: AsyncSession = Depends(get_db),
):
    cov = PostLoanCovenant(
        agreement_id=payload.agreement_id,
        loan_id=payload.loan_id,
        bank_code=payload.bank_code.strip().upper(),
        bank_name=payload.bank_name.strip(),
        borrower_name=payload.borrower_name.strip(),
        covenant_title=payload.covenant_title.strip(),
        covenant_category=payload.covenant_category,
        frequency=payload.frequency,
        linked_account_id=payload.linked_account_id,
        linked_account_number=payload.linked_account_number,
        period_start=payload.period_start,
        due_date=payload.due_date,
        target_value=payload.target_value,
        actual_value=payload.actual_value,
        unit=payload.unit,
        compliance_status=payload.compliance_status,
        responsible_person=payload.responsible_person,
        notes=payload.notes,
    )
    db.add(cov)
    await db.commit()

    stmt = (
        select(PostLoanCovenant)
        .options(selectinload(PostLoanCovenant.agreement), selectinload(PostLoanCovenant.loan))
        .where(PostLoanCovenant.covenant_id == cov.covenant_id)
    )
    loaded = (await db.execute(stmt)).scalar_one()
    return await _build_covenant_response(loaded, db)


@router.put("/covenants/{covenant_id}", response_model=PostLoanCovenantResponse)
async def update_post_loan_covenant(
    covenant_id: int,
    payload: PostLoanCovenantUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PostLoanCovenant)
        .options(selectinload(PostLoanCovenant.agreement), selectinload(PostLoanCovenant.loan))
        .where(PostLoanCovenant.covenant_id == covenant_id)
    )
    cov = (await db.execute(stmt)).scalar_one_or_none()
    if not cov:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Cam kết sau vay.")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cov, k, v)

    await db.commit()
    loaded = (await db.execute(stmt)).scalar_one()
    return await _build_covenant_response(loaded, db)


@router.delete("/covenants/{covenant_id}")
async def delete_post_loan_covenant(
    covenant_id: int,
    db: AsyncSession = Depends(get_db),
):
    cov = (
        await db.execute(select(PostLoanCovenant).where(PostLoanCovenant.covenant_id == covenant_id))
    ).scalar_one_or_none()
    if not cov:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Cam kết sau vay.")
    await db.delete(cov)
    await db.commit()
    return {"message": "Đã xóa Cam kết sau vay thành công."}
