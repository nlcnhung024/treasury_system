from typing import List
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/templates", tags=["Templates"])

class TemplateInfo(BaseModel):
    bank_code: str
    bank_name: str
    template_code: str
    reconciliation_mode: str
    file_extension: str
    header_row_index: int
    description: str

@router.get("", response_model=List[TemplateInfo])
async def list_templates():
    return [
        TemplateInfo(
            bank_code="MBB",
            bank_name="Ngân hàng TMCP Quân Đội",
            template_code="MBB_CORP_XLSX",
            reconciliation_mode="MODE_1_FULL_HEADER_FOOTER",
            file_extension=".xlsx",
            header_row_index=14,
            description="Mẫu sao kê khách hàng doanh nghiệp MBBank"
        ),
        TemplateInfo(
            bank_code="MBB",
            bank_name="Ngân hàng TMCP Quân Đội (Cá nhân)",
            template_code="MBB_PERSONAL_XLSX",
            reconciliation_mode="MODE_4_TOTAL_FLOW_ONLY",
            file_extension=".xlsx",
            header_row_index=15,
            description="Mẫu sao kê cá nhân bà Nguyễn Thị Lan Anh tại MBBank"
        ),
        TemplateInfo(
            bank_code="MBV",
            bank_name="Ngân hàng TNHH MTV Shinhan Việt Nam",
            template_code="MBV_CORP_XLSX",
            reconciliation_mode="MODE_2_INFERRED_OPENING_CLOSING",
            file_extension=".xlsx",
            header_row_index=11,
            description="Mẫu sao kê Shinhan Bank nội suy số dư ĐK/CK"
        ),
        TemplateInfo(
            bank_code="VPB",
            bank_name="Ngân hàng TMCP Việt Nam Thịnh Vượng",
            template_code="VPB_CORP_XLSX",
            reconciliation_mode="MODE_5_CUTOFF_INTEREST_INCLUDED",
            file_extension=".xlsx",
            header_row_index=16,
            description="Mẫu VPBank bút toán lãi đầu kỳ"
        ),
        TemplateInfo(
            bank_code="TPB",
            bank_name="Ngân hàng TMCP Tiên Phong",
            template_code="TPB_CORP_XLSX",
            reconciliation_mode="MODE_1_FULL_HEADER_FOOTER",
            file_extension=".xlsx",
            header_row_index=18,
            description="Mẫu TPBank đầy đủ Header/Footer"
        ),
        TemplateInfo(
            bank_code="CTG",
            bank_name="Ngân hàng TMCP Công Thương Việt Nam (VietinBank)",
            template_code="CTG_EFAST_XLS",
            reconciliation_mode="MODE_1_FULL_HEADER_FOOTER",
            file_extension=".xls",
            header_row_index=21,
            description="Mẫu VietinBank eFast định dạng BIFF8"
        ),
        TemplateInfo(
            bank_code="SHB",
            bank_name="Ngân hàng TMCP Sài Gòn - Hà Nội",
            template_code="SHB_CORP_XLS",
            reconciliation_mode="MODE_3_DERIVED_RUNNING_BALANCE",
            file_extension=".xls",
            header_row_index=24,
            description="Mẫu SHB tính lũy kế ngược từ dòng cũ nhất"
        )
    ]

