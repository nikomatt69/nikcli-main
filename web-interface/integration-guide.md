# Guida all'Integrazione dell'Interfaccia Web

Questa guida spiega come integrare l'interfaccia web con il sistema nikCLI Background Agents esistente.

## 🏗 Architettura dell'Integrazione

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Interface │    │   API Server    │    │ Background      │
│   (Port 8080)   │◄──►│   (Port 3000)   │◄──►│ Agents Service  │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisiti

1. **Node.js 16+** installato
2. **nikCLI Background Agents Service** in esecuzione
3. **API Server** configurato e funzionante

## 🚀 Installazione

### 1. Installa le Dipendenze

```bash
cd /workspace/web-interface
npm install
```

### 2. Configura l'API Server

Modifica il file `src/cli/background-agents/api/server.ts` per aggiungere il supporto CORS:

```typescript
// Aggiungi alla configurazione CORS
cors: {
  origin: [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ],
  credentials: true
}
```

### 3. Avvia i Servizi

```bash
# Terminal 1: Avvia il Background Agents Service
cd /workspace
yarn start:daemon

# Terminal 2: Avvia l'Interfaccia Web
cd /workspace/web-interface
npm start
```

## 🔧 Configurazione

### Variabili d'Ambiente

Crea un file `.env` nella directory `web-interface`:

```env
# Server Configuration
PORT=8080
API_PORT=3000
NODE_ENV=development

# API Configuration
API_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Configurazione del Config Manager

L'interfaccia web può modificare le impostazioni del config manager attraverso le API:

```javascript
// Esempio di configurazione
const configSettings = {
  configPath: '.nik/config.json',
  workspaceRoot: '/workspace',
  modelProvider: 'anthropic',
  defaultModel: 'claude-3-sonnet-20240229',
  temperature: 0.7,
  enableMemory: true,
  enableSnapshots: true,
  maxConcurrentJobs: 3,
  defaultTimeLimit: 30,
  defaultMemoryLimit: 2048
};
```

## 🔌 Integrazione con il Sistema Esistente

### 1. Estendi il BackgroundAgentService

Aggiungi il supporto per l'interfaccia web nel file `src/cli/background-agents/background-agent-service.ts`:

```typescript
import { WebInterfaceIntegration } from './web-interface-integration';

export class BackgroundAgentService extends EventEmitter {
  private webIntegration: WebInterfaceIntegration;

  constructor() {
    super();
    this.webIntegration = new WebInterfaceIntegration(this);
    // ... resto del codice
  }

  // Aggiungi metodi per l'interfaccia web
  getWebIntegration() {
    return this.webIntegration;
  }
}
```

### 2. Aggiungi Route per l'Interfaccia Web

Nel file `src/cli/background-agents/api/server.ts`, aggiungi:

```typescript
import { setupWebInterfaceRoutes } from './web-interface-routes';

// Dopo aver creato l'app Express
setupWebInterfaceRoutes(app, backgroundAgentService);
```

### 3. Configura Server-Sent Events

Aggiungi il supporto per gli aggiornamenti real-time:

```typescript
// Nel server API
app.get('/v1/jobs/stream', (req, res) => {
  const clientId = `client-${Date.now()}`;
  
  // Setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Registra il client
  backgroundAgentService.getWebIntegration().registerWebClient(clientId, res);

  // Handle disconnect
  req.on('close', () => {
    backgroundAgentService.getWebIntegration().unregisterWebClient(clientId);
  });
});
```

## 💬 Comandi Chat Supportati

L'interfaccia web supporta i seguenti comandi in italiano e inglese:

### Gestione Job
- `"Avvia un background agent per [task]"`
- `"Start a background agent to [task]"`
- `"Lista tutti i job"`
- `"List all jobs"`
- `"Mostra lo status del sistema"`
- `"Show system status"`

### Monitoraggio
- `"Visualizza i log recenti"`
- `"View recent logs"`
- `"Apri il dashboard"`
- `"Open dashboard"`

### Configurazione
- `"Apri le impostazioni"`
- `"Open settings"`
- `"Configura le impostazioni degli agenti"`
- `"Configure agent settings"`

## 🔄 Flusso di Dati

### 1. Chat Message Flow
```
User Input → Web Interface → API Server → Background Agent Service → Response
```

### 2. Real-time Updates Flow
```
Background Agent Service → Web Integration → SSE Clients → Web Interface
```

### 3. Configuration Flow
```
Web Interface → API Server → Config Manager → Background Agent Service
```

## 🛠 Sviluppo e Debug

### Debug Mode
```bash
# Abilita debug logging
export DEBUG=nikcli:web-interface
npm start
```

### Test delle API
```bash
# Test health check
curl http://localhost:8080/health

# Test chat API
curl -X POST http://localhost:8080/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Lista tutti i job"}'

# Test SSE
curl -N http://localhost:8080/api/events
```

### Logs
```bash
# Visualizza logs del web server
tail -f logs/web-interface.log

# Visualizza logs dell'API server
tail -f logs/api-server.log
```

## 🚀 Deployment

### Sviluppo Locale
```bash
npm run dev
```

### Produzione con Docker
```bash
docker-compose up -d
```

### Produzione con PM2
```bash
pm2 start server.js --name "nikcli-web-interface"
```

## 🔒 Sicurezza

### CORS Configuration
```typescript
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'https://yourdomain.com'
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
```

### Rate Limiting
```typescript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

## 📊 Monitoring

### Health Checks
```bash
# Web Interface Health
curl http://localhost:8080/health

# API Server Health
curl http://localhost:3000/health
```

### Metrics
L'interfaccia web espone le seguenti metriche:
- Numero di connessioni attive
- Numero di messaggi chat processati
- Tempo di risposta delle API
- Errori e eccezioni

## 🐛 Troubleshooting

### Problemi Comuni

#### 1. CORS Errors
```
Access to fetch at 'http://localhost:3000' from origin 'http://localhost:8080' has been blocked by CORS policy
```
**Soluzione**: Verifica la configurazione CORS nel server API

#### 2. SSE Connection Failed
```
EventSource connection failed
```
**Soluzione**: Verifica che il server supporti Server-Sent Events

#### 3. API Connection Failed
```
Failed to connect to API
```
**Soluzione**: Verifica che il background agents service sia in esecuzione

### Debug Steps
1. Controlla i logs del server
2. Verifica la configurazione delle porte
3. Testa le API individualmente
4. Controlla la configurazione CORS
5. Verifica le dipendenze

## 📚 Risorse Aggiuntive

- [Documentazione Express](https://expressjs.com/)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [WebSocket vs SSE](https://stackoverflow.com/questions/5195452/websockets-vs-server-sent-events-eventsource)

## 🤝 Contributing

Per contribuire all'interfaccia web:

1. Fork il repository
2. Crea un branch per la feature
3. Implementa le modifiche
4. Testa l'integrazione
5. Crea una Pull Request

## 📄 License

MIT License - vedi [LICENSE](../../LICENSE) per dettagli.