from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import BigInteger, String, Date, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base

class CashLedger(Base):
    __tablename__ = "cash_ledger"

    cash_entry_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    linked_transaction_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("bank_transactions.transaction_id", ondelete="SET NULL"), nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False) # INFLOW / OUTFLOW
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    running_cash_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    receiver_payer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

