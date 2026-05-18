#Requires -Version 7.0
param(
    [switch]$SkipOllama
)

$ErrorActionPreference = "Stop"

function Write-Info  ($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  ($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Fail  ($msg) { Write-Host "[FAIL]  $msg" -ForegroundColor Red; exit 1 }

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$RootDir = Split-Path -Parent $ScriptDir
Push-Location $RootDir
try {

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  StartupJobs - Dev Environment Setup"   -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -------------------------------------------------------------------
# 1. .env file
# -------------------------------------------------------------------
Write-Info "Checking .env file..."
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Ok "Created .env from .env.example"
} else {
    Write-Ok ".env already exists"
}

# -------------------------------------------------------------------
# 2. Docker
# -------------------------------------------------------------------
Write-Info "Checking Docker..."
try {
    $null = Get-Command docker -ErrorAction Stop
    Write-Ok "Docker CLI found"
} catch {
    Write-Fail "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
}

try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "not running" }
    Write-Ok "Docker daemon is running"
} catch {
    Write-Fail "Docker daemon is not running. Start Docker Desktop and try again."
}

Write-Info "Starting TimescaleDB container..."
docker compose up -d db
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to start TimescaleDB container" }
Write-Ok "TimescaleDB container started"

Write-Info "Waiting for database to be healthy..."
$retries = 30
while ($retries -gt 0) {
    $ready = docker compose exec -T db pg_isready -U startupjobs 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    $retries--
    Start-Sleep -Seconds 1
}
if ($retries -le 0) { Write-Fail "Database did not become healthy in time" }
Write-Ok "Database is healthy"

Write-Info "Enabling pgvector extension..."
docker compose exec -T db psql -U startupjobs -d startupjobs -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>$null
Write-Ok "pgvector extension enabled"

# -------------------------------------------------------------------
# 3. Ollama
# -------------------------------------------------------------------
if (-not $SkipOllama) {
    Write-Info "Checking Ollama..."
    try {
        $null = Get-Command ollama -ErrorAction Stop
        Write-Ok "Ollama CLI found"
    } catch {
        Write-Host ""
        Write-Warn "Ollama is not installed."
        Write-Host "  Install it from: https://ollama.com/download"
        Write-Host "  Windows: winget install Ollama.Ollama"
        Write-Host ""
        Write-Host "  After installing, run this script again."
        Write-Fail "Ollama is required for embeddings and entity extraction"
    }

    $ollamaUrl = if ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL } else { "http://localhost:11434" }

    Write-Info "Checking if Ollama is running at $ollamaUrl..."
    try {
        $null = Invoke-RestMethod -Uri "$ollamaUrl/api/version" -TimeoutSec 3 -ErrorAction Stop
        Write-Ok "Ollama is running"
    } catch {
        Write-Warn "Ollama is not responding. Attempting to start..."
        Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 4
        try {
            $null = Invoke-RestMethod -Uri "$ollamaUrl/api/version" -TimeoutSec 5 -ErrorAction Stop
            Write-Ok "Ollama is running"
        } catch {
            Write-Fail "Could not start Ollama. Run 'ollama serve' manually and try again."
        }
    }

    $models = @("nomic-embed-text", "gemma4")
    foreach ($model in $models) {
        Write-Info "Checking model: $model"
        $list = ollama list 2>&1
        if ($list -match "(?m)^$model") {
            Write-Ok "$model already pulled"
        } else {
            Write-Info "Pulling $model (this may take a while)..."
            ollama pull $model
            if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to pull $model" }
            Write-Ok "$model pulled"
        }
    }
} else {
    Write-Warn "Skipping Ollama checks (-SkipOllama)"
}

# -------------------------------------------------------------------
# 4. Node dependencies
# -------------------------------------------------------------------
Write-Info "Checking Node.js..."
try {
    $nodeVersion = (node -v) -replace '^v', ''
    $major = [int]($nodeVersion.Split('.')[0])
    if ($major -lt 18) { Write-Fail "Node.js 18+ required (found v$nodeVersion)" }
    Write-Ok "Node.js v$nodeVersion"
} catch {
    Write-Fail "Node.js is not installed. Install Node 18+ from https://nodejs.org"
}

Write-Info "Checking pnpm..."
try {
    $null = Get-Command pnpm -ErrorAction Stop
    Write-Ok "pnpm $(pnpm -v)"
} catch {
    Write-Warn "pnpm not found. Installing via corepack..."
    corepack enable
    corepack prepare pnpm@9.0.0 --activate
    Write-Ok "pnpm installed"
}

Write-Info "Installing dependencies..."
pnpm install
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm install failed" }
Write-Ok "Dependencies installed"

# -------------------------------------------------------------------
# 5. Database schema
# -------------------------------------------------------------------
Write-Info "Pushing database schema..."
Push-Location packages/pipeline
pnpm db:push
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "Schema push failed" }
Pop-Location
Write-Ok "Database schema up to date"

# -------------------------------------------------------------------
# Done
# -------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup complete!"                       -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Services:"
Write-Host "    TimescaleDB:  localhost:5434"
if (-not $SkipOllama) {
    Write-Host "    Ollama:       $ollamaUrl"
}
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    pnpm dev                        # Start web app on :3000"
Write-Host "    cd packages/pipeline"
Write-Host "    pnpm sync                       # Crawl -> Extract -> Embed"
Write-Host '    pnpm search "react developer"   # Test hybrid search'
Write-Host ""

} finally { Pop-Location }
