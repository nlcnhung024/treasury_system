from datetime import datetime, date
from decimal import Decimal
import uuid
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import BigInteger, String, Integer, Date, DateTime, Numeric, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.invoice import LoanInvoiceAllocation, Invoice
    from app.models.transaction import BankTransaction


class CreditStatementFile(Base):
    __tablename__ = "credit_statement_files"

    file_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    template_code: Mapped[str] = mapped_column(String(50), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    statement_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_payable_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    calculated_principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_contracts_count: Mapped[int] = mapped_column(Integer, default=0)

    processing_status: Mapped[str] = mapped_column(String(30), nullable=False, default="UPLOADED", index=True)
    reconciliation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    discrepancy_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    items: Mapped[List["CreditStatementItem"]] = relationship("CreditStatementItem", back_populates="statement_file", cascade="all, delete-orphan")


class CreditFacility(Base):
    __tablename__ = "credit_facilities"
    __table_args__ = (
        UniqueConstraint("bank_code", "contract_number", name="uq_credit_facility_bank_contract"),
    )

    loan_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_number: Mapped[str] = mapped_column(String(50), nullable=False)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False)
    cif_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    loan_purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(5), nullable=False, default="VND")
    disbursement_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    maturity_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    term: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    interest_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.0000"))
    debt_group: Mapped[str] = mapped_column(String(10), nullable=False, default="1")
    loan_type: Mapped[str] = mapped_column(String(30), nullable=False, default="SHORT_TERM")
    institution_type: Mapped[str] = mapped_column(String(30), nullable=False, default="BANK", index=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Hình thức trả lãi & Lịch trả lãi (Thông tư 14/2017/TT-NHNN)
    interest_payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="MONTHLY")
    monthly_interest_due_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    calculated_interest_due: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))

    snapshot_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    snapshot_principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    original_principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    total_repaid_principal: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    repaid_before_snapshot: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    repaid_after_snapshot: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    current_principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    accrued_interest: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    next_repayment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    next_principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    next_interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_repayment_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    items: Mapped[List["CreditStatementItem"]] = relationship("CreditStatementItem", back_populates="loan")
    dossier_documents: Mapped[List["DisbursementDocument"]] = relationship("DisbursementDocument", back_populates="loan", cascade="all, delete-orphan")
    allocations: Mapped[List["LoanInvoiceAllocation"]] = relationship("LoanInvoiceAllocation", back_populates="loan", cascade="all, delete-orphan")
    repayments: Mapped[List["LoanRepaymentHistory"]] = relationship("LoanRepaymentHistory", back_populates="loan", cascade="all, delete-orphan")


class CreditStatementItem(Base):
    __tablename__ = "credit_statement_items"

    item_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("credit_statement_files.file_id", ondelete="CASCADE"), nullable=False, index=True)
    loan_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("credit_facilities.loan_id", ondelete="SET NULL"), nullable=True, index=True)
    contract_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    disbursement_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    maturity_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    term: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    interest_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.0000"))
    debt_group: Mapped[str] = mapped_column(String(10), default="1")
    loan_purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    interest_payment_method: Mapped[Optional[str]] = mapped_column(String(20), default="MONTHLY")
    monthly_interest_due_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    calculated_interest_due: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    principal_balance_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    accrued_interest: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    next_principal_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    next_interest_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_due_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    currency: Mapped[str] = mapped_column(String(5), nullable=False, default="VND")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    statement_file: Mapped["CreditStatementFile"] = relationship("CreditStatementFile", back_populates="items")
    loan: Mapped[Optional["CreditFacility"]] = relationship("CreditFacility", back_populates="items")


class DisbursementDocument(Base):
    __tablename__ = "disbursement_documents"

    document_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    loan_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("credit_facilities.loan_id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("invoices.invoice_id", ondelete="SET NULL"), nullable=True, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, default="DISBURSEMENT_RECORD")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    invoice_total_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    loan: Mapped["CreditFacility"] = relationship("CreditFacility", back_populates="dossier_documents")
    invoice: Mapped[Optional["Invoice"]] = relationship("Invoice", back_populates="disbursement_docs")


class LoanRepaymentHistory(Base):
    __tablename__ = "loan_repayment_history"

    repayment_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    loan_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("credit_facilities.loan_id", ondelete="RESTRICT"), nullable=False, index=True)
    transaction_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bank_transactions.transaction_id", ondelete="RESTRICT"), unique=True, nullable=False, index=True)
    contract_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False)
    repayment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    repayment_timing: Mapped[str] = mapped_column(String(20), nullable=False, default="POST_SNAPSHOT")
    snapshot_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    previous_principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    remaining_principal_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reconciled_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    loan: Mapped["CreditFacility"] = relationship("CreditFacility", back_populates="repayments")
    transaction: Mapped["BankTransaction"] = relationship("BankTransaction")


