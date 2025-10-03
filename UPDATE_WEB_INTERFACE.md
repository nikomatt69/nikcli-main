# 🎉 Aggiornamento: Interfaccia Web per Background Agents

## ✨ Novità

È stata creata una **interfaccia web completa** per gestire i background agents di NikCLI! 

### 🚀 Come Iniziare

```bash
# 1. Installa le dipendenze (se non l'hai già fatto)
npm install

# 2. Configura l'ambiente
cp .env.example .env
# Aggiungi la tua ANTHROPIC_API_KEY nel file .env

# 3. Avvia tutto
npm run bg:web
```

Poi apri il browser su: **http://localhost:3001**

## 📁 File Creati

### Documentazione
- ✅ `README_WEB_INTERFACE.md` - Guida completa (in italiano)
- ✅ `QUICKSTART_WEB.md` - Guida rapida per iniziare
- ✅ `WEB_INTERFACE_SUMMARY.md` - Riepilogo tecnico dettagliato
- ✅ `src/web/README.md` - Documentazione tecnica completa

### Configurazione
- ✅ `.env.example` - Template variabili d'ambiente
- ✅ `next.config.js` - Configurazione Next.js
- ✅ `tailwind.config.js` - Configurazione Tailwind CSS
- ✅ `postcss.config.js` - Configurazione PostCSS
- ✅ `tsconfig.web.json` - TypeScript config per web
- ✅ `.eslintrc.json` - ESLint configuration

### Applicazione Web (src/web/)

#### Pages
- ✅ `pages/dashboard.tsx` - Dashboard con statistiche
- ✅ `pages/jobs-list.tsx` - Lista job con filtri
- ✅ `pages/job-create.tsx` - Form creazione job
- ✅ `pages/job-details.tsx` - Dettagli job con log live

#### App Router
- ✅ `app/layout.tsx` - Layout principale
- ✅ `app/page.tsx` - Homepage (dashboard)
- ✅ `app/globals.css` - Stili globali
- ✅ `app/jobs/page.tsx` - Pagina lista job
- ✅ `app/jobs/new/page.tsx` - Pagina crea job
- ✅ `app/jobs/[id]/page.tsx` - Pagina dettagli job

#### Backend
- ✅ `src/cli/background-agents/api/start-server.ts` - Server API standalone

### Script Aggiunti a package.json
```json
{
  "web:dev": "next dev -p 3001",
  "web:build": "next build", 
  "web:start": "next start -p 3001",
  "bg:server": "ts-node ... start-server.ts",
  "bg:web": "concurrently \"npm run bg:server\" \"npm run web:dev\""
}
```

## 🎨 Funzionalità

### ✅ Dashboard
- Statistiche in tempo reale (totale, running, queued, succeeded, failed, cancelled)
- Quick actions per operazioni comuni
- System status overview
- Auto-refresh ogni 5 secondi

### ✅ Gestione Job
- **Crea Job**: Form intuitivo con validazione
- **Lista Job**: Visualizza e filtra per stato
- **Dettagli Job**: Monitor in tempo reale con log live
- **Follow-up**: Invia messaggi agli agent in esecuzione
- **Cancellazione**: Interrompi job

### ✅ Real-time
- WebSocket per aggiornamenti live
- Server-Sent Events per streaming log
- Indicatori stato connessione

### ✅ UI/UX
- Design moderno e responsive
- Animazioni fluide (Framer Motion)
- Dark mode
- Mobile-friendly

## 🛠️ Stack Tecnologico

- **Frontend**: Next.js 14 (App Router)
- **UI**: React 18 + Tailwind CSS
- **Animazioni**: Framer Motion
- **Real-time**: WebSocket + SSE
- **Type Safety**: TypeScript
- **State**: React Context

## 📖 Guida Rapida

### 1. Avvia l'Applicazione

```bash
npm run bg:web
```

Questo avvia:
- API Server su `http://localhost:3000`
- Web Interface su `http://localhost:3001`

### 2. Crea il Tuo Primo Job

1. Vai su http://localhost:3001
2. Clicca "Create New Job"
3. Compila:
   - Repository: `nikomatt69/nikcli`
   - Task: "Add a feature to handle CSV parsing"
   - Branch: `main`
4. Clicca "Create Job"

### 3. Monitora il Progresso

- Vedi i log in tempo reale
- Controlla le metriche (tokens, tool calls, tempo)
- Quando completo, vedrai il link alla PR

### 4. Invia Follow-up (Opzionale)

Se il job è in esecuzione:
- Scrivi un messaggio nella casella
- L'agent lo riceverà e lo elaborerà

## 🔗 Endpoint API

Il server API fornisce:

- `POST /v1/jobs` - Crea job
- `GET /v1/jobs` - Lista job
- `GET /v1/jobs/:id` - Dettagli job
- `DELETE /v1/jobs/:id` - Cancella job
- `GET /v1/jobs/:id/stream` - Stream log (SSE)
- `POST /v1/jobs/:id/message` - Follow-up message
- `GET /v1/stats` - Statistiche

WebSocket su `ws://localhost:3000/ws` per eventi real-time.

## 🚢 Deploy in Produzione

### Build

```bash
npm run build
npm run web:build
```

### Start

```bash
NODE_ENV=production npm run bg:server &
npm run web:start
```

### Vercel

```bash
vercel deploy
```

### Docker

```bash
docker build -t nikcli-bg .
docker-compose up -d
```

## 📚 Documentazione

Leggi la documentazione completa:

1. **Quick Start**: `QUICKSTART_WEB.md`
2. **Guida Utente**: `README_WEB_INTERFACE.md` (Italiano)
3. **Docs Tecniche**: `src/web/README.md`
4. **Summary**: `WEB_INTERFACE_SUMMARY.md`

## 🎯 Esempi d'Uso

### Aggiungere una Feature
```
Repository: owner/repo
Task: "Add user authentication with JWT"
Branch: main
Time: 30 min
```

### Fix Tests
```
Repository: owner/repo  
Task: "Fix failing tests in auth module"
Branch: develop
Time: 20 min
```

### Refactoring
```
Repository: owner/repo
Task: "Refactor database queries to use transactions"
Branch: main
Time: 45 min
```

## 🔍 Struttura Cartelle

```
nikcli/
├── src/web/                    # Interfaccia web
│   ├── app/                    # Next.js App Router
│   ├── components/             # Componenti React
│   ├── lib/                    # Utilities (API, WS, Context)
│   ├── pages/                  # Page components
│   └── types/                  # TypeScript types
│
├── src/cli/background-agents/  # Backend
│   └── api/
│       ├── server.ts           # Express server
│       ├── start-server.ts     # Standalone starter
│       └── web-routes.ts       # Web routes
│
├── Documentation/
│   ├── README_WEB_INTERFACE.md    # Guida IT
│   ├── QUICKSTART_WEB.md          # Quick start
│   └── WEB_INTERFACE_SUMMARY.md   # Summary
│
└── Config/
    ├── .env.example
    ├── next.config.js
    ├── tailwind.config.js
    └── tsconfig.web.json
```

## ⚡ Quick Commands

```bash
# Avvia tutto
npm run bg:web

# Solo API server
npm run bg:server

# Solo web interface
npm run web:dev

# Build produzione
npm run build && npm run web:build

# Start produzione
npm run web:start
```

## 🐛 Troubleshooting

### Porta già in uso
```bash
BG_API_PORT=3002 npm run bg:server
npm run web:dev -- -p 3003
```

### WebSocket non connesso
1. Verifica API server running
2. Controlla URL in `src/web/lib/api-client.ts`

### Errori build
```bash
rm -rf .next node_modules
npm install
```

## ✨ Caratteristiche Chiave

1. ✅ Gestione completa ciclo di vita job
2. ✅ Monitoraggio real-time
3. ✅ UI moderna e responsive
4. ✅ Type-safe development
5. ✅ Documentazione completa
6. ✅ Deploy facile
7. ✅ Architettura production-ready

## 🎊 Prossimi Passi

Potenziali miglioramenti futuri:
- [ ] GitHub OAuth
- [ ] Notifiche Slack
- [ ] Email alerts
- [ ] Job templates
- [ ] Batch operations
- [ ] Analytics dashboard
- [ ] Multi-user support

## 🆘 Supporto

- 📖 Docs: Vedi file README_*.md
- 💬 [Discussions](https://github.com/nikomatt69/nikcli/discussions)
- 🐛 [Issues](https://github.com/nikomatt69/nikcli/issues)

---

## 🚀 Inizia Subito!

```bash
# One-liner per partire
npm install && cp .env.example .env && npm run bg:web
```

Poi apri **http://localhost:3001** 🎉

---

**L'interfaccia web è completa e pronta all'uso!** 

Tutti i file sono stati creati e il sistema è operativo. Puoi ora gestire i tuoi background agents tramite un'interfaccia web moderna e intuitiva.

Buon lavoro! 🚀
