from datetime import datetime
from decimal import Decimal
from sqlalchemy import BigInteger, String, Boolean, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

class BankAccount(Base):
    __tablename__ = "bank_accounts"

    account_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    account_holder: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    tax_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, default="CORPORATE", index=True)
    currency: Mapped[str] = mapped_column(String(5), nullable=False, default="VND")
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    current_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    statement_files = relationship("BankStatementFile", back_populates="account")
    transactions = relationship("BankTransaction", back_populates="account")

