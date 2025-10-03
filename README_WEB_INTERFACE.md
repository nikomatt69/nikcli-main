# 🌐 NikCLI Background Agents - Web Interface

## Interfaccia Web per Gestione Background Agents

Una moderna interfaccia web per creare, monitorare e gestire i background agents di NikCLI in tempo reale.

## ✨ Caratteristiche Principali

### 📊 Dashboard in Tempo Reale
- Statistiche complete su tutti i job (totali, in esecuzione, completati, falliti)
- Azioni rapide per operazioni comuni
- Monitoraggio dello stato del sistema
- Aggiornamenti automatici ogni 5 secondi

### 🤖 Gestione Job Completa
- **Creazione Job**: Form intuitivo per configurare nuovi task
- **Lista Job**: Visualizzazione e filtraggio per stato
- **Dettagli Job**: Monitoraggio in tempo reale con log live
- **Messaggi Follow-up**: Invia istruzioni agli agent in esecuzione
- **Cancellazione Job**: Interrompi job in esecuzione o in coda

### 🔄 Aggiornamenti in Tempo Reale
- WebSocket per aggiornamenti istantanei
- Server-Sent Events per streaming dei log
- Indicatori di stato della connessione
- Auto-refresh dei dati

### 🎨 UI/UX Moderna
- Design responsive per desktop e mobile
- Animazioni fluide con Framer Motion
- Supporto modalità scura/chiara
- Interfaccia intuitiva e accessibile

## 🚀 Avvio Rapido

### 1. Installazione

```bash
# Installa le dipendenze
npm install
# oppure
pnpm install
```

### 2. Configurazione

```bash
# Copia il file di esempio
cp .env.example .env

# Modifica .env con le tue chiavi API
# Richiesto: ANTHROPIC_API_KEY
# Opzionale: GITHUB_TOKEN, OPENAI_API_KEY
```

### 3. Avvia l'Applicazione

**Opzione A: Avvia tutto insieme (Consigliato)**
```bash
npm run bg:web
```

**Opzione B: Avvia separatamente**
```bash
# Terminale 1: Server API
npm run bg:server

# Terminale 2: Interfaccia Web
npm run web:dev
```

### 4. Accedi all'Interfaccia

Apri il browser su: **http://localhost:3001**

## 📖 Guida Uso

### Creare un Job

1. Clicca su **"Create New Job"** o vai su `/jobs/new`
2. Compila il form:
   - **Repository**: es. `nikomatt69/nikcli`
   - **Task**: Descrivi cosa deve fare l'agent
   - **Base Branch**: `main` (o il tuo branch preferito)
3. Configura i limiti (opzionale):
   - Tempo massimo: 30 minuti
   - Tool calls massimi: 50
   - Memoria massima: 2048 MB
4. Clicca **"Create Job"**

### Monitorare i Job

1. Dashboard: panoramica rapida di tutti i job
2. Jobs List: elenco dettagliato con filtri per stato
3. Job Details: log in tempo reale e metriche

### Inviare Messaggi Follow-up

Per i job in esecuzione:
1. Apri la pagina dei dettagli del job
2. Scrivi il messaggio nella casella di input
3. Premi Invio o clicca Invia
4. L'agent riceverà ed elaborerà il messaggio

## 📁 Struttura del Progetto

```
src/web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Layout root
│   ├── page.tsx           # Dashboard
│   ├── jobs/              # Pagine job
│   └── globals.css        # Stili globali
│
├── components/
│   ├── layout/            # Componenti layout
│   │   ├── main-layout.tsx
│   │   └── sidebar.tsx
│   └── ui/                # Componenti UI
│
├── lib/
│   ├── api-client.ts      # Client API REST
│   ├── websocket-context.tsx
│   ├── theme-context.tsx
│   └── config-context.tsx
│
├── pages/                 # Componenti pagina
│   ├── dashboard.tsx
│   ├── jobs-list.tsx
│   ├── job-create.tsx
│   └── job-details.tsx
│
└── types/                 # Definizioni TypeScript
```

## 🔌 Endpoint API

### Gestione Job
- `POST /v1/jobs` - Crea job
- `GET /v1/jobs` - Lista job
- `GET /v1/jobs/:id` - Dettagli job
- `DELETE /v1/jobs/:id` - Cancella job
- `POST /v1/jobs/:id/message` - Invia follow-up
- `GET /v1/jobs/:id/stream` - Stream log (SSE)

### Statistiche
- `GET /v1/stats` - Statistiche sistema
- `GET /v1/queue/stats` - Statistiche coda

### Configurazione
- `GET /api/v1/web/config` - Ottieni config
- `POST /api/v1/web/config` - Aggiorna config

## 🛠️ Tecnologie Utilizzate

- **Frontend**: Next.js 14 (App Router)
- **UI**: React 18 + Tailwind CSS
- **Animazioni**: Framer Motion
- **Real-time**: WebSocket + Server-Sent Events
- **Type Safety**: TypeScript
- **State**: React Context

## 🔧 Configurazione Avanzata

### Variabili d'Ambiente

```env
# Server API
BG_API_PORT=3000
CORS_ORIGINS=http://localhost:3001

# Interfaccia Web
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws

# Provider AI
ANTHROPIC_API_KEY=tua_chiave
OPENAI_API_KEY=tua_chiave

# GitHub (Opzionale)
GITHUB_TOKEN=tuo_token
```

### Script Disponibili

```json
"web:dev": "next dev -p 3001",           // Sviluppo
"web:build": "next build",                // Build produzione
"web:start": "next start -p 3001",       // Avvia produzione
"bg:server": "...",                       // Avvia API server
"bg:web": "...",                          // Avvia tutto
```

## 🚢 Deployment

### Build Produzione

```bash
npm run build
npm run web:build
```

### Avvia Produzione

```bash
NODE_ENV=production npm run bg:server &
npm run web:start
```

### Deploy su Vercel

```bash
vercel deploy
```

### Docker

```bash
docker build -t nikcli-bg .
docker-compose up -d
```

## 📚 Documentazione

- **Quick Start**: `QUICKSTART_WEB.md`
- **Documentazione Completa**: `src/web/README.md`
- **Summary**: `WEB_INTERFACE_SUMMARY.md`
- **Esempio Config**: `.env.example`

## 🐛 Risoluzione Problemi

### WebSocket non Connesso
1. Verifica che il server API sia in esecuzione
2. Controlla l'URL WebSocket in configurazione
3. Verifica la console del browser per errori

### Errori API
1. Assicurati che il server API sia sulla porta corretta
2. Controlla la configurazione CORS
3. Rivedi i log del server

### Errori di Build
1. Cancella cache: `rm -rf .next`
2. Reinstalla: `rm -rf node_modules && npm install`
3. Controlla errori TypeScript

## 🎯 Esempi d'Uso

### Aggiungere una Feature
```yaml
Repository: nikomatt69/my-project
Task: "Aggiungi autenticazione JWT"
Branch: main
Tempo: 30 minuti
```

### Correggere Test
```yaml
Repository: nikomatt69/my-project
Task: "Correggi i test falliti nel modulo auth"
Branch: develop
Tempo: 20 minuti
```

### Refactoring
```yaml
Repository: nikomatt69/my-project
Task: "Refactoring delle query database per usare transazioni"
Branch: main
Tempo: 45 minuti
```

## 🎊 Funzionalità Implementate

✅ Creazione job con configurazione personalizzata
✅ Monitoraggio in tempo reale
✅ Streaming log live
✅ Messaggi follow-up agli agent
✅ Cancellazione job
✅ Filtri per stato
✅ Dashboard statistiche
✅ Modalità scura
✅ Design responsive
✅ WebSocket real-time
✅ Validazione form
✅ Gestione errori

## 🔮 Sviluppi Futuri

- [ ] OAuth GitHub
- [ ] Notifiche Slack
- [ ] Alert email
- [ ] Scheduling avanzato
- [ ] Template job
- [ ] Operazioni batch
- [ ] Dashboard analytics
- [ ] Multi-utente

## 💡 Tips

1. Tieni aperta la dashboard per monitorare tutti i job
2. Usa i messaggi follow-up per guidare gli agent senza cancellarli
3. Imposta limiti appropriati per evitare job fuori controllo
4. Usa i playbook per workflow complessi e ripetibili
5. Monitora i log in tempo reale per debug rapido

## 🆘 Supporto

- 📖 [Documentazione](src/web/README.md)
- 💬 [GitHub Discussions](https://github.com/nikomatt69/nikcli/discussions)
- 🐛 [Report Bug](https://github.com/nikomatt69/nikcli/issues)

## 📝 Changelog

### v0.2.3 - Web Interface Release
- ✨ Interfaccia web completa
- ✨ Real-time monitoring
- ✨ Job management UI
- ✨ Dashboard statistiche
- ✨ WebSocket integration
- ✨ SSE log streaming
- ✨ Dark mode support

---

**Buon lavoro con i Background Agents! 🚀**

Per iniziare subito:
```bash
npm install && cp .env.example .env && npm run bg:web
```

Poi apri `http://localhost:3001` nel browser! 🎉
