#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  StartupJobs — Dev Environment Setup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# -------------------------------------------------------------------
# 1. .env file
# -------------------------------------------------------------------
info "Checking .env file..."
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env already exists"
fi

# -------------------------------------------------------------------
# 2. Docker
# -------------------------------------------------------------------
info "Checking Docker..."
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
fi
ok "Docker CLI found"

if ! docker info &>/dev/null; then
  fail "Docker daemon is not running. Start Docker Desktop and try again."
fi
ok "Docker daemon is running"

info "Starting TimescaleDB container..."
docker compose up -d db
ok "TimescaleDB container started"

info "Waiting for database to be healthy..."
RETRIES=30
until docker compose exec -T db pg_isready -U startupjobs &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    fail "Database did not become healthy in time"
  fi
  sleep 1
done
ok "Database is healthy"

info "Enabling pgvector extension..."
docker compose exec -T db psql -U startupjobs -d startupjobs -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null
ok "pgvector extension enabled"

# -------------------------------------------------------------------
# 3. Ollama
# -------------------------------------------------------------------
info "Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  echo ""
  warn "Ollama is not installed."
  echo "  Install it from: https://ollama.com/download"
  echo ""
  echo "  macOS:   brew install ollama"
  echo "  Linux:   curl -fsSL https://ollama.com/install.sh | sh"
  echo ""
  echo "  After installing, run this script again."
  fail "Ollama is required for embeddings and entity extraction"
fi
ok "Ollama CLI found"

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

info "Checking if Ollama is running at $OLLAMA_BASE_URL..."
if ! curl -sf "$OLLAMA_BASE_URL/api/version" &>/dev/null; then
  warn "Ollama is not running. Attempting to start..."
  ollama serve &>/dev/null &
  sleep 3
  if ! curl -sf "$OLLAMA_BASE_URL/api/version" &>/dev/null; then
    fail "Could not start Ollama. Run 'ollama serve' manually and try again."
  fi
fi
ok "Ollama is running"

MODELS=("nomic-embed-text" "gemma4")
for MODEL in "${MODELS[@]}"; do
  info "Checking model: $MODEL"
  if ollama list 2>/dev/null | grep -q "^$MODEL"; then
    ok "$MODEL already pulled"
  else
    info "Pulling $MODEL (this may take a while)..."
    ollama pull "$MODEL"
    ok "$MODEL pulled"
  fi
done

# -------------------------------------------------------------------
# 4. Node dependencies
# -------------------------------------------------------------------
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node 18+ from https://nodejs.org"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ required (found v$(node -v))"
fi
ok "Node.js $(node -v)"

info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing via corepack..."
  corepack enable
  corepack prepare pnpm@9.0.0 --activate
fi
ok "pnpm $(pnpm -v)"

info "Installing dependencies..."
pnpm install
ok "Dependencies installed"

# -------------------------------------------------------------------
# 5. Database schema
# -------------------------------------------------------------------
info "Pushing database schema..."
cd packages/pipeline
pnpm db:push
cd "$ROOT_DIR"
ok "Database schema up to date"

# -------------------------------------------------------------------
# Done
# -------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Services:"
echo "    TimescaleDB:  localhost:5434"
echo "    Ollama:       $OLLAMA_BASE_URL"
echo ""
echo "  Next steps:"
echo "    pnpm dev                        # Start web app on :3000"
echo "    cd packages/pipeline"
echo "    pnpm sync                       # Crawl → Extract → Embed"
echo "    pnpm search \"react developer\"   # Test hybrid search"
echo ""
