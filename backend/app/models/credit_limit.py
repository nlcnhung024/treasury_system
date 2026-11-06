from datetime import datetime, date
from decimal import Decimal
import uuid
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import (
    BigInteger,
    String,
    Integer,
    Date,
    DateTime,
    Numeric,
    Text,
    ForeignKey,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.bank import Bank
    from app.models.credit import CreditFacility
    from app.models.account import BankAccount


class CreditAgreement(Base):
    """Hợp đồng tín dụng khung / Hợp đồng hạn mức tín dụng tại từng Tổ chức tín dụng."""
    __tablename__ = "credit_agreements"
    __table_args__ = (
        UniqueConstraint("bank_code", "agreement_number", name="uq_credit_agreement_bank_number"),
    )

    agreement_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agreement_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    bank_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("banks.bank_id", ondelete="SET NULL"), nullable=True, index=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    agreement_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    agreement_name: Mapped[str] = mapped_column(String(255), nullable=False)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)

    # Cơ cấu hạn mức
    total_credit_limit: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    loan_sublimit: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    guarantee_sublimit: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    lc_sublimit: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(5), nullable=False, default="VND")

    # Thời gian hiệu lực (Khế ước có ngày giải ngân trong khoảng này tự động gán vào HĐTD)
    signed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    effective_to: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Lãi suất khung & điều khoản
    interest_rate_framework: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    collateral_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", index=True)
    # 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED', 'SETTLED'

    # Kế thừa / Tái cấp hạn mức
    parent_agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True
    )
    renewed_to_agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    facilities: Mapped[List["CreditFacility"]] = relationship("CreditFacility", back_populates="agreement")
    dossiers: Mapped[List["CreditLimitDossier"]] = relationship("CreditLimitDossier", back_populates="agreement", cascade="all, delete-orphan")
    collateral_assets: Mapped[List["CollateralAsset"]] = relationship("CollateralAsset", back_populates="agreement")
    covenants: Mapped[List["PostLoanCovenant"]] = relationship("PostLoanCovenant", back_populates="agreement", cascade="all, delete-orphan")


class CreditLimitDossier(Base):
    """Hồ sơ cấp / tái cấp hạn mức tín dụng gắn với Hợp đồng tín dụng hoặc Ngân hàng."""
    __tablename__ = "credit_limit_dossiers"

    dossier_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dossier_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True, index=True
    )
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    dossier_code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    dossier_title: Mapped[str] = mapped_column(String(255), nullable=False)
    dossier_type: Mapped[str] = mapped_column(String(40), nullable=False, default="RENEWAL")
    # 'NEW_LIMIT', 'RENEWAL', 'INCREASE_LIMIT', 'PERIODIC_REVIEW'

    proposed_limit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    approved_limit_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    submission_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    approval_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PREPARING", index=True)
    # 'PREPARING', 'SUBMITTED', 'NEED_SUPPLEMENT', 'APPROVED', 'REJECTED'

    checklist_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    responsible_person: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    agreement: Mapped[Optional["CreditAgreement"]] = relationship("CreditAgreement", back_populates="dossiers")
    files: Mapped[List["CreditLimitDossierFile"]] = relationship(
        "CreditLimitDossierFile", back_populates="dossier", cascade="all, delete-orphan"
    )


class CreditLimitDossierFile(Base):
    """Tệp chứng từ đính kèm trong Bộ hồ sơ hạn mức."""
    __tablename__ = "credit_limit_dossier_files"

    file_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    dossier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("credit_limit_dossiers.dossier_id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="LEGAL")
    # 'LEGAL', 'FINANCIAL_REPORT', 'BUSINESS_PLAN', 'BOARD_RESOLUTION', 'CREDIT_PROPOSAL', 'CREDIT_CONTRACT', 'OTHER'
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/pdf")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dossier: Mapped["CreditLimitDossier"] = relationship("CreditLimitDossier", back_populates="files")


class CollateralAsset(Base):
    """Tài sản đảm bảo tại các ngân hàng, gắn liền với Hợp đồng tín dụng (1 TSĐB chỉ thế chấp tại 1 Ngân hàng/HĐTD)."""
    __tablename__ = "collateral_assets"

    asset_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    asset_code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    asset_name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False, default="REAL_ESTATE_LAND", index=True)
    # 'REAL_ESTATE_LAND', 'FACTORY_INDUSTRIAL', 'MACHINERY_VEHICLE', 'DEPOSIT_SAVINGS', 'INVENTORY_RECEIVABLES', 'OTHER'

    # Chủ sở hữu tài sản
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    owner_id_or_tax_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ownership_relation: Mapped[str] = mapped_column(String(50), nullable=False, default="BORROWER_OWNED")
    # 'BORROWER_OWNED' (Chính chủ doanh nghiệp), 'THIRD_PARTY' (Bên thứ 3 bảo lãnh)
    borrower_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)

    # Ngân hàng nhận thế chấp & Hợp đồng tín dụng gắn liền (1 TSĐB chỉ thế chấp ở 1 Ngân hàng)
    bank_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Giá trị thẩm định hiện hành & LTV (Nhập độc lập với bảng Lịch sử định giá)
    appraised_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    ltv_ratio: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("70.00"))
    max_secured_loan_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    currency: Mapped[str] = mapped_column(String(5), nullable=False, default="VND")

    # Tình trạng: UNVALUED (Chưa định giá), VALUED (Đã định giá), MORTGAGED (Thế chấp), RELEASED (Giải chấp)
    collateral_status: Mapped[str] = mapped_column(String(30), nullable=False, default="MORTGAGED", index=True)
    latest_valuation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)

    # Thông tin giấy tờ & Định vị Google Map
    certificate_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    certificate_issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    certificate_issued_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    land_area_m2: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    google_maps_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    agreement: Mapped[Optional["CreditAgreement"]] = relationship("CreditAgreement", back_populates="collateral_assets")
    valuations: Mapped[List["CollateralValuation"]] = relationship(
        "CollateralValuation", back_populates="asset", cascade="all, delete-orphan", order_by="desc(CollateralValuation.valuation_date)"
    )
    documents: Mapped[List["CollateralDocument"]] = relationship(
        "CollateralDocument", back_populates="asset", cascade="all, delete-orphan"
    )
    agreement_history: Mapped[List["CollateralAgreementHistory"]] = relationship(
        "CollateralAgreementHistory", back_populates="asset", cascade="all, delete-orphan", order_by="desc(CollateralAgreementHistory.created_at)"
    )


class CollateralValuation(Base):
    """Lịch sử định giá của Tài sản đảm bảo (Tổ chức định giá, Giá trị định giá, Thời điểm định giá, File Biên bản)."""
    __tablename__ = "collateral_valuations"

    valuation_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    valuation_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    asset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("collateral_assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    valuation_org: Mapped[str] = mapped_column(String(255), nullable=False)
    valuation_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    valuer_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    report_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # File Biên bản định giá
    report_file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    report_storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    report_file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    report_mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset: Mapped["CollateralAsset"] = relationship("CollateralAsset", back_populates="valuations")


class CollateralDocument(Base):
    """Bộ hồ sơ tài sản (File Sổ đỏ/Sổ hồng, Ảnh chụp thực tế, Hợp đồng thế chấp, Đăng ký GDBĐ)."""
    __tablename__ = "collateral_documents"

    doc_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    doc_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    asset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("collateral_assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_category: Mapped[str] = mapped_column(String(50), nullable=False, default="RED_BOOK", index=True)
    # 'RED_BOOK' (Sổ đỏ/Sổ hồng), 'SITE_PHOTO' (Ảnh chụp thực tế), 'MORTGAGE_CONTRACT' (HĐ thế chấp), 'SECURITY_REGISTRATION' (Đăng ký GDBĐ), 'OTHER'
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/pdf")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset: Mapped["CollateralAsset"] = relationship("CollateralAsset", back_populates="documents")


class CollateralAgreementHistory(Base):
    """Lịch sử gắn kết và chuyển tiếp Tài sản đảm bảo qua các Hợp đồng tín dụng."""
    __tablename__ = "collateral_agreement_history"

    history_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("collateral_assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True
    )
    from_agreement_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    to_agreement_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="SET NULL"), nullable=True
    )
    to_agreement_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bank_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False, default="INITIAL_MORTGAGE")
    # 'INITIAL_MORTGAGE', 'ROLLOVER_TRANSFER', 'MANUAL_REASSIGN', 'RELEASE'
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    performed_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset: Mapped["CollateralAsset"] = relationship("CollateralAsset", back_populates="agreement_history")


class PostLoanCovenant(Base):
    """Cam kết sau vay (Doanh số dòng tiền CASA, Báo cáo định kỳ, Chỉ số tài chính, Bổ sung chứng từ sau giải ngân)."""
    __tablename__ = "post_loan_covenants"

    covenant_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    covenant_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    agreement_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("credit_agreements.agreement_id", ondelete="CASCADE"), nullable=False, index=True
    )
    loan_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("credit_facilities.loan_id", ondelete="SET NULL"), nullable=True, index=True
    )
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)

    covenant_title: Mapped[str] = mapped_column(String(255), nullable=False)
    covenant_category: Mapped[str] = mapped_column(String(50), nullable=False, default="CASHFLOW_TURNOVER", index=True)
    # 'CASHFLOW_TURNOVER', 'PERIODIC_REPORTING', 'FINANCIAL_RATIO', 'POST_DISBURSEMENT_DOC'

    frequency: Mapped[str] = mapped_column(String(30), nullable=False, default="QUARTERLY")
    # 'ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'

    # Liên kết Tài khoản ngân hàng để tự động tính Doanh số dòng tiền ghi Có (CASA)
    linked_account_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("bank_accounts.account_id", ondelete="SET NULL"), nullable=True
    )
    linked_account_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    target_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    actual_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="VND")
    # 'VND', '%', 'RATIO', 'DOCUMENT'

    compliance_status: Mapped[str] = mapped_column(String(30), nullable=False, default="IN_PROGRESS", index=True)
    # 'COMPLIANT', 'IN_PROGRESS', 'DUE_SOON', 'BREACHED'

    evidence_file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    evidence_storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    responsible_person: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    agreement: Mapped["CreditAgreement"] = relationship("CreditAgreement", back_populates="covenants")
    loan: Mapped[Optional["CreditFacility"]] = relationship("CreditFacility")
