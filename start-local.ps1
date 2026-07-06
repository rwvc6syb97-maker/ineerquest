<#
InnerQuest Local Development Setup Script
#>

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path $MyInvocation.MyCommand.Path -Parent
$ApiDir = Join-Path $ProjectRoot "apps\api"
$WebDir = Join-Path $ProjectRoot "apps\web"

function Print-Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Print-Success($msg) {
    Write-Host "SUCCESS: $msg" -ForegroundColor Green
}

function Print-Warning($msg) {
    Write-Host "WARNING: $msg" -ForegroundColor Yellow
}

function Print-Error($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
}

Print-Step "Step 1: Check Node.js"
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Print-Success "Node.js version: $nodeVersion"
} else {
    Print-Error "Node.js not installed. Please install Node.js >= 20 first."
    exit 1
}

Print-Step "Step 2: Install MySQL 8.0"
$mysqlService = Get-Service -Name MySQL* -ErrorAction SilentlyContinue
if ($mysqlService -and $mysqlService.Status -eq "Running") {
    Print-Warning "MySQL already running, skip install"
} else {
    Write-Host "Installing MySQL via winget..."
    winget install Oracle.MySQL --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        Print-Warning "Winget install failed. Please install MySQL manually:"
        Print-Warning "Download: https://dev.mysql.com/downloads/installer/"
        Print-Warning "Set root password to: innerquest"
        Read-Host "Press Enter to continue (assuming manual install completed)"
    } else {
        Print-Success "MySQL installed"
    }
}

Print-Step "Step 3: Install Redis"
$redisService = Get-Service -Name redis* -ErrorAction SilentlyContinue
if ($redisService -and $redisService.Status -eq "Running") {
    Print-Warning "Redis already running, skip install"
} else {
    Write-Host "Installing Redis via winget..."
    winget install Redis.Redis --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        Print-Warning "Winget install failed. Please install Redis manually:"
        Print-Warning "Download: https://github.com/tporadowski/redis/releases"
        Read-Host "Press Enter to continue (assuming manual install completed)"
    } else {
        Print-Success "Redis installed"
    }
}

Print-Step "Step 4: Start MySQL Service"
$mysqlService = Get-Service -Name MySQL* -ErrorAction SilentlyContinue
if ($mysqlService) {
    if ($mysqlService.Status -ne "Running") {
        Write-Host "Starting MySQL service..."
        Start-Service -Name $mysqlService.Name
        Start-Sleep -Seconds 5
        Print-Success "MySQL service started"
    } else {
        Print-Success "MySQL service already running"
    }
} else {
    Print-Warning "MySQL service not found. Check installation."
}

Print-Step "Step 5: Start Redis Service"
$redisService = Get-Service -Name redis* -ErrorAction SilentlyContinue
if ($redisService) {
    if ($redisService.Status -ne "Running") {
        Write-Host "Starting Redis service..."
        Start-Service -Name $redisService.Name
        Print-Success "Redis service started"
    } else {
        Print-Success "Redis service already running"
    }
} else {
    Print-Warning "Redis service not found. Trying redis-server directly..."
    $redisServer = Get-Command redis-server -ErrorAction SilentlyContinue
    if ($redisServer) {
        Write-Host "Starting redis-server..."
        Start-Process redis-server -NoNewWindow
        Start-Sleep -Seconds 2
        Print-Success "Redis started"
    } else {
        Print-Warning "redis-server not found. Check PATH."
    }
}

Print-Step "Step 6: Wait for Services"
Write-Host "Waiting for MySQL port 3306..."
for ($i = 0; $i -lt 30; $i++) {
    try {
        $tcp = New-Object System.Net.Sockets.TCPClient("localhost", 3306)
        $tcp.Close()
        Print-Success "MySQL ready"
        break
    } catch {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 2
    }
}

Write-Host "`nWaiting for Redis port 6379..."
for ($i = 0; $i -lt 30; $i++) {
    try {
        $tcp = New-Object System.Net.Sockets.TCPClient("localhost", 6379)
        $tcp.Close()
        Print-Success "Redis ready"
        break
    } catch {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 2
    }
}
Write-Host ""

Print-Step "Step 7: Create Database"
$mysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if (Test-Path $mysqlPath) {
    Write-Host "Creating database 'innerquest'..."
    & $mysqlPath -u root -pinnerquest -e "CREATE DATABASE IF NOT EXISTS innerquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    if ($LASTEXITCODE -eq 0) {
        Print-Success "Database created"
    } else {
        Print-Warning "Failed to create database. Try manually:"
        Print-Warning "mysql -u root -pinnerquest"
        Print-Warning "CREATE DATABASE innerquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    }
} else {
    Print-Warning "mysql.exe not found at $mysqlPath"
}

Print-Step "Step 8: Prisma Migrations"
Set-Location $ApiDir
Write-Host "Running prisma generate..."
npx prisma generate
if ($LASTEXITCODE -eq 0) {
    Print-Success "prisma generate completed"
} else {
    Print-Warning "prisma generate failed"
}

Write-Host "Running prisma migrate deploy..."
npx prisma migrate deploy
if ($LASTEXITCODE -eq 0) {
    Print-Success "prisma migrate completed"
} else {
    Print-Warning "prisma migrate failed"
}

Write-Host "Running prisma db seed..."
npx prisma db seed
if ($LASTEXITCODE -eq 0) {
    Print-Success "prisma seed completed"
} else {
    Print-Warning "prisma seed failed"
}

Print-Step "Step 9: Start Backend API"
Write-Host "Starting backend API on port 3000..."
Start-Process -FilePath "npm" -ArgumentList "run start:dev" -WorkingDirectory $ApiDir -NoNewWindow
Start-Sleep -Seconds 3

Print-Step "Step 10: Start Frontend Web"
Write-Host "Starting frontend web on port 5173..."
Start-Process -FilePath "npm" -ArgumentList "run dev" -WorkingDirectory $WebDir -NoNewWindow

Print-Success "All services started!"
Write-Host ""
Write-Host "Backend API: http://localhost:3000" -ForegroundColor Green
Write-Host "Frontend Web: http://localhost:5173" -ForegroundColor Green
Write-Host "First startup may take 30-60 seconds to load dependencies" -ForegroundColor Yellow

Set-Location $ProjectRoot