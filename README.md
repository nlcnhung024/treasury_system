# HỆ THỐNG XỬ LÝ & BÁO CÁO SAO KÊ NGÂN HÀNG TỰ ĐỘNG (BSP-2026)
### BANK STATEMENT PROCESSING & FINANCIAL REPORTING SYSTEM

> **Phiên bản:** 1.0.0  
> **Trạng thái:** Môi trường Phát triển (Local & Dev Environment Initialized)  
> **Kiến trúc:** Clean Architecture Monorepo (FastAPI + React TypeScript + PostgreSQL 15 + Redis Streams + MinIO + Celery)

---

## 1. Cấu trúc Thư mục Dự án (Project Layout)

```text
.
├── backend/                         # Backend API Gateway & Processing Service
│   ├── app/
│   │   ├── api/                     # Tầng RESTful API Endpoints (v1)
│   │   │   └── v1/                  # Statements, Transactions, Accounts, Rules, Reports...
│   │   ├── core/                    # Cấu hình Pydantic, Database session, Security (JWT, Sanitizer)
│   │   ├── models/                  # Thực thể SQLAlchemy ORM (Khớp 100% database/schema.sql)
│   │   ├── schemas/                 # Pydantic Schemas Data Contracts (Khớp docs/api_contracts.yaml)
│   │   └── services/                # Nghiệp vụ xử lý: Universal Stream Parser, Reconciler, Exporter
│   ├── workers/                     # Async Background Workers (Celery & Redis Streams)
│   ├── tests/                       # Unit & Integration Tests (Pytest)
│   ├── Dockerfile                   # Dockerfile đóng gói Backend container
│   └── requirements.txt             # Danh mục thư viện Python
│
├── frontend/                        # Web Single Page Application (SPA)
│   ├── src/
│   │   ├── components/              # UI Components tái sử dụng (Navbar, Tables, Modals)
│   │   ├── pages/                   # Màn hình chức năng: Upload, Transactions, CFO, CEO, Rules
│   │   ├── services/                # Axios API Client & Authentication Interceptors
│   │   ├── types/                   # TypeScript Interfaces & Data Models
│   │   ├── App.tsx                  # Client-side Routing & Navigation
│   │   └── main.tsx                 # Entry Point
│   ├── Dockerfile                   # Dockerfile đóng gói Frontend container
│   ├── package.json                 # Thư viện React 18, Vite, Tailwind CSS, Lucide
│   └── vite.config.ts               # Cấu hình Vite Dev Server & API Reverse Proxy
│
├── database/                        # Cơ sở Dữ liệu & Quản lý Migration
│   └── schema.sql                   # Bản DDL chuẩn hóa 3NF PostgreSQL 15+
│
├── .run/                            # Kịch bản Khởi chạy Nhanh & Cloudflare Quick Tunnel
│   ├── start.bat                    # Bật Backend + Frontend + Cloudflare Quick Tunnel
│   ├── stop.bat                     # Tắt toàn bộ dịch vụ và đóng Tunnel
│   ├── setup_startup.bat            # Đăng ký tự động chạy cùng Windows
│   └── remove_startup.bat           # Huỷ đăng ký khởi động cùng Windows
│
├── docs/                            # Nguồn Chân lý Nghiệp vụ & Kỹ thuật Dự án
│   ├── BRD.md                       # Business Requirements Document (Yêu cầu nghiệp vụ)
│   ├── SAD.md                       # Software Architecture Document (Kiến trúc Kruchten 4+1 Views)
│   ├── Bank_Mapping_Matrix.md       # Ma trận ánh xạ 7+ ngân hàng & 5 chế độ đối soát
│   ├── api_contracts.yaml           # Đặc tả OpenAPI 3.0.3 hoàn chỉnh
│   └── security_threat_modeling.md  # Đánh giá Rủi ro STRIDE & Kiến trúc Bảo mật Đa tầng
│
├── docker-compose.yml               # Cấu hình cụm hạ tầng cục bộ (Postgres, Redis, MinIO, App)
├── .env.example                     # Mẫu biến môi trường phát triển
└── README.md                        # Hướng dẫn kỹ thuật nội bộ (Tài liệu này)
```

---

## 2. Yêu cầu Hệ thống (Prerequisites)

- **Docker:** Phiên bản $\ge 24.0$ & Docker Compose v2.
- **Python (nếu chạy không qua Docker):** Python 3.11+
- **Node.js (nếu chạy không qua Docker):** Node.js 20+ (hoặc v24 LTS) & npm 10+
- **PostgreSQL (nếu chạy cục bộ):** PostgreSQL 15+
- **Redis (nếu chạy cục bộ):** Redis 7.0+

---

## 3. Khởi chạy Nhanh 1-Click với Cloudflare Quick Tunnel (.run)

Nếu bạn muốn khởi chạy nhanh toàn bộ ứng dụng và phát hành qua Cloudflare Quick Tunnel (có đường link HTTPS công khai) bằng 1 cú nhấp chuột:

- **Khởi chạy hệ thống + cấp link Cloudflare:** Nhấp đúp vào `.run/start.bat` (hoặc `run.bat` ở thư mục gốc).
- **Tắt toàn bộ hệ thống:** Nhấp đúp vào `.run/stop.bat`.
- **Đăng ký tự động chạy khi bật máy tính:** Nhấp đúp vào `.run/setup_startup.bat`.
- **Huỷ đăng ký tự khởi động:** Nhấp đúp vào `.run/remove_startup.bat`.

---

## 4. Khởi chạy Cụm Môi trường Phát triển (Quickstart với Docker Compose)

Đây là phương thức khuyến nghị để khởi chạy đầy đủ toàn bộ hệ sinh thái (PostgreSQL, Redis, MinIO, Backend, Worker, Frontend) chỉ với 1 lệnh duy nhất:

### Bước 1: Sao chép tệp cấu hình môi trường
```bash
cp .env.example .env
```

### Bước 2: Khởi động toàn bộ cụm dịch vụ qua Docker Compose
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái các dịch vụ
```bash
docker compose ps
```

### Bước 4: Truy cập các cổng giao diện
| Dịch vụ | Địa chỉ URL | Thông tin xác thực mặc định |
| :--- | :--- | :--- |
| **Frontend Web App** | [http://localhost:5173](http://localhost:5173) | Sẵn sàng sử dụng |
| **Backend Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | OpenAPI 3.0 UI |
| **Backend Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | Trả về `{"status": "HEALTHY"}` |
| **MinIO Console Storage** | [http://localhost:9001](http://localhost:9001) | User: `minio_admin` / Pass: `minio_secure_password_2026` |
| **PostgreSQL Database** | `localhost:5432` | User: `postgres` / Pass: `postgres_dev_password_2026` / DB: `bank_statement_db` |
| **Redis Cache & Streams** | `localhost:6379` | Pass: `redis_dev_password_2026` |

---

## 5. Khởi chạy Cục bộ cho Lập trình viên (Standalone Development)

Nếu bạn muốn debug trực tiếp mã nguồn trên máy trạm mà không thông qua container:

### 5.1. Khởi động các hạ tầng phụ trợ (PostgreSQL, Redis, MinIO)
```bash
docker compose up -d postgres redis minio createbuckets
```

### 5.2. Cài đặt & Khởi chạy Backend FastAPI
```bash
cd backend
python -m venv .venv

# Trên Windows PowerShell:
.venv\Scripts\Activate.ps1
# Trên Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 5.3. Khởi chạy Celery Worker (Terminal riêng biệt)
```bash
cd backend
# Trên Windows/Linux:
celery -A workers.celery_app.celery worker --loglevel=info -P solo
```

### 5.4. Cài đặt & Khởi chạy Frontend React
```bash
cd frontend
npm install
npm run dev
```

---

## 6. Chạy Kiểm thử Tự động (Testing & Verification)

Hệ thống tuân thủ chỉ tiêu tỷ lệ bao phủ kiểm thử đơn vị $\ge 85\%$:

```bash
cd backend
pytest -v
```

---

## 7. Các Tiêu chuẩn Kỹ thuật Bắt buộc Cần Nhớ

- **Độ chính xác Tiền tệ:** Luôn sử dụng kiểu `Decimal` trong Python và `NUMERIC(18, 2)` trong PostgreSQL. Tuyệt đối không dùng kiểu `Float` hay `Double`.
- **An toàn Xuất Excel:** Mọi trường Text khi xuất file Excel phải qua hàm `sanitize_excel_cell()` trong `app/core/security.py` để thoát ký tự `=`, `+`, `-`, `@`.
- **Bảo vệ Phân loại Thủ công:** Không bao giờ ghi đè lên các bản ghi có cờ `is_manual_override = True`.

