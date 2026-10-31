@echo off
title Huy Tu dong chay khi mo may

echo ================================================================
echo   HUY TU DONG KHOI DONG CUNG WINDOWS
echo ================================================================
echo.

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BSP_Bank_Statement.lnk"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%"
    echo [+] Da xoa trigger tu dong khoi dong thanh cong!
) else (
    echo [!] Khong tim thay file trigger trong thu muc Startup.
)

echo.
echo Nhan phim bat ky de dong cua so...
pause >nul
exit

