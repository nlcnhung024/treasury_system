@echo off
title Cai dat Tu dong chay khi mo may (Startup Trigger)

echo ================================================================
echo   CAI DAT TU DONG KHOI DONG CLOUDFLARE TUNNEL CUNG WINDOWS
echo ================================================================
echo.

set "TARGET_BAT=%~dp0start.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\BSP_Bank_Statement.lnk"

pushd "%~dp0.."
set "PROJECT_ROOT=%CD%"
popd

echo Dang tao Shortcut trong thu muc Startup...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%PROJECT_ROOT%'; $s.Description = 'Khoi dong He thong Sao ke Ngan hang Cloudflare Tunnel'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo [+] THANH CONG! Da tao trigger khoi dong cung Windows:
    echo     Shortcut: %SHORTCUT_PATH%
    echo     Tro den:  %TARGET_BAT%
    echo.
    echo Ung dung se tu dong chay va cap link Cloudflare moi khi ban bat may tinh.
) else (
    echo.
    echo [!] Khong the tao shortcut tu dong. Vui long kiem tra lai quyen.
)

echo.
echo Nhan phim bat ky de dong cua so...
pause >nul
exit

