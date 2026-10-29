# HỆ THỐNG MULTI-AGENT DỰ ÁN XỬ LÝ SAO KÊ NGÂN HÀNG

Dự án tự động hóa tiếp nhận file sao kê ngân hàng, đọc dữ liệu theo mẫu, làm sạch, lưu trữ và kết xuất báo cáo tài chính.

---

## 1. Nguồn Chân lý & Bộ Nguyên tắc Chung (Core Foundations)

Mọi Agent hoạt động trong dự án BẮT BUỘC phải nắm vững và tuân thủ các tài liệu nền tảng sau:

1. 📂 **[Thư mục Tài liệu Bối cảnh & Yêu cầu Dự án (`docs/`)](../docs/)**:
   * **Nguồn hiểu bối cảnh nghiệp vụ:** Chứa các tài liệu yêu cầu nền tảng như `docs/BRD.md` (Business Requirements Document), `docs/SRS.md` (Software Requirements Specification), `docs/PRD.md` (Product Requirements Document), Ma trận ánh xạ ngân hàng...
   * Toàn bộ Agent bắt buộc phải đọc các tài liệu này để hiểu sâu sắc mục tiêu, bối cảnh bài toán và kỳ vọng sản phẩm trước khi thực thi.

2. 📘 **[Tài liệu Mô tả & Yêu cầu Sản phẩm Chính thức (`PRODUCT_SPEC.md`)](./PRODUCT_SPEC.md)**:
   * **Nguồn chân lý nghiệp vụ thống nhất (Single Source of Truth):** Chứa toàn bộ mô tả bài toán, mục tiêu sản phẩm, luồng nghiệp vụ end-to-end, yêu cầu chi tiết của từng phân hệ (Upload, Parser, Cleansing, Database, Reporting) và các công thức đối soát kế toán.
   * Toàn bộ Agent không tự ý suy diễn hoặc thay đổi nghiệp vụ ngoài tài liệu này.

3. ⚙️ **[Bộ Nguyên tắc Kỹ thuật Chung (`common_rules.md`)](./common_rules.md)**:
   * **Bộ quy chuẩn kỹ thuật bắt buộc:** Tiêu chuẩn kiểu dữ liệu số học độ chính xác cao (`DECIMAL(18, 2)`), định dạng thời gian ISO 8601, nguyên tắc phân tách Object Storage độc lập với CSDL, chuẩn an toàn thông tin (chống SQLi, Formula/CSV Injection, XSS), quản lý transaction và chuẩn đặt tên.

---

## 2. Danh sách Agent & Bộ Quy chuẩn Kỹ thuật Riêng biệt (Technical Rules)

> **Lưu ý:** Các file `rules.md` dưới đây **chỉ quy định về mặt kỹ thuật, kiến trúc, kiểm định và lập trình**, hoàn toàn không chứa mô tả nghiệp vụ hay sản phẩm.

| STT | Agent Chuyên trách | Thư mục | Hồ sơ năng lực | Quy chuẩn Kỹ thuật Riêng |
| :---: | :--- | :--- | :---: | :---: |
| 1 | **Business Analyst** (`@BusinessAnalyst`) | [`agent/01_business_analyst/`](./01_business_analyst/) | [profile.md](./01_business_analyst/profile.md) | [rules.md](./01_business_analyst/rules.md) |
| 2 | **System & Data Architect** (`@SystemArchitect`) | [`agent/02_system_architect/`](./02_system_architect/) | [profile.md](./02_system_architect/profile.md) | [rules.md](./02_system_architect/rules.md) |
| 3 | **Data Parser & ETL Engineer** (`@DataParserEngineer`) | [`agent/03_data_parser_engineer/`](./03_data_parser_engineer/) | [profile.md](./03_data_parser_engineer/profile.md) | [rules.md](./03_data_parser_engineer/rules.md) |
| 4 | **Fullstack Developer** (`@FullstackDeveloper`) | [`agent/04_fullstack_developer/`](./04_fullstack_developer/) | [profile.md](./04_fullstack_developer/profile.md) | [rules.md](./04_fullstack_developer/rules.md) |
| 5 | **QA & Security Specialist** (`@QASecuritySpecialist`) | [`agent/05_qa_security_spec/`](./05_qa_security_spec/) | [profile.md](./05_qa_security_spec/profile.md) | [rules.md](./05_qa_security_spec/rules.md) |

---

## 3. Tóm tắt Tiêu chuẩn Kỹ thuật của từng Agent

* **`@BusinessAnalyst` ([rules.md](./01_business_analyst/rules.md)):** Chuẩn hóa tài liệu GFM, cấu trúc Data Dictionary kỹ thuật (Field, Type, Nullable, Regex), cú pháp Gherkin chuẩn (`Given/When/Then`) cho Acceptance Criteria, hệ thống mã định danh truy vết (`REQ-xxx`).
* **`@SystemArchitect` ([rules.md](./02_system_architect/rules.md)):** Chuẩn thiết kế CSDL 3NF, phân tầng Object Storage an toàn, cơ chế Message Queue với DLQ sau 3 lần retry, đặc tả OpenAPI 3.0 với HTTP Status Codes chuẩn mực.
* **`@DataParserEngineer` ([rules.md](./03_data_parser_engineer/rules.md)):** Cấm tải toàn bộ file vào RAM; bắt buộc đọc I/O Stream theo chunk (500–1.000 dòng); ép kiểu `Decimal` với `ROUND_HALF_UP`; chuẩn hóa chuỗi canonical SHA-256 chống trùng lặp; Parameterized Bulk Insert.
* **`@FullstackDeveloper` ([rules.md](./04_fullstack_developer/rules.md)):** Validate upload đa tầng (MIME + Magic Bytes); kỹ thuật escape dấu nháy đơn `'` chống Formula/CSV Injection khi xuất file; bắt buộc phân trang (`limit <= 100`); truy vấn aggregation trên CSDL; kết nối SSE/WebSocket.
* **`@QASecuritySpecialist` ([rules.md](./05_qa_security_spec/rules.md)):** Ngưỡng Code Coverage $\ge 85\%$; cô lập sandbox test CSDL và ẩn danh hóa dữ liệu mẫu; kiểm thử biên tải trọng (0 byte, 25MB $\pm$ 1KB, corrupted zip); audit bảo mật tự động (BOLA/IDOR và Formula Injection).

---

## 4. Sơ đồ Luồng Phối hợp (Workflow)

```
                       ┌──────────────────────────────────────────────┐
                       │          Thư mục Bối cảnh Dự án              │
                       │           docs/ (BRD, SRS, PRD)              │
                       └──────────────────────┬───────────────────────┘
                                              │ (Nắm bắt bối cảnh nghiệp vụ)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │          Tài liệu Chính thức Dự án           │
                       │              PRODUCT_SPEC.md                 │
                       └──────────────────────┬───────────────────────┘
                                              │ (Nguồn chân lý nghiệp vụ duy nhất)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │      01_business_analyst (@BusinessAnalyst)  │
                       │     (Đặc tả Mapping Matrix, SRS, AC Gherkin) │
                       └──────────────────────┬───────────────────────┘
                                              │
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │    02_system_architect (@SystemArchitect)    │
                       │      (Database Schema DDL & API Contracts)   │
                       └──────────────────────┬───────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
       ┌──────────────────────────────┐               ┌──────────────────────────────┐
       │   03_data_parser_engineer    │               │    04_fullstack_developer    │
       │    (@DataParserEngineer)     │               │     (@FullstackDeveloper)    │
       │   (Stream Engine & ETL Core) │               │   (Web Upload & Reporting API)│
       └──────────────┬───────────────┘               └──────────────┬───────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │    05_qa_security_spec (@QASecuritySpecialist)│
                       │      (Automated Tests, Coverage & Security)  │
                       └──────────────────────────────────────────────┘
```
