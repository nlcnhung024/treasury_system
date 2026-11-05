from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.bank import Bank
from app.schemas.bank import BankCreateRequest, BankItemResponse, BankUpdateRequest

router = APIRouter(prefix="/banks", tags=["Banks"])

@router.get("", response_model=List[BankItemResponse])
async def list_banks(
    active_only: bool = Query(True, description="Chỉ lấy các ngân hàng đang hoạt động"),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh mục các ngân hàng / tổ chức tín dụng liên kết (Banks Master Directory).
    """
    stmt = select(Bank)
    if active_only:
        stmt = stmt.where(Bank.is_active == True)
    stmt = stmt.order_by(Bank.bank_id.asc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{bank_id}", response_model=BankItemResponse)
async def get_bank(bank_id: int, db: AsyncSession = Depends(get_db)):
    """
    Lấy chi tiết một ngân hàng theo ID.
    """
    bank = await db.get(Bank, bank_id)
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy ngân hàng với ID {bank_id}.",
        )
    return bank

@router.post("", response_model=BankItemResponse, status_code=status.HTTP_201_CREATED)
async def create_bank(payload: BankCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Thêm mới một ngân hàng / tổ chức tín dụng vào danh mục hệ thống.
    """
    # Kiểm tra trùng lặp bank_code
    existing = await db.execute(select(Bank).where(Bank.bank_code == payload.bank_code.strip().upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã ngân hàng '{payload.bank_code}' đã tồn tại trong danh mục.",
        )

    bank = Bank(
        bank_code=payload.bank_code.strip().upper(),
        bank_name=payload.bank_name.strip(),
        branch_name=payload.branch_name.strip() if payload.branch_name else None,
        tax_code=payload.tax_code.strip() if payload.tax_code else None,
        short_name=payload.short_name.strip(),
        is_active=payload.is_active,
    )
    db.add(bank)
    await db.commit()
    await db.refresh(bank)
    return bank

@router.put("/{bank_id}", response_model=BankItemResponse)
async def update_bank(bank_id: int, payload: BankUpdateRequest, db: AsyncSession = Depends(get_db)):
    """
    Cập nhật thông tin ngân hàng trong danh mục.
    """
    bank = await db.get(Bank, bank_id)
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy ngân hàng với ID {bank_id}.",
        )

    if payload.bank_code is not None:
        new_code = payload.bank_code.strip().upper()
        if new_code != bank.bank_code:
            existing = await db.execute(select(Bank).where(Bank.bank_code == new_code))
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Mã ngân hàng '{new_code}' đã tồn tại ở bản ghi khác.",
                )
            bank.bank_code = new_code

    if payload.bank_name is not None:
        bank.bank_name = payload.bank_name.strip()
    if payload.branch_name is not None:
        bank.branch_name = payload.branch_name.strip() if payload.branch_name else None
    if payload.tax_code is not None:
        bank.tax_code = payload.tax_code.strip() if payload.tax_code else None
    if payload.short_name is not None:
        bank.short_name = payload.short_name.strip()
    if payload.is_active is not None:
        bank.is_active = payload.is_active

    await db.commit()
    await db.refresh(bank)
    return bank

@router.delete("/{bank_id}")
async def delete_bank(bank_id: int, db: AsyncSession = Depends(get_db)):
    """
    Xóa mềm (vô hiệu hóa) ngân hàng trong danh mục.
    """
    bank = await db.get(Bank, bank_id)
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy ngân hàng với ID {bank_id}.",
        )
    bank.is_active = False
    await db.commit()
    return {"message": f"Đã vô hiệu hóa ngân hàng '{bank.short_name}' ({bank.bank_code})."}
