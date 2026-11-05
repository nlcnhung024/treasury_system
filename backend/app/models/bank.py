from datetime import datetime
from sqlalchemy import BigInteger, String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Bank(Base):
    __tablename__ = "banks"

    bank_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bank_code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    bank_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    branch_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    tax_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    short_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    accounts = relationship("BankAccount", back_populates="bank")
    credit_facilities = relationship("CreditFacility", back_populates="bank")
