from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import BigInteger, String, Boolean, Date, DateTime, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    transaction_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bank_statement_files.file_id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bank_accounts.account_id", ondelete="RESTRICT"), nullable=False, index=True)
    category_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("categories.category_id", ondelete="SET NULL"), nullable=True, index=True)

    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    counter_party: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    debit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    running_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    dedup_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_manual_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    applied_rule_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("classification_rules.rule_id", ondelete="SET NULL"), nullable=True)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("account_id", "dedup_hash", name="uq_transaction_dedup"),
    )

    # Relationships
    statement_file = relationship("BankStatementFile", back_populates="transactions")
    account = relationship("BankAccount", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

