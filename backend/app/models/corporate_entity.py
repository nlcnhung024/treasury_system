from datetime import datetime
from sqlalchemy import BigInteger, String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base

class CorporateEntity(Base):
    __tablename__ = "corporate_entities"

    entity_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    short_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tax_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, default="CORPORATE", index=True)
    is_holding_parent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    badge_label: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Thành viên")
    color_class: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
