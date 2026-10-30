from datetime import datetime, date
from decimal import Decimal
import uuid
from sqlalchemy import BigInteger, String, Integer, Date, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

class BankStatementFile(Base):
    __tablename__ = "bank_statement_files"

    file_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    account_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("bank_accounts.account_id", ondelete="SET NULL"), nullable=True, index=True)
    template_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reconciliation_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    statement_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    statement_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    header_opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    header_closing_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    calculated_closing_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)

    total_credit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_debit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    total_transactions_count: Mapped[int] = mapped_column(Integer, default=0)

    processing_status: Mapped[str] = mapped_column(String(30), nullable=False, default="UPLOADED", index=True)
    reconciliation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    discrepancy_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"))
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    uploaded_by: Mapped[str] = mapped_column(String(100), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    account = relationship("BankAccount", back_populates="statement_files")
    transactions = relationship("BankTransaction", back_populates="statement_file", cascade="all, delete-orphan")

