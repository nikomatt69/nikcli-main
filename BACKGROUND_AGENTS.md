# 🤖 nikCLI Background Agents

Un sistema completo per l'esecuzione automatica di task di sviluppo in background, ispirato ai Background Agents di Cursor ma potenziato da nikCLI.

## 🌟 Caratteristiche

- **🚀 Esecuzione Asincrona**: Job in background mentre continui a lavorare
- **🔒 Ambiente Sicuro**: Sandbox completo con policy di sicurezza
- **📊 Monitoraggio Real-time**: Dashboard web e streaming logs
- **🐙 Integrazione GitHub**: Branch automatici, PR e check status
- **⚙️ Configurabile**: Environment e playbook personalizzabili
- **📈 Scalabile**: Queue Redis e multiple runner instances
- **🎯 Intelligente**: Usa nikCLI come motore AI avanzato

## 🏗 Architettura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   nikctl CLI    │    │  Web Console    │    │  GitHub Hooks   │
│                 │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │       API Server            │
                    │   (Express + Socket.io)     │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │      Job Queue              │
                    │    (Redis / Local)          │
                    └─────────────┬───────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   ┌────▼────┐               ┌────▼────┐               ┌────▼────┐
   │ Runner  │               │ Runner  │               │ Runner  │
   │ nikd #1 │               │ nikd #2 │               │ nikd #3 │
   └─────────┘               └─────────┘               └─────────┘
```

## 🚀 Quick Start

### 1. Installazione

```bash
# Clona e installa nikCLI
git clone https://github.com/your-org/nikcli-main.git
cd nikcli-main
yarn install
yarn build

# Configura environment
cp .env.example .env
# Modifica .env con le tue API keys
```

### 2. Setup Progetto

```bash
# Nella root del tuo progetto, crea la configurazione
mkdir .nik

# Crea environment.json
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
  "cache": ["node_modules", ".next"]
}
EOF

# Copia playbook di esempio
cp examples/*.yaml .nik/
```

### 3. Avvia il Sistema

```bash
# Opzione 1: Docker (raccomandato)
docker-compose up -d

# Opzione 2: Local development
yarn start:daemon &
yarn start:console
```

### 4. Primo Job

```bash
# Avvia un background job
nikctl bg start \
  --repo "your-org/your-repo" \
  --task "fix failing tests in src/components" \
  --playbook "fix-tests" \
  --reviewers "@tech-team"

# Output: Job created: abcd1234

# Monitora i log
nikctl bg logs abcd1234 --follow

# Apri il dashboard
open http://localhost:3001
```

## 📋 Configurazione Avanzata

### Environment (.nik/environment.json)

```json
{
  "snapshot": "auto",
  "install": "yarn install",
  "start": "yarn start:dev",
  "terminals": [
    {
      "name": "Dev Server",
      "command": "yarn dev",
      "autoStart": false,
      "persistent": true
    },
    {
      "name": "Test Watch",
      "command": "yarn test --watch",
      "autoStart": false
    }
  ],
  "secrets": [
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "NEXTAUTH_SECRET"
  ],
  "node": "18",
  "cache": [
    "node_modules",
    ".next",
    ".turbo",
    "dist"
  ],
  "policies": {
    "maxMemoryMB": 4096,
    "maxCpuPercent": 80,
    "networkPolicy": "restricted",
    "allowedDomains": [
      "registry.npmjs.org",
      "github.com",
      "api.openai.com"
    ],
    "timeoutMinutes": 30,
    "allowedCommands": ["yarn", "npm", "git"],
    "blockedCommands": ["rm -rf", "sudo"]
  },
  "hooks": {
    "beforeInstall": ["corepack enable"],
    "afterInstall": ["yarn husky install"],
    "beforeCommit": ["yarn lint", "yarn test"]
  }
}
```

### Playbook (.nik/playbooks/*.yaml)

```yaml
name: "add-feature"
agent: "universal-agent"
goals:
  - "Implementa la feature richiesta"
  - "Aggiungi test appropriati"
  - "Aggiorna documentazione"
limits:
  max_tool_calls: 100
  max_time_minutes: 60
  max_memory_mb: 4096
policy:
  approve_commands: false
  network_allow:
    - "registry.npmjs.org"
    - "api.openai.com"
  safe_mode: true
steps:
  - run: "nikcli /analyze-project"
    timeout_minutes: 5
  - run: "nikcli /auto 'implementa la feature richiesta con test'"
    timeout_minutes: 45
  - run: "yarn build"
    retry_on_failure: true
  - run: "yarn test"
    retry_on_failure: true
commit:
  message: "feat: implementa nuova feature (nikCLI agent)"
  open_pr: true
  reviewers: ["@product-team"]
  labels: ["feature", "automated"]
  draft: true
```

## 🎯 Esempi d'Uso

### Risoluzione Automatica di Test Falliti

```bash
nikctl bg start \
  --repo "acme/webapp" \
  --task "fix all failing unit tests" \
  --playbook "fix-tests" \
  --time 25 \
  --reviewers "@dev-team"
```

### Aggiornamento Dipendenze

```bash
nikctl bg start \
  --repo "acme/webapp" \
  --task "upgrade dependencies to latest versions" \
  --playbook "upgrade-deps" \
  --time 40 \
  --reviewers "@tech-lead"
```

### Implementazione Feature

```bash
nikctl bg start \
  --repo "acme/webapp" \
  --task "add dark mode toggle to header component" \
  --playbook "add-feature" \
  --time 60 \
  --reviewers "@ui-team" \
  --labels "feature,ui" \
  --draft
```

### Security Audit

```bash
nikctl bg start \
  --repo "acme/webapp" \
  --task "security audit and vulnerability fixes" \
  --playbook "security-audit" \
  --reviewers "@security-team" \
  --labels "security"
```

## 📊 Monitoraggio e Dashboard

### Web Console (http://localhost:3001)

- **📋 Jobs Dashboard**: Lista e status di tutti i job
- **📈 Real-time Logs**: Streaming logs con sintassi highlight
- **🔗 GitHub Integration**: Link diretti alle PR create
- **📊 Metrics**: Token usage, execution time, success rate
- **⚙️ Playbook Management**: Editor e templates

### CLI Monitoring

```bash
# Lista tutti i job
nikctl bg list

# Job attivi
nikctl bg list --status running

# Statistiche
nikctl bg stats

# Logs in tempo reale
nikctl bg logs <jobId> --follow

# Follow-up durante esecuzione
nikctl bg followup <jobId> "aggiungi anche i test di integrazione"
```

## 🔧 Comandi CLI

### nikctl (Job Management)

```bash
# Job lifecycle
nikctl bg start --repo <repo> --task <task> [options]
nikctl bg list [--status <status>] [--repo <repo>]
nikctl bg show <jobId>
nikctl bg cancel <jobId>
nikctl bg retry <jobId>

# Monitoring
nikctl bg logs <jobId> [--follow] [--tail <lines>]
nikctl bg stats [--json]

# Interaction
nikctl bg followup <jobId> <message> [--priority high|normal|low]
nikctl bg open <jobId> [--pr]
```

### nikd (Daemon Management)

```bash
# Daemon control
nikd start [--port 3000] [--redis <url>] [--max-concurrent 3]
nikd status [--api-url <url>]
nikd logs [--api-url <url>]

# GitHub integration
nikd start \
  --github-app-id <id> \
  --github-private-key <path> \
  --github-installation-id <id> \
  --github-webhook-secret <secret>
```

## 🔒 Sicurezza

### Sandbox Environment

- **Container Isolation**: Ogni job in container Docker isolato
- **Resource Limits**: CPU, memoria e tempo di esecuzione limitati
- **Network Restrictions**: Solo domini approvati accessibili
- **File System**: Accesso limitato al workspace del progetto

### Command Filtering

```typescript
// Comandi automaticamente bloccati
const blockedCommands = [
  'rm -rf /', 'sudo rm', 'format', 'dd if=',
  'shutdown', 'reboot', 'halt'
];

// Comandi che richiedono approvazione
const approvalRequired = [
  'sudo', 'chmod 777', 'usermod', 'systemctl'
];
```

### Network Security

```json
{
  "allowedDomains": [
    "registry.npmjs.org",
    "yarnpkg.com", 
    "github.com",
    "api.openai.com",
    "api.anthropic.com"
  ]
}
```

## 🚀 Deployment

### Docker Compose (Produzione)

```bash
# Setup
cp .env.example .env
# Configura le variabili d'ambiente

# Deploy completo
docker-compose up -d

# Scale runners
docker-compose up -d --scale nikd-runner=5

# Monitoring
docker-compose logs -f nikd-api
docker-compose logs -f nikd-runner-1
```

### Kubernetes

```yaml
# Helm chart disponibile in ./k8s/
helm install nikcli-bg ./k8s/helm-chart \
  --set api.replicas=2 \
  --set runner.replicas=5 \
  --set redis.enabled=true
```

### Cloud Deploy

```bash
# AWS ECS
aws ecs create-cluster --cluster-name nikcli-bg
# Configurazione in ./aws/

# Google Cloud Run
gcloud run deploy nikcli-bg --source .
# Configurazione in ./gcp/

# Azure Container Instances  
az container create --resource-group nikbg --name nikcli-bg
# Configurazione in ./azure/
```

## 📈 Metriche e Analytics

### Built-in Metrics

- **Job Success Rate**: Percentuale di job completati con successo
- **Execution Time**: Tempo medio di esecuzione per tipo di task
- **Token Usage**: Consumo API e costi
- **Resource Utilization**: CPU, memoria, network
- **Queue Performance**: Latenza e throughput

### Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'nikcli-bg'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Grafana Dashboards

- **Job Overview**: Status, rates, durations
- **System Health**: Resources, errors, latency  
- **Cost Analysis**: Token usage e spesa API
- **Security**: Violations e blocked commands

## 🤝 Contributing

### Development Setup

```bash
# Clone e setup
git clone https://github.com/your-org/nikcli-main.git
cd nikcli-main
yarn install

# Development environment
yarn dev:daemon &
yarn dev:console &
yarn dev:cli

# Tests
yarn test
yarn test:integration
yarn test:e2e
```

### Architecture Overview

```
src/cli/background-agents/
├── api/                 # REST API server
├── core/                # Environment & Playbook parsers
├── github/              # GitHub integration  
├── queue/               # Job queue (Redis/Local)
├── security/            # Security policies
├── types.ts             # TypeScript definitions
└── background-agent-service.ts  # Main service
```

## 📚 Esempi Completi

Vedi la cartella `examples/` per:

- **Monorepo Setup**: Configurazione per progetti multi-package
- **Next.js Project**: Environment e playbook specifici
- **API Development**: Task per backend e testing
- **Mobile App**: React Native e deployment  
- **ML Project**: Python, Jupyter, model training

## 🆘 Troubleshooting

### Job Stuck in Queue

```bash
# Controlla runner status
docker-compose logs runner

# Verifica Redis queue
redis-cli monitor

# Resource limits
docker stats
```

### GitHub Integration Issues

```bash
# Verifica GitHub App permissions
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/app/installations/$INSTALLATION_ID

# Webhook events
ngrok http 3000  # Per development
```

### Performance Issues

```bash
# Enable debug logging
export LOG_LEVEL=debug
docker-compose restart

# Profile job execution
nikctl bg start --task "test task" --debug

# Monitor resource usage
docker-compose top
```

## 📄 License

MIT License - vedi [LICENSE](LICENSE) per dettagli.

---

## 🎉 Ready to automate your development workflow?

Inizia subito con il [Quick Start](#-quick-start) e scopri come nikCLI Background Agents possono trasformare il tuo modo di sviluppare! 🚀
