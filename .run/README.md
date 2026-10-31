# CÁC KỊCH BẢN KHỞI CHẠY HỆ THỐNG VỚI CLOUDFLARE QUICK TUNNEL (.RUN)

Thư mục `.run` chứa toàn bộ các tập lệnh thực thi cần thiết để vận hành hệ thống Sao kê Ngân hàng (BSP-2026) thông qua **Cloudflare Quick Tunnel**:

### 1. `start.bat`
- **Tác vụ:** Khởi động hệ thống hoàn chỉnh:
  1. Kiểm tra CSDL PostgreSQL (`postgresql-x64-18`).
  2. Bật Backend API FastAPI (Port `8000`) chạy nền thu nhỏ.
  3. Bật Frontend React Vite (Port `5173`) chạy nền thu nhỏ.
  4. Khởi chạy `cloudflared` Quick Tunnel kết nối đến `http://localhost:5173`.
  5. Tự động lấy đường link công khai `https://*.trycloudflare.com`, sao chép vào Clipboard và mở trình duyệt web.
- **Cách dùng:** Nhấp đúp chuột để chạy.

### 2. `stop.bat`
- **Tác vụ:** Tắt toàn bộ dịch vụ liên quan:
  - Tắt tiến trình `cloudflared.exe`.
  - Tắt tiến trình Backend API (Port `8000`).
  - Tắt tiến trình Frontend Web (Port `5173`).
- **Cách dùng:** Nhấp đúp chuột khi muốn dừng hoàn toàn app.

### 3. `setup_startup.bat`
- **Tác vụ:** Tự động tạo lối tắt (Shortcut) trong thư mục `Startup` của Windows (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`).
- **Kết quả:** Mỗi khi bạn bật máy tính hoặc đăng nhập Windows, hệ thống sẽ tự động bật và cấp link Cloudflare.

### 4. `remove_startup.bat`
- **Tác vụ:** Huỷ bỏ lối tắt tự khởi động cùng Windows khi không còn nhu cầu.

### 5. `run_cloudflare.ps1`
- Script PowerShell nội bộ hỗ trợ quản lý tiến trình `cloudflared.exe`, tự động bắt link URL, ghi file `cloudflare_url.txt` và lưu log vào `cloudflare_tunnel.log`.

