@echo off
title He thong Xu ly Sao ke Ngan hang (BSP-2026 - Cloudflare Quick Tunnel)

echo ================================================================
echo   KHOI CHAY HE THONG VOI CLOUDFLARE QUICK TUNNEL (BSP-2026)
echo ================================================================
echo.

REM 1. Xac dinh thu muc goc cua du an
pushd "%~dp0.."
set "PROJECT_ROOT=%CD%"
popd

REM 2. Kiem tra dich vu CSDL PostgreSQL
echo [1/4] Kiem tra dich vu PostgreSQL...
sc query postgresql-x64-18 >nul 2>&1
if %errorlevel% equ 0 (
    echo [+] Dich vu PostgreSQL da san sang.
) else (
    echo [*] Luu y: Kiem tra dich vu CSDL PostgreSQL neu can.
)

REM 3. Khoi dong Backend API (FastAPI - Port 8000)
echo.
echo [2/4] Dang khoi dong Backend API (FastAPI - Port 8000)...
start "BSP-Backend-API" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -Command "Set-Location -LiteralPath '%PROJECT_ROOT%\backend'; & '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"


REM 4. Khoi dong Frontend Web App (React Vite - Port 5173)
echo.
echo [3/4] Dang khoi dong Frontend Web App (React Vite - Port 5173)...
start "BSP-Frontend-Web" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -Command "Set-Location -LiteralPath '%PROJECT_ROOT%\frontend'; npm run dev"

REM 5. Cho cac dich vu noi bo khoi tao
echo.
echo [4/4] Dang cho cac dich vu khoi tao trong 4 giay...
ping 127.0.0.1 -n 5 >nul

REM 6. Khoi chay Cloudflare Quick Tunnel lay link cong khai
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_cloudflare.ps1"

