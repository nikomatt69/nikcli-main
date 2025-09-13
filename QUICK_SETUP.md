# ⚡ Setup Rapido - NikCLI Background Agents

## 🚀 Setup in 3 Minuti

### 1. Installa e Configura

```bash
# Clona e installa
git clone <repository-url>
cd nikcli-main
npm install

# Setup automatico delle variabili d'ambiente
npm run setup
```

### 2. Avvia l'Applicazione

```bash
# Avvia entrambi i server
npm run web:full
```

### 3. Apri l'Interfaccia

```
🌐 Web Interface: http://localhost:3001
🔌 API Server: http://localhost:3000
```

## 🔑 Chiavi API Minime Richieste

### GitHub (Obbligatorio)

1. Vai su: https://github.com/settings/applications/new
2. Crea OAuth App:
   - **Name**: NikCLI Background Agents
   - **Homepage**: http://localhost:3001
   - **Callback**: http://localhost:3001/api/v1/web/auth/github/callback
3. Crea Personal Access Token: https://github.com/settings/tokens/new
   - Scopes: `repo`, `user:read`, `workflow`

### Anthropic Claude (Obbligatorio)

1. Vai su: https://console.anthropic.com/
2. Crea account e ottieni API Key

## 📋 Comandi Essenziali

```bash
# Setup
npm run setup              # Configurazione guidata
npm install                # Installa dipendenze

# Sviluppo
npm run web:full           # Avvia tutto
npm run web:dev            # Solo web interface
npm run web:server         # Solo API server

# Produzione
npm run build              # Build
npm run web:start          # Avvia in produzione

# Debug
npm run config:check       # Verifica configurazione
npm run system:diagnose    # Diagnostica sistema
```

## 🐛 Problemi Comuni

### Porta già in uso

```bash
# Trova e termina processo
lsof -i :3000
lsof -i :3001
kill -9 <PID>
```

### Errori di dipendenze

```bash
# Pulisci e reinstalla
rm -rf node_modules package-lock.json
npm install
```

### API non funzionano

```bash
# Verifica che entrambi i server siano attivi
curl http://localhost:3000/health
curl http://localhost:3001/api/v1/web/config
```

## 📚 Documentazione Completa

Per setup dettagliato, troubleshooting avanzato e configurazioni personalizzate, leggi:

- **SETUP_GUIDE.md** - Guida completa passo-passo
- **docs/** - Documentazione tecnica
- **BACKGROUND_AGENTS.md** - Guida agli agenti

## 🆘 Supporto

- **Issues**: GitHub Issues per bug
- **Discord**: Community support
- **Email**: support@nikcli.dev

---

**Happy Coding! 🚀**
