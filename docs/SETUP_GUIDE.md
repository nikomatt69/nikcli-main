# 🚀 NikCLI Background Agents - Guida Setup Completa

Questa guida ti accompagnerà passo dopo passo per configurare completamente l'ambiente di sviluppo e produzione per NikCLI Background Agents.

## 📋 Prerequisiti

### Software Richiesto

- **Node.js**: Versione 18 o superiore
- **npm**: Versione 8 o superiore
- **Git**: Per clonare il repository
- **Docker** (opzionale): Per l'ambiente containerizzato

### Verifica Installazioni

```bash
node --version    # Deve essere >= 18.0.0
npm --version     # Deve essere >= 8.0.0
git --version     # Qualsiasi versione recente
docker --version  # Opzionale
```

## 🔧 Configurazione Variabili d'Ambiente

### 1. File .env Principale

Crea il file `.env` nella root del progetto:

```bash
# ===========================================
# NIKCLI BACKGROUND AGENTS - CONFIGURAZIONE
# ===========================================

# ===========================================
# CONFIGURAZIONE SERVER
# ===========================================
NODE_ENV=development
PORT=3000
WEB_PORT=3001

# ===========================================
# GITHUB INTEGRATION
# ===========================================
# Ottieni questi valori da: https://github.com/settings/applications/new
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_TOKEN=your_personal_access_token_here

# ===========================================
# AI PROVIDERS
# ===========================================
# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenAI (opzionale)
OPENAI_API_KEY=your_openai_api_key_here

# ===========================================
# DATABASE & STORAGE
# ===========================================
# SQLite (default)
DATABASE_URL=./database/nikcli.db

# PostgreSQL (opzionale per produzione)
# DATABASE_URL=postgresql://username:password@localhost:5432/nikcli

# Redis (opzionale per cache)
REDIS_URL=redis://localhost:6379

# ===========================================
# VECTOR DATABASE (ChromaDB)
# ===========================================
CHROMA_HOST=localhost
CHROMA_PORT=8005
CHROMA_COLLECTION=nikcli_embeddings

# ===========================================
# SECURITY & ENCRYPTION
# ===========================================
# Genera con: openssl rand -base64 32
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# ===========================================
# NOTIFICATIONS
# ===========================================
# Slack (opzionale)
SLACK_BOT_TOKEN=your_slack_bot_token_here
SLACK_WEBHOOK_URL=your_slack_webhook_url_here

# Email (opzionale)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password_here

# ===========================================
# DOCKER & CONTAINERIZATION
# ===========================================
DOCKER_NETWORK=nikcli-network
DOCKER_VOLUME=nikcli-data

# ===========================================
# LOGGING & MONITORING
# ===========================================
LOG_LEVEL=info
LOG_FILE=./logs/nikcli.log

# ===========================================
# RATE LIMITING
# ===========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. File .env.production

Crea il file `.env.production` per l'ambiente di produzione:

```bash
# ===========================================
# PRODUZIONE - CONFIGURAZIONE SICURA
# ===========================================

NODE_ENV=production
PORT=3000
WEB_PORT=3001

# Usa variabili d'ambiente del sistema o servizi cloud
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_TOKEN=${GITHUB_TOKEN}

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}

# Database di produzione
DATABASE_URL=${DATABASE_URL}

# Sicurezza rafforzata
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Logging di produzione
LOG_LEVEL=warn
```

### 3. File .env.local (per sviluppo locale)

```bash
# ===========================================
# SVILUPPO LOCALE - OVERRIDE
# ===========================================

# Override per sviluppo locale
NODE_ENV=development
PORT=3000
WEB_PORT=3001

# Configurazioni di sviluppo
LOG_LEVEL=debug
```

## 🔑 Come Ottenere le Chiavi API

### GitHub Integration

1. **Vai su GitHub Settings**:

   - https://github.com/settings/applications/new

2. **Crea una nuova OAuth App**:

   ```
   Application name: NikCLI Background Agents
   Homepage URL: http://localhost:3001
   Authorization callback URL: http://localhost:3001/api/v1/web/auth/github/callback
   ```

3. **Copia i valori**:

   - `Client ID` → `GITHUB_CLIENT_ID`
   - `Client Secret` → `GITHUB_CLIENT_SECRET`

4. **Crea Personal Access Token**:
   - https://github.com/settings/tokens/new
   - Seleziona scopes: `repo`, `user:read`, `workflow`
   - Copia il token → `GITHUB_TOKEN`

### Anthropic Claude API

1. **Vai su Anthropic Console**:

   - https://console.anthropic.com/

2. **Crea un account** e ottieni la chiave API

3. **Copia la chiave** → `ANTHROPIC_API_KEY`

### OpenAI API (Opzionale)

1. **Vai su OpenAI Platform**:

   - https://platform.openai.com/api-keys

2. **Crea una nuova chiave API**

3. **Copia la chiave** → `OPENAI_API_KEY`

## 🛠️ Setup Passo dopo Passo

### Passo 1: Clona e Installa

```bash
# Clona il repository
git clone https://github.com/your-username/nikcli-main.git
cd nikcli-main

# Installa le dipendenze
npm install

# Installa dipendenze globali (opzionale)
npm install -g ts-node typescript
```

### Passo 2: Configura le Variabili d'Ambiente

```bash
# Copia il file di esempio
cp .env.example .env

# Modifica il file .env con i tuoi valori
nano .env  # o usa il tuo editor preferito
```

### Passo 3: Genera Chiavi di Sicurezza

```bash
# Genera JWT Secret
openssl rand -base64 32

# Genera Encryption Key
openssl rand -base64 32
```

### Passo 4: Setup Database

```bash
# Crea la directory del database
mkdir -p database

# Inizializza il database (se necessario)
npm run db:init
```

### Passo 5: Setup ChromaDB (Opzionale)

```bash
# Installa ChromaDB
pip install chromadb

# Avvia ChromaDB server
chroma run --host localhost --port 8005
```

### Passo 6: Test dell'Installazione

```bash
# Test build
npm run build

# Test linting
npm run lint

# Test unitari
npm test
```

## 🚀 Avvio dell'Applicazione

### Sviluppo

```bash
# Avvia entrambi i server (API + Web)
npm run web:full

# Oppure avvia separatamente:
# Terminal 1: API Server
npm run web:server

# Terminal 2: Web Interface
npm run web:dev
```

### Produzione

```bash
# Build per produzione
npm run build

# Avvia in produzione
npm run web:start
```

## 🐳 Setup Docker (Opzionale)

### Docker Compose

```bash
# Avvia con Docker Compose
docker-compose up -d

# Verifica i container
docker-compose ps

# Logs
docker-compose logs -f
```

### Docker Manuale

```bash
# Build dell'immagine
docker build -t nikcli-bg .

# Avvia il container
docker run -d \
  --name nikcli-bg \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/database:/app/database \
  --env-file .env \
  nikcli-bg
```

## 🔍 Verifica Configurazione

### Test API

```bash
# Health check
curl http://localhost:3000/health

# Test configurazione
curl http://localhost:3001/api/v1/web/config

# Test GitHub (dovrebbe restituire errore di configurazione)
curl http://localhost:3001/api/v1/web/auth/github
```

### Test Web Interface

1. **Apri il browser**: http://localhost:3001
2. **Verifica la sidebar**: Dovrebbe essere visibile
3. **Test navigazione**: Prova tutte le pagine
4. **Test configurazione**: Vai su /config

## 🐛 Troubleshooting

### Problemi Comuni

#### 1. Porta già in uso

```bash
# Trova il processo che usa la porta
lsof -i :3000
lsof -i :3001

# Termina il processo
kill -9 <PID>
```

#### 2. Errori di dipendenze

```bash
# Pulisci e reinstalla
rm -rf node_modules package-lock.json
npm install
```

#### 3. Errori di build

```bash
# Pulisci build
rm -rf .next dist
npm run build
```

#### 4. Errori di database

```bash
# Ricrea il database
rm -f database/nikcli.db
npm run db:init
```

### Log di Debug

```bash
# Abilita debug logging
export LOG_LEVEL=debug
npm run web:server
```

## 📚 Comandi Utili

### Sviluppo

```bash
npm start              # Avvia CLI
npm run dev            # Alias per start
npm run web:dev        # Solo web interface
npm run web:server     # Solo API server
npm run web:full       # Entrambi i server
```

### Build e Deploy

```bash
npm run build          # Build TypeScript
npm run build:start    # Build e avvia
npm run web:build      # Build Next.js
npm run web:start      # Avvia in produzione
```

### Test e Quality

```bash
npm test               # Test unitari
npm run test:watch     # Test in watch mode
npm run lint           # ESLint
npm run lint:fix       # Fix automatico
```

### Database

```bash
npm run db:init        # Inizializza database
npm run db:migrate     # Esegui migrazioni
npm run db:seed        # Popola con dati di test
```

## 🔐 Sicurezza

### Checklist Sicurezza

- [ ] ✅ JWT_SECRET generato con `openssl rand -base64 32`
- [ ] ✅ ENCRYPTION_KEY generato con `openssl rand -base64 32`
- [ ] ✅ File .env non committato (in .gitignore)
- [ ] ✅ Variabili sensibili in .env.production
- [ ] ✅ Rate limiting configurato
- [ ] ✅ CORS configurato correttamente
- [ ] ✅ HTTPS in produzione
- [ ] ✅ Firewall configurato

### File .gitignore

Assicurati che il tuo `.gitignore` contenga:

```gitignore
# Environment variables
.env
.env.local
.env.production
.env.development

# Database
database/*.db
database/*.sqlite

# Logs
logs/
*.log

# Dependencies
node_modules/

# Build outputs
dist/
.next/
build/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

## 📞 Supporto

### Risorse Utili

- **Documentazione**: `/docs/` directory
- **API Reference**: http://localhost:3000/v1 (quando il server è attivo)
- **GitHub Issues**: Per bug e feature requests
- **Discord/Telegram**: Per supporto community

### Comandi di Debug

```bash
# Verifica configurazione
npm run config:check

# Test connessioni
npm run test:connections

# Diagnostica sistema
npm run system:diagnose
```

---

## 🎉 Congratulazioni!

Se hai seguito tutti i passi, dovresti avere un ambiente NikCLI Background Agents completamente funzionante!

**Prossimi passi:**

1. Configura GitHub integration
2. Crea il tuo primo Background Agent
3. Esplora le funzionalità avanzate
4. Contribuisci al progetto!

**Happy Coding! 🚀**
