#!/bin/bash

# ===========================================
# NIKCLI - SCRIPT DI CONFIGURAZIONE AMBIENTI DI SVILUPPO E TEST
# ===========================================

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funzioni utility
print_header() {
    echo -e "\n${PURPLE}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${PURPLE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Controllo dipendenze sistema
check_system_requirements() {
    print_header "CONTROLLO REQUISITI DI SISTEMA"
    
    # Node.js version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js trovato: $NODE_VERSION"
        
        # Verifica versione >= 22.0.0
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR" -lt 22 ]; then
            print_error "Node.js versione deve essere >= 22.0.0. Attuale: $NODE_VERSION"
            exit 1
        fi
    else
        print_error "Node.js non trovato. Installare Node.js >= 22.0.0"
        exit 1
    fi
    
    # Bun package manager
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        print_success "Bun trovato: $BUN_VERSION"
    else
        print_warning "Bun non trovato. Installare Bun per performance migliori"
        print_info "Installazione Bun: curl -fsSL https://bun.sh/install | bash"
    fi
    
    # Git
    if command -v git &> /dev/null; then
        print_success "Git trovato: $(git --version)"
    else
        print_error "Git non trovato. Installare Git"
        exit 1
    fi
    
    # Docker (opzionale)
    if command -v docker &> /dev/null; then
        print_success "Docker trovato: $(docker --version)"
        DOCKER_AVAILABLE=true
    else
        print_warning "Docker non trovato (opzionale per containerizzazione)"
        DOCKER_AVAILABLE=false
    fi
}

# Setup ambiente sviluppo locale
setup_development_environment() {
    print_header "SETUP AMBIENTE DI SVILUPPO"
    
    # Creazione directory ambiente di sviluppo
    mkdir -p .env.development
    mkdir -p development
    mkdir -p tests/environment
    
    # File .env.development base
    cat > .env.development << 'EOF'
# ===========================================
# NIKCLI - AMBIENTE DI SVILUPPO
# ===========================================

# ===========================================
# CONFIGURAZIONE AMBIENTE
# ===========================================
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=true
NIKCLI_ENV=development

# ===========================================
# PORTE E HOST
# ===========================================
PORT=3000
API_PORT=3000
WEB_PORT=3001
CONSOLE_PORT=3001
NIKCLI_COMPACT=1

# CORS - Sviluppo locale
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001

# ===========================================
# DATABASE - Sviluppo locale
# ===========================================
# SQLite per sviluppo locale (fallback)
DATABASE_URL_SQLITE=file:./development/dev.sqlite

# PostgreSQL remoto per dati persistenti
DATABASE_URL=postgresql://postgres.bopgyibjrbwaynegbska:Signor!889Gatto159?@aws-0-us-east-2.pooler.supabase.com:5432/postgres

# Redis locale
REDIS_URL=redis://localhost:6379
REDIS_DB=1

# ===========================================
# AI PROVIDERS - API KEYS
# ===========================================
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here

# ===========================================
# SUPABASE - Sviluppo
# ===========================================
SUPABASE_URL=https://bopgyibjrbwaynegbska.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvcGd5aWJqcmJ3YXluZWdic2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMDg1NzcsImV4cCI6MjA3MDY4NDU3N30.7bGfju4t7otkLyHrB5HzBYjNJCciqsvcOfE7qAc8kQc
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvcGd5aWJqcmJ3YXluZWdic2thIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTEwODU3NywiZXhwIjoyMDcwNjg0NTc3fQ.-bRInjJ0-aaEQGJebHDgp_L6ICI-RDygJFmGdPyEBiI

# ===========================================
# TESTING CONFIGURATION
# ===========================================
# Test database separato
TEST_DATABASE_URL=postgresql://postgres.bopgyibjrbwaynegbska:Signor!889Gatto159?@aws-0-us-east-2.pooler.supabase.com:5432/postgres

# Redis per test
TEST_REDIS_URL=redis://localhost:6379/15

# Mock API keys per test
MOCK_OPENAI_API_KEY=test_openai_key_123456789
MOCK_ANTHROPIC_API_KEY=test_anthropic_key_123456789
MOCK_GOOGLE_API_KEY=test_google_key_123456789

# ===========================================
# VECTOR DATABASE
# ===========================================
CHROMA_HOST=localhost
CHROMA_PORT=8005
CHROMA_COLLECTION=test_project_index

# ===========================================
# SECURITY - Development
# ===========================================
JWT_SECRET=dev_jwt_secret_key_please_change_in_production_123456789
NIKCLI_JWT_SECRET=dev_nikcli_jwt_secret_key_123456789
NIKCLI_PROXY_SECRET=dev_proxy_secret_key_123456789

# Webhook secret development
WEBHOOK_SECRET=dev_webhook_secret_123456789

# ===========================================
# MONITORING - Development
# ===========================================
SENTRY_DSN=your_sentry_dsn_here
SENTRY_ENVIRONMENT=development
ENABLE_TELEMETRY=false
ENABLE_METRICS=true

# ===========================================
# WEB3 - Development
# ===========================================
# Testnet keys for development
POLYGON_TESTNET_RPC=https://rpc.ankr.com/polygon_mumbai
POLYMARKET_TESTNET_PRIVATE_KEY=your_testnet_private_key_here
GOAT_WALLET_PRIVATE_KEY=your_testnet_private_key_here

# ===========================================
# EXTERNAL SERVICES - Development
# ===========================================
GITHUB_TOKEN=your_github_token_here
SLACK_WEBHOOK_URL=your_slack_webhook_for_dev_here

# ===========================================
# RATE LIMITING - Development
# ===========================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
EOF

    print_success "File .env.development creato"
    
    # File .env.test per testing
    cat > .env.test << 'EOF'
# ===========================================
# NIKCLI - AMBIENTE DI TESTING
# ===========================================

NODE_ENV=test
LOG_LEVEL=warn
DEBUG=false
NIKCLI_ENV=test

# Test ports
PORT=3002
API_PORT=3002
WEB_PORT=3003

# In-memory database per test rapido
DATABASE_URL=file:./tests/test.sqlite

# Redis test
REDIS_URL=redis://localhost:6379/15

# Mock services
MOCK_SERVICES=true
SKIP_EXTERNAL_API_CALLS=true

# Testing flags
ENABLE_TEST_HOOKS=true
DISABLE_REAL_NETWORK=true
DISABLE_REAL_FILE_OPERATIONS=false

# Test-specific security
JWT_SECRET=test_jwt_secret_123456789
NIKCLI_PROXY_SECRET=test_proxy_secret_123456789

# No real webhooks in test
WEBHOOK_SECRET=test_webhook_secret_123456789

# Disable telemetry in tests
ENABLE_TELEMETRY=false
SENTRY_ENABLED=false

# Fast testing
TEST_TIMEOUT_MS=10000
TEST_PARALLEL=true
EOF

    print_success "File .env.test creato"
    
    # Test database setup
    cat > development/test-database-setup.js << 'EOF'
const { Database } = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Setup SQLite databases for development and testing
function setupTestDatabase() {
    const devDbPath = path.join(__dirname, '../.env.development/dev.sqlite');
    const testDbPath = path.join(__dirname, '../tests/test.sqlite');
    
    // Create development database
    const devDb = new Database(devDbPath);
    devDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Create test database
    const testDb = new Database(testDbPath);
    testDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    console.log('✅ Database setup completato');
    devDb.close();
    testDb.close();
}

setupTestDatabase();
EOF

    print_success "Setup database di sviluppo completato"
}

# Configurazione Docker per servizi locali
setup_docker_services() {
    print_header "CONFIGURAZIONE SERVIZI DOCKER"
    
    if [ "$DOCKER_AVAILABLE" = false ]; then
        print_warning "Saltando setup Docker - Docker non disponibile"
        return
    fi
    
    # Docker compose per servizi di sviluppo
    cat > docker-compose.dev.yml << 'EOF'
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: nikcli-redis-dev
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
    command: redis-server --appendonly yes
    networks:
      - nikcli-dev

  postgres:
    image: postgres:15-alpine
    container_name: nikcli-postgres-dev
    environment:
      POSTGRES_DB: nikcli_dev
      POSTGRES_USER: nikcli_dev
      POSTGRES_PASSWORD: dev_password_123
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    networks:
      - nikcli-dev

  chromadb:
    image: chromadb/chroma:latest
    container_name: nikcli-chromadb-dev
    ports:
      - "8005:8000"
    environment:
      - CHROMA_SERVER_AUTHN_CREDENTIALS=admin:admin
    volumes:
      - chroma_dev_data:/chroma/chroma
    networks:
      - nikcli-dev

  minio:
    image: minio/minio:latest
    container_name: nikcli-minio-dev
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    command: server /data --console-address ":9001"
    volumes:
      - minio_dev_data:/data
    networks:
      - nikcli-dev

  nginx:
    image: nginx:alpine
    container_name: nikcli-nginx-dev
    ports:
      - "8080:80"
    volumes:
      - ./development/nginx-dev.conf:/etc/nginx/nginx.conf
    depends_on:
      - redis
      - postgres
      - chromadb
      - minio
    networks:
      - nikcli-dev

volumes:
  redis_dev_data:
  postgres_dev_data:
  chroma_dev_data:
  minio_dev_data:

networks:
  nikcli-dev:
    driver: bridge
EOF

    # Configurazione Nginx per sviluppo
    cat > development/nginx-dev.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream api {
        server localhost:3000;
    }
    
    upstream web {
        server localhost:3001;
    }

    server {
        listen 80;
        
        # API endpoints
        location /api/ {
            proxy_pass http://api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Web UI
        location / {
            proxy_pass http://web/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

    print_success "Docker compose e configurazione Nginx creati"
}

# Setup API keys e secrets management
setup_api_keys() {
    print_header "CONFIGURAZIONE API KEYS E SECRETS"
    
    # Template per API keys management
    cat > development/api-keys-manager.ts << 'EOF'
#!/usr/bin/env node

/**
 * API Keys Manager per NikCLI Development
 * Gestisce in modo sicuro le chiavi API per l'ambiente di sviluppo
 */

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

interface ApiKeyConfig {
    name: string;
    key: string;
    required: boolean;
    description: string;
}

const REQUIRED_KEYS: ApiKeyConfig[] = [
    {
        name: 'OPENAI_API_KEY',
        key: '',
        required: true,
        description: 'OpenAI API key for GPT models'
    },
    {
        name: 'ANTHROPIC_API_KEY',
        key: '',
        required: true,
        description: 'Anthropic API key for Claude models'
    },
    {
        name: 'GOOGLE_GENERATIVE_AI_API_KEY',
        key: '',
        required: false,
        description: 'Google API key for Gemini models'
    },
    {
        name: 'OPENROUTER_API_KEY',
        key: '',
        required: false,
        description: 'OpenRouter API key for model aggregation'
    },
    {
        name: 'GITHUB_TOKEN',
        key: '',
        required: false,
        description: 'GitHub Personal Access Token'
    },
    {
        name: 'SLACK_WEBHOOK_URL',
        key: '',
        required: false,
        description: 'Slack webhook URL for notifications'
    }
];

async function setupApiKeys() {
    console.log('🔑 Configurazione API Keys per NikCLI Development\n');
    
    const envPath = path.join(__dirname, '../.env.development');
    const keysPath = path.join(__dirname, '../.env.keys');
    
    // Crea file keys separato per sicurezza
    const keysContent: string[] = [
        '# API Keys per NikCLI Development',
        '# Questo file contiene chiavi sensibili - NON committare su Git',
        '',
        ...REQUIRED_KEYS.map(key => {
            if (key.key) {
                return `${key.name}=${key.key}`;
            }
            return `${key.name}=