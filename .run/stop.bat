@echo off
title Dung He thong Xu ly Sao ke Ngan hang (BSP-2026)

echo ================================================================
echo   DUNG HE THONG VA CLOUDFLARE TUNNEL (BSP-2026)
echo ================================================================
echo.

echo Dang tat tien trinh Cloudflare Tunnel...
powershell -NoProfile -Command "Stop-Process -Name 'cloudflared' -Force -ErrorAction SilentlyContinue"

echo Dang tat tien trinh tren Port 8000 (Backend API)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Dang tat tien trinh tren Port 5173 (Frontend Web)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo [+] Da tat thanh cong toan bo Cloudflare Tunnel, Backend va Frontend!
echo.
ping 127.0.0.1 -n 3 >nul
exit

