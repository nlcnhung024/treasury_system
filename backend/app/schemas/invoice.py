from datetime import datetime, date
from decimal import Decimal
import uuid
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: int
    line_number: int
    item_name: str
    unit: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    subtotal: Decimal
    tax_rate: Optional[str] = None
    tax_amount: Decimal = Decimal("0.00")


class LoanAllocationItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    allocation_id: int
    loan_id: int
    invoice_id: int
    bank_code: str
    contract_number: str
    allocated_amount: Decimal
    allocation_date: date
    notes: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_series: Optional[str] = None
    seller_name: Optional[str] = None
    total_invoice_amount: Optional[Decimal] = None
    created_at: Optional[datetime] = None


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invoice_id: int
    invoice_uuid: uuid.UUID
    entity_id: Optional[int] = None
    invoice_number: str
    invoice_series: str
    invoice_template: str = "1"
    invoice_date: date
    tax_authority_code: Optional[str] = None

    seller_tax_code: str
    seller_name: str
    seller_address: Optional[str] = None
    buyer_tax_code: str
    buyer_name: str
    buyer_address: Optional[str] = None

    currency: str = "VND"
    exchange_rate: Decimal = Decimal("1.0000")
    subtotal_amount: Decimal = Decimal("0.00")
    tax_amount: Decimal = Decimal("0.00")
    total_amount: Decimal

    allocated_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal
    locked_bank_code: Optional[str] = None
    status: str = "AVAILABLE"  # 'AVAILABLE', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED'

    xml_file_name: Optional[str] = None
    pdf_file_name: Optional[str] = None
    has_pdf: bool = False
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    items: List[InvoiceItemResponse] = Field(default_factory=list)
    allocations: List[LoanAllocationItemResponse] = Field(default_factory=list)


class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int
    total_value: Decimal = Decimal("0.00")
    total_allocated: Decimal = Decimal("0.00")
    total_remaining: Decimal = Decimal("0.00")


class SingleAllocationItem(BaseModel):
    invoice_id: int
    allocated_amount: Decimal
    notes: Optional[str] = None


class LoanBatchAllocationRequest(BaseModel):
    allocations: List[SingleAllocationItem]


class LoanAllocatedInvoicesResponse(BaseModel):
    loan_id: int
    contract_number: str
    bank_code: str
    original_principal_balance: Decimal
    total_allocated_amount: Decimal
    difference_amount: Decimal
    is_fully_secured: bool
    status_message: str
    allocations: List[LoanAllocationItemResponse] = Field(default_factory=list)


class SyncInvoicesFromLoansResponse(BaseModel):
    total_scanned_documents: int
    total_xml_found: int
    newly_added_invoices: int
    already_existing_invoices: int
    linked_documents_count: int
    total_value_added: Decimal
    message: str

