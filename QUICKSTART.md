# 🚀 nikCLI Background Agents - Quick Start Guide

Questo è il sistema completo di Background Agents per nikCLI che hai appena implementato!

## 🎯 Cosa hai ottenuto

✅ **Background Agent Service** - Servizio principale per gestire job asincroni  
✅ **Job Queue System** - Queue locale e Redis per scalabilità  
✅ **Security Policies** - Sandbox e policy di sicurezza complete  
✅ **GitHub Integration** - Automazione branch, PR e webhooks  
✅ **Environment Parser** - Configurazione progetti con .nik/environment.json  
✅ **Playbook System** - Template YAML per automatizzare task comuni  
✅ **API REST Server** - Server Express con SSE per real-time  
✅ **CLI Tools** - nikctl per controllo e nikd per daemon  
✅ **Docker Deployment** - Configurazione completa per produzione  

## 🏁 Test Rapido

### 1. Prepara l'ambiente

```bash
cd /Volumes/SSD/Documents/Personal/nikcli-main

# Installa dipendenze (se necessario)
yarn install

# Build del progetto
yarn build

# Crea file di configurazione
cp .env.example .env
# Modifica .env con le tue API keys
```

### 2. Test in un progetto di esempio

```bash
# Vai in un progetto di test
cd /path/to/your/test-project

# Crea configurazione nikCLI Background Agents
mkdir -p .nik
cp /Volumes/SSD/Documents/Personal/nikcli-main/examples/environment.json .nik/
cp /Volumes/SSD/Documents/Personal/nikcli-main/examples/*.yaml .nik/

# Personalizza environment.json per il tuo progetto
cat > .nik/environment.json << 'EOF'
{
  "snapshot": "auto",
  "install": "yarn install",
  "terminals": [
    {
      "name": "Dev Server",
      "command": "yarn dev",
      "autoStart": false
    }
  ],
  "secrets": ["OPENAI_API_KEY"],
  "cache": ["node_modules"],
  "policies": {
    "maxMemoryMB": 2048,
    "maxCpuPercent": 70,
    "networkPolicy": "restricted",
    "allowedDomains": ["registry.npmjs.org", "yarnpkg.com"],
    "timeoutMinutes": 15
  }
}
EOF
```

### 3. Avvia il sistema

```bash
# Torna alla directory nikCLI
cd /Volumes/SSD/Documents/Personal/nikcli-main

# Avvia il daemon (in un terminale)
yarn daemon:start

# In un altro terminale, testa un job
yarn nikctl bg start \
  --repo "test/project" \
  --task "analyze project structure and create documentation" \
  --time 10

# Monitora il job
yarn nikctl bg list
yarn nikctl bg stats
```

### 4. Test con Docker (opzionale)

```bash
# Build immagine Docker
yarn docker:build

# Avvia stack completo
yarn docker:up

# Verifica che tutto funzioni
curl http://localhost:3000/health

# Testa API
curl -X POST http://localhost:3000/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "test/repo",
    "task": "fix failing tests",
    "baseBranch": "main"
  }'
```

## 🎮 Comandi Principali

### nikctl - Job Management

```bash
# Crea un nuovo job
yarn nikctl bg start \
  --repo "owner/repo" \
  --task "your task description" \
  --playbook "fix-tests" \
  --time 20 \
  --reviewers "@team"

# Lista job
yarn nikctl bg list
yarn nikctl bg list --status running

# Dettagli job
yarn nikctl bg show <jobId>

# Log in tempo reale
yarn nikctl bg logs <jobId> --follow

# Statistiche
yarn nikctl bg stats

# Follow-up durante esecuzione
yarn nikctl bg followup <jobId> "additional instructions"

# Cancella job
yarn nikctl bg cancel <jobId>
```

### nikd - Daemon Management

```bash
# Avvia daemon
yarn nikd start --port 3000

# Con Redis
yarn nikd start --redis redis://localhost:6379

# Con GitHub integration
yarn nikd start \
  --github-app-id 123456 \
  --github-private-key ./secrets/github.pem \
  --github-installation-id 789

# Status check
yarn nikd status

# Log monitoring
yarn nikd logs
```

## 📋 Playbook di Esempio

I playbook sono nella cartella `examples/` e `.nik/`:

- **fix-tests.yaml** - Risolve test falliti
- **upgrade-deps.yaml** - Aggiorna dipendenze
- **add-feature.yaml** - Implementa nuove feature
- **security-audit.yaml** - Security audit e fixes
- **performance-analysis.yaml** - Analisi performance

### Crea un playbook personalizzato

```bash
cat > .nik/custom-task.yaml << 'EOF'
name: "custom-task"
agent: "universal-agent"
goals:
  - "Your custom goal here"
limits:
  max_tool_calls: 30
  max_time_minutes: 15
policy:
  approve_commands: false
  network_allow: ["registry.npmjs.org"]
  safe_mode: true
steps:
  - run: "nikcli /analyze-project"
  - run: "nikcli /auto 'your custom task'"
  - run: "yarn test"
commit:
  message: "feat: custom task completed"
  open_pr: true
  labels: ["automated"]
EOF
```

## 🔧 Architettura Implementata

```
├── src/cli/background-agents/
│   ├── api/server.ts                 # REST API + SSE
│   ├── core/
│   │   ├── environment-parser.ts     # Parser .nik/environment.json
│   │   └── playbook-parser.ts        # Parser .nik/*.yaml
│   ├── github/github-integration.ts  # GitHub App + PR automation
│   ├── queue/job-queue.ts            # Redis/Local queue
│   ├── security/security-policy.ts   # Sandbox + policies
│   ├── background-agent-service.ts   # Main service
│   └── types.ts                      # TypeScript definitions
├── src/cli/commands/background-agents.ts  # CLI commands
├── src/cli/nikctl.ts                      # Job control CLI
├── src/cli/nikd.ts                        # Daemon runner
├── examples/                              # Configuration examples
├── docker-compose.yml                     # Production deployment
├── Dockerfile                             # Container build
└── BACKGROUND_AGENTS.md                   # Full documentation
```

## 🎯 Prossimi Passi

1. **Testa il sistema** con i comandi sopra
2. **Personalizza environment.json** per i tuoi progetti
3. **Crea playbook** per i tuoi workflow
4. **Configura GitHub App** (opzionale) per PR automation
5. **Deploy con Docker** per uso in produzione

## 🐛 Troubleshooting

### Job non si avvia
```bash
# Verifica daemon
yarn nikd status

# Controlla logs
yarn nikctl bg logs <jobId>

# Verifica environment
cat .nik/environment.json | jq .
```

### Problemi Docker
```bash
# Rebuild
yarn docker:build --no-cache

# Logs dettagliati
yarn docker:logs nikd-api
```

## 📞 Supporto

Se hai problemi:

1. Controlla i log del daemon
2. Verifica le configurazioni environment.json
3. Testa con playbook semplici
4. Usa Docker per isolamento completo

---

## 🎉 Hai replicato con successo i Background Agents di Cursor!

Il tuo sistema ora supporta:
- ✅ Job asincroni con nikCLI come motore
- ✅ Configurazioni environment per progetto  
- ✅ Playbook YAML per task standard
- ✅ Queue scalabile (locale + Redis)
- ✅ Sicurezza sandbox completa
- ✅ GitHub automation (branch + PR)
- ✅ Dashboard web e CLI tools
- ✅ Deploy Docker ready per produzione

**Enjoy automating your development workflow!** 🚀
