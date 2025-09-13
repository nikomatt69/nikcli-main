# 🌐 Background Agents Web Interface

Una moderna web interface per gestire i Background Agents di NikCLI, ispirata a Cursor Agents.

## ✨ Funzionalità

### 🎯 Dashboard Principale

- **Overview completa** con statistiche in tempo reale
- **Job monitoring** con status live via WebSocket
- **Quick actions** per configurazione e creazione agent

### ⚙️ Configurazione Avanzata

- **GitHub Integration** con OAuth flow completo
- **Repository Selection** con preview e informazioni
- **Model Configuration** per selezione AI model di default
- **Notifications** per Slack e Linear integration

### 🤖 Job Management

- **Creazione job** con task description interattiva
- **Real-time monitoring** degli agent in esecuzione
- **Log streaming** per debug e monitoraggio
- **PR automatiche** al completamento delle task

### 📸 Snapshot System

- **Project snapshots** per restore points sicuri
- **Automatic backup** prima dell'esecuzione agent
- **Storage management** con statistiche dettagliate
- **One-click restore** per rollback veloce

## 🚀 Quick Start

### 1. Avvia il Sistema Completo

```bash
# Avvia backend API + frontend insieme
npm run web:full

# O separatamente:
npm run web:server    # Backend API (porta 3000)
npm run web:dev      # Frontend Next.js (porta 3001)
```

### 2. Prima Configurazione

1. **Apri**: http://localhost:3001
2. **Vai su**: Configurazione → GitHub
3. **Connect GitHub**: OAuth flow per repository access
4. **Seleziona Repository**: Scegli default repository
5. **Ready!** Crea il tuo primo Background Agent

### 3. Crea il tuo Primo Agent

```
Task Example: "Refactor the authentication module to use TypeScript strict mode and add comprehensive error handling"
```

## 🏗️ Architettura

### Frontend (Next.js 14 + TypeScript)

```
src/web/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Dashboard principale
│   ├── config/           # Configurazione e setup
│   ├── jobs/             # Job management interface
│   └── snapshots/        # Snapshot management
├── components/           # Componenti riutilizzabili
│   ├── ui/              # Button, Card, Input components
│   └── layout/          # Sidebar, MainLayout
├── lib/                 # Context providers e utilities
└── styles/             # CSS globale e Tailwind
```

### Backend API Extensions

```
src/cli/background-agents/api/
├── server.ts            # Server principale esteso
├── web-routes.ts        # Endpoint web interface
└── websocket-server.ts  # Real-time updates
```

### 🔄 Real-time Architecture

- **WebSocket Server**: Aggiornamenti live su job status
- **Event Broadcasting**: Notifiche istantanee su completion
- **Connection Management**: Auto-reconnect e heartbeat
- **Client Sync**: Stato sincronizzato tra tutti i client

## 🛠️ Tecnologie

| Categoria         | Tecnologia   | Versione |
| ----------------- | ------------ | -------- |
| **Frontend**      | Next.js      | 14.x     |
| **Styling**       | Tailwind CSS | 3.x      |
| **Language**      | TypeScript   | 5.x      |
| **State**         | Context API  | -        |
| **Real-time**     | WebSocket    | ws 8.x   |
| **Icons**         | Lucide React | -        |
| **UI Components** | Headless UI  | 2.x      |

## 🎨 Design System

### Colori & Tema

- **Primary**: Blue gradient
- **Dark/Light mode**: Supporto completo
- **Status colors**: Green (success), Red (error), Blue (running), Yellow (queued)

### Componenti UI

- **Consistency**: Design system unificato
- **Accessibility**: ARIA labels e keyboard navigation
- **Responsive**: Mobile-first design
- **Animations**: Smooth transitions con CSS/Tailwind

## 📡 API Endpoints

### Configurazione

- `GET/POST /api/v1/web/config` - Gestione configurazione
- `GET /api/v1/web/auth/github` - GitHub OAuth flow
- `GET /api/v1/web/repositories` - Lista repository GitHub

### Job Management

- `GET/POST /api/v1/web/jobs` - Lista e creazione job
- `GET/DELETE /api/v1/web/jobs/:id` - Dettagli e cancellazione
- `WebSocket /ws` - Real-time updates

### Snapshots

- `GET/POST /api/v1/web/snapshots` - Lista e creazione snapshot
- `GET/DELETE /api/v1/web/snapshots/:id` - Dettagli e eliminazione

## 🔒 Sicurezza

### GitHub OAuth

- **Secure flow**: PKCE + state verification
- **Scope minimal**: Solo repository access necessari
- **Token storage**: Secure environment variables

### WebSocket Security

- **Origin validation**: CORS policy enforcement
- **Rate limiting**: Anti-abuse protection
- **Connection limits**: Max concurrent connections

## 🧪 Testing & Development

### Development Scripts

```bash
npm run web:dev          # Frontend development server
npm run web:server       # Backend API server
npm run web:full         # Entrambi con concurrently
npm run web:build        # Production build
npm run web:start        # Production server
```

### Environment Setup

```bash
# Required environment variables
GITHUB_TOKEN=ghp_xxx           # GitHub Personal Access Token
GITHUB_CLIENT_ID=xxx           # OAuth Client ID
GITHUB_CLIENT_SECRET=xxx       # OAuth Client Secret

# Optional
ANTHROPIC_API_KEY=sk-xxx       # Claude API
OPENAI_API_KEY=sk-xxx         # GPT API
```

## 📚 User Guide

### 1. Setup Iniziale

1. **GitHub Connection**: Necessario per repository access
2. **Repository Selection**: Scegli il repository di default
3. **Model Configuration**: Seleziona AI model preferito

### 2. Creazione Agent

1. **Describe Task**: Scrivi cosa vuoi che l'agent faccia
2. **Review Settings**: Repository, branch, snapshot options
3. **Launch Agent**: Esecuzione automatica in background

### 3. Monitoring & Results

1. **Real-time Updates**: Status e log live
2. **PR Creation**: Automatic pull request generation
3. **Snapshot Management**: Backup e restore capabilities

## 🚨 Troubleshooting

### Problemi Comuni

**WebSocket non si connette**

```bash
# Verifica che il backend sia in running
curl http://localhost:3000/health

# Verifica CORS settings
# Controlla browser console per errori
```

**GitHub OAuth fallisce**

```bash
# Verifica environment variables
echo $GITHUB_CLIENT_ID
echo $GITHUB_CLIENT_SECRET

# Verifica redirect URI nella GitHub App
# http://localhost:3000/api/v1/web/auth/github/callback
```

**Build errors**

```bash
# Clear cache
rm -rf .next node_modules
npm install
npm run web:build
```

## 🎉 Pronto per l'Uso!

La web interface è ora **completamente funzionale** e integrata con il sistema Background Agents esistente.

**Avvia con**: `npm run web:full`  
**Apri**: http://localhost:3001  
**Enjoy**: La potenza dei Background Agents in un'interfaccia moderna! 🚀
