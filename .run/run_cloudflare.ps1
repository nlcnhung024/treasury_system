param(
    [string]$TargetUrl = "http://localhost:5173",
    [string]$CustomToken = ""
)

$ErrorActionPreference = "SilentlyContinue"
$runDir = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $runDir "..")).Path

# Kiem tra token neu nguoi dung co cau hinh
if (-not $CustomToken -and $env:CLOUDFLARE_TUNNEL_TOKEN) {
    $CustomToken = $env:CLOUDFLARE_TUNNEL_TOKEN
}

if ($CustomToken) {
    Write-Host "[*] Dang khoi chay Cloudflare Named Tunnel voi Token..." -ForegroundColor Cyan
    Start-Process -FilePath "cloudflared.exe" -ArgumentList "tunnel run --token $CustomToken" -WindowStyle Minimized
    Write-Host "[+] Cloudflare Tunnel da ket noi vao ten mien rieng cua ban!" -ForegroundColor Green
    exit 0
}

Write-Host "[*] Dang ket noi Cloudflare Edge qua Quick Tunnel..." -ForegroundColor Cyan

$logFile = Join-Path $runDir "cloudflare_tunnel.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cloudflared.exe"
$psi.Arguments = "tunnel --url $TargetUrl"
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

$tunnelUrl = ""
$timeout = [DateTime]::Now.AddSeconds(25)

while ([DateTime]::Now -lt $timeout -and -not $tunnelUrl) {
    if ($proc.HasExited) { break }
    $line = $proc.StandardError.ReadLine()
    if ($line) {
        Add-Content -Path $logFile -Value $line
        if ($line -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $tunnelUrl = $matches[1]
            break
        }
    }
}

if ($tunnelUrl) {
    $urlFile = Join-Path $runDir "cloudflare_url.txt"
    Set-Content -Path $urlFile -Value $tunnelUrl
    Set-Clipboard -Value $tunnelUrl -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "   DUONG LINK CLOUDFLARE QUICK TUNNEL DA SAN SANG:" -ForegroundColor Yellow
    Write-Host "   $tunnelUrl" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "   [+] Da tu dong Copy link vao Clipboard (Ctrl+V de gui/mo)" -ForegroundColor Gray
    Write-Host "   [+] Dang mo link tren trinh duyet web..." -ForegroundColor Gray
    Write-Host ""

    Start-Process $tunnelUrl
} else {
    Write-Host "[!] Khong the lay link Cloudflare. Vui long xem log tai: $logFile" -ForegroundColor Red
}

# Tiep tuc giu tien trinh doc log ngam de cloudflared khong bi nghen buffer
while (-not $proc.HasExited) {
    $null = $proc.StandardError.ReadLine()
}

