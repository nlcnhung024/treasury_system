from datetime import datetime
from decimal import Decimal
from sqlalchemy import BigInteger, String, Integer, Boolean, DateTime, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_type: Mapped[str] = mapped_column(String(10), nullable=False, index=True) # INCOME / EXPENSE
    category_name: Mapped[str] = mapped_column(String(150), nullable=False)
    color_code: Mapped[str] = mapped_column(String(10), default="#3B82F6")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("category_type", "category_name", name="uq_category_type_name"),
    )

    # Relationships
    rules = relationship("ClassificationRule", back_populates="category", cascade="all, delete-orphan")
    transactions = relationship("BankTransaction", back_populates="category")


class ClassificationRule(Base):
    __tablename__ = "classification_rules"

    rule_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("categories.category_id", ondelete="CASCADE"), nullable=False, index=True)
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=10, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    keyword_patterns: Mapped[str] = mapped_column(Text, nullable=False)
    match_type: Mapped[str] = mapped_column(String(20), nullable=False, default="CONTAINS") # CONTAINS, EXACT, REGEX
    target_bank_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    min_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    applies_to_flow: Mapped[str] = mapped_column(String(10), default="DEBIT") # ALL, CREDIT, DEBIT

    created_by: Mapped[str] = mapped_column(String(100), default="USER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    category = relationship("Category", back_populates="rules")

