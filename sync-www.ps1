# 同步 www 目录脚本
# 用法: powershell -ExecutionPolicy Bypass -File sync-www.ps1

$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$wwwDir = Join-Path $srcDir "www"

if (-not (Test-Path $wwwDir)) {
    New-Item -ItemType Directory -Path $wwwDir -Force | Out-Null
}

$files = @(
    "index.html",
    "style.css",
    "app.js",
    "db.js",
    "auth.js",
    "router.js",
    "import.js",
    "ota.js",
    "theme.js",
    "ui.js",
    "stats.js",
    "practice.js",
    "edit.js",
    "manifest.json",
    "service-worker.js"
)

$copied = 0
foreach ($file in $files) {
    $src = Join-Path $srcDir $file
    $dst = Join-Path $wwwDir $file
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        $copied++
    } else {
        Write-Host "  跳过(不存在): $file" -ForegroundColor Yellow
    }
}

Write-Host "同步完成: $copied 个文件 -> www/" -ForegroundColor Green
