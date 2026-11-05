# Tài liệu Dự án - Mục lục & Hướng dẫn Tra cứu Nhanh (Docs Index)

> **MỤC TIÊU TIẾT KIỆM TOKEN CHO AI:**  
> Không đọc toàn bộ file `docs/*.md` hay `api_contracts.yaml`. Chỉ tra cứu mục lục dưới đây và dùng `read_file` với khoảng dòng (`StartLine`, `EndLine`) hoặc `grep`/tìm kiếm từ khóa cụ thể.

---

## 1. Bản đồ Tài liệu Nghiệp vụ & Kiến trúc

| Tệp tài liệu | Kích thước | Nội dung chính | Khi nào cần đọc? |
|---|---|---|---|
| [`agent/PRODUCT_SPEC.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/agent/PRODUCT_SPEC.md) | ~57 KB | Đặc tả tổng quan sản phẩm, luồng người dùng, mô tả tính năng | Cần xem tổng quan tính năng hệ thống hoặc scope sản phẩm |
| [`docs/BRD.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/BRD.md) | ~109 KB | Yêu cầu nghiệp vụ chi tiết (sao kê ngân hàng, giải ngân, khế ước, hóa đơn, đối soát nợ) | Cần đối chiếu logic tính toán tài chính, quy tắc nghiệp vụ sâu |
| [`docs/Bank_Mapping_Matrix.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/Bank_Mapping_Matrix.md) | ~96 KB | Ma trận ánh xạ các định dạng sao kê/hồ sơ của từng ngân hàng (TPB, MBV, VPB, EVF...) | Khi sửa parser, parser config hoặc chuẩn hóa dữ liệu ngân hàng |
| [`docs/DEBT_REPAYMENT_BUSINESS_PROBLEM_AND_SOLUTION.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/DEBT_REPAYMENT_BUSINESS_PROBLEM_AND_SOLUTION.md) | ~8 KB | Bài toán và giải pháp nghiệp vụ đối soát trả nợ vay | Khi làm việc với màn hình hoặc logic Reconcile / Trả nợ |
| [`docs/api_contracts.yaml`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/api_contracts.yaml) | ~144 KB | Toàn bộ schema API REST, endpoints, request/response | Chỉ grep endpoint hoặc model DTO cần dùng |
| [`docs/SAD.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/SAD.md) | ~53 KB | System Architecture Document: kiến trúc phân tầng, luồng xử lý kỹ thuật | Xem kiến trúc hệ thống, message queue, xử lý bất đồng bộ |
| [`docs/architecture_spec.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/architecture_spec.md) | ~25 KB | Đặc tả kiến trúc kỹ thuật bổ trợ | Tham khảo bổ trợ SAD |
| [`docs/security_threat_modeling.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/security_threat_modeling.md) | ~50 KB | Mô hình đe dọa an toàn thông tin, bảo mật, RBAC | Khi làm nhiệm vụ audit bảo mật, phân quyền, mã hóa |
| [`database/schema.sql`](file:///c:/Users/Admin/OneDrive/Sao%20kê/database/schema.sql) | ~46 KB | Cấu trúc bảng CSDL, quan hệ, ENUM, index | Tra cứu định nghĩa bảng, kiểu dữ liệu, ràng buộc |

---

## 2. Chỉ dẫn Tra cứu Theo Nhiệm vụ (Task Routing)

1. **Parser & Ingestion dữ liệu:**
   - Đọc config tại: `backend/app/services/parser/bank_templates_config.yaml`
   - Chỉ đọc đoạn ngân hàng tương ứng trong `docs/Bank_Mapping_Matrix.md` (dùng grep tìm mã ngân hàng).
2. **API & Backend Controller:**
   - Tìm endpoint trong `docs/api_contracts.yaml` bằng grep đường dẫn URI hoặc operationId.
3. **CSDL & Models:**
   - Tra cứu trực tiếp bảng trong `database/schema.sql` (dùng grep `CREATE TABLE <table_name>`).
4. **Đối soát trả nợ & Khế ước:**
   - Đọc `docs/DEBT_REPAYMENT_BUSINESS_PROBLEM_AND_SOLUTION.md` trước. Chỉ mở `docs/BRD.md` khi cần công thức chi tiết.

