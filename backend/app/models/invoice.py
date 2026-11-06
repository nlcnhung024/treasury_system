from datetime import datetime, date
from decimal import Decimal
import uuid
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import BigInteger, String, Integer, Date, DateTime, Numeric, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.credit import CreditFacility, DisbursementDocument


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("seller_tax_code", "invoice_series", "invoice_number", name="uq_invoice_seller_series_number"),
    )

    invoice_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    invoice_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    entity_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    invoice_series: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    invoice_template: Mapped[str] = mapped_column(String(20), nullable=False, default="1")
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    tax_authority_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Bên bán & Bên mua
    seller_tax_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    seller_name: Mapped[str] = mapped_column(String(255), nullable=False)
    seller_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    buyer_tax_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    buyer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Tiền tệ & Tài chính
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="VND")
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("1.0000"))
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    # Phân bổ nhận nợ
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    remaining_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    locked_bank_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="AVAILABLE", index=True)

    # Lưu trữ file XML & PDF
    xml_file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    xml_storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    xml_file_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    xml_file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    pdf_file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pdf_storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pdf_file_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pdf_file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    has_pdf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    raw_xml_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    items: Mapped[List["InvoiceItem"]] = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    allocations: Mapped[List["LoanInvoiceAllocation"]] = relationship("LoanInvoiceAllocation", back_populates="invoice")
    disbursement_docs: Mapped[List["DisbursementDocument"]] = relationship("DisbursementDocument", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    item_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("invoices.invoice_id", ondelete="CASCADE"), nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    item_name: Mapped[str] = mapped_column(String(500), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    unit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    tax_rate: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="items")


class LoanInvoiceAllocation(Base):
    __tablename__ = "loan_invoice_allocations"
    __table_args__ = (
        UniqueConstraint("loan_id", "invoice_id", name="uq_loan_invoice_allocation"),
    )

    allocation_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    allocation_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    loan_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("credit_facilities.loan_id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("invoices.invoice_id", ondelete="RESTRICT"), nullable=False, index=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    contract_number: Mapped[str] = mapped_column(String(50), nullable=False)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    allocation_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    loan: Mapped["CreditFacility"] = relationship("CreditFacility", back_populates="allocations")
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="allocations")

