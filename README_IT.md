# NikCLI – Assistente AI Autonomo da Terminale (stile Claude Code)

> CLI TypeScript moderna per sviluppo assistito da agenti con UI da terminale, strumenti sicuri, pianificazione autonoma e supporto multi-modello (Anthropic, OpenAI, Google, Ollama).

- Node.js: >= 18 (runtime principale)
- TypeScript: ^5.3
- Binario: `nikcli` (build con Node.js e pkg)
- Config: `~/.nikcli/config.json`
- Pacchetto: `@cadcamfun/nikcli`

---

## ✨ Caratteristiche principali

- UI da terminale in streaming con comandi a barra (`/help`, `/model`, `/agents`, ...)
- Agente Universale “enterprise” con capacità end-to-end (coding, analisi, refactoring, test, DevOps)
- Sistema strumenti sicuro (lettura/scrittura file, grep, run command con approvazioni)
- Pianificazione avanzata e orchestrazione (autonomous/parallel), diff viewer integrato
- Provider AI pluggable: Anthropic, OpenAI, Google, Ollama (locale, senza API key)
- Configurazione persistente lato utente con schema validato (Zod)

---

## 🚀 Installazione

### Opzione A – Locale (sviluppo)

```bash
npm install
npm run build
npm start
```

### Opzione B – Avvio rapido via curl (globale, beta)

Vedere `installer/README.md`. Esempio:

```bash
# Ultima beta
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash

# Versione specifica
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s -- --version
```

Disinstallazione:

```bash
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/uninstall.sh | bash
```

> Nota: l’installer usa `npm i -g`. L’uso di `npm` è preferito (evitare `yarn`).

---

## ⚡ Avvio rapido

```bash
# Interfaccia interattiva
nikcli
# Oppure dalla repo (dev)
./bin/nikcli
```

Esempi rapidi:

```text
/help                      # lista comandi
/model claude-sonnet-4-20250514
/set-key claude-sonnet-4-20250514 sk-ant-...
/read src/cli/index.ts
/grep "ModelProvider"
/run "bun x vitest"
```

---

## 🤖 Modelli supportati (predefiniti)

| Nome                     | Provider   | Modello                  | Richiede API key |
| ------------------------ | ---------- | ------------------------ | ---------------- |
| claude-sonnet-4-20250514 | Anthrop ic | claude-sonnet-4-20250514 | Sì               |
| claude-3-haiku-20240229  | Anthrop ic | claude-3-haiku-20240229  | Sì               |
| gpt-4o-mini              | OpenAI     | gpt-4o-mini              | Sì               |
| gpt-5                    | OpenAI     | gpt-5                    | Sì               |
| gpt-4o                   | OpenAI     | gpt-4o                   | Sì               |
| gpt-4.1                  | OpenAI     | gpt-4.1                  | Sì               |
| gpt-4                    | OpenAI     | gpt-4                    | Sì               |
| gpt-3.5-turbo            | OpenAI     | gpt-3.5-turbo            | Sì               |
| gpt-3.5-turbo-16k        | OpenAI     | gpt-3.5-turbo-16k        | Sì               |
| gemini-pro               | Google     | gemini-pro               | Sì               |
| gemini-1.5-pro           | Google     | gemini-1.5-pro           | Sì               |
| llama3.1:8b              | Ollama     | llama3.1:8b              | No               |
| codellama:7b             | Ollama     | codellama:7b             | No               |
| mistral:7b               | Ollama     | mistral:7b               | No               |

- Cambio modello: `/model <name>` | Lista: `/models` | API key: `/set-key <model> <key>`
- Ollama non richiede chiavi; assicurarsi che `ollama serve` sia attivo (host di default `127.0.0.1:11434`).

---

## 🔧 Configurazione

- Percorso file: `~/.nikcli/config.json`
- Schema: vedi `src/cli/core/config-manager.ts` (Zod `ConfigSchema`)

Esempio minimale:

```json
{
  "currentModel": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 4000,
  "chatHistory": true,
  "maxHistoryLength": 100,
  "systemPrompt": null,
  "autoAnalyzeWorkspace": true,
  "enableAutoApprove": false,
  "models": {
    /* default inclusi */
  },
  "apiKeys": {},
  "mcpServers": {},
  "maxConcurrentAgents": 3,
  "enableGuidanceSystem": true,
  "defaultAgentTimeout": 60000,
  "logLevel": "info",
  "requireApprovalForNetwork": true,
  "approvalPolicy": "moderate",
  "sandbox": {
    "enabled": true,
    "allowFileSystem": true,
    "allowNetwork": false,
    "allowCommands": true
  }
}
```

Chiavi via ambiente (alternative a `/set-key`):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-..."
export GOOGLE_GENERATIVE_AI_API_KEY="..."
# Ollama: nessuna chiave, opzionale OLLAMA_HOST
```

---

## 🧭 Comandi (interfaccia a barre)

Dal file `src/cli/chat/nik-cli-commands.ts`.

| Comando                        | Descrizione                              |
| ------------------------------ | ---------------------------------------- | ----------------------------- |
| `/help`                        | Aiuto e panoramica comandi               |
| `/quit`, `/exit`               | Esci dall’app                            |
| `/clear`                       | Pulisci chat corrente                    |
| `/new [titolo]`                | Nuova sessione                           |
| `/model <name>`                | Seleziona modello corrente               |
| `/models`                      | Elenco modelli disponibili               |
| `/set-key <model> <key>`       | Imposta API key per modello              |
| `/config`                      | Mostra configurazione corrente           |
| `/debug`                       | Informazioni diagnostiche chiavi/modelli |
| `/temp <0.0-2.0>`              | Imposta temperatura                      |
| `/history <on                  | off>`                                    | Abilita/disabilita cronologia |
| `/system <prompt>`             | Imposta system prompt sessione           |
| `/sessions`                    | Elenco sessioni                          |
| `/export [id]`                 | Esporta sessione in Markdown             |
| `/stats`                       | Statistiche di utilizzo                  |
| `/agents`                      | Elenco agenti                            |
| `/agent <name> <task>`         | Esegui agente specifico                  |
| `/auto <descrizione>`          | Esecuzione autonoma multi-step           |
| `/parallel <agents> <task>`    | Esecuzione agenti in parallelo           |
| `/factory`                     | Dashboard factory agenti                 |
| `/create-agent <spec>`         | Crea blueprint agente specializzato      |
| `/launch-agent <blueprint-id>` | Avvia agente da blueprint                |
| `/context <paths>`             | Seleziona path di contesto workspace     |
| `/stream`                      | Dashboard stream agenti                  |
| `/read <file>`                 | Leggi file                               |
| `/write <file> <content>`      | Scrivi file                              |
| `/edit <file>`                 | Editor interattivo                       |
| `/ls [dir]`                    | Lista file/cartelle                      |
| `/search <query>`              | Ricerca (grep-like)                      |
| `/grep <query>`                | Alias ricerca                            |
| `/run <cmd>`                   | Esegui comando shell                     |
| `/install <pkgs>`              | Installa pacchetti (npm/yarn)            |
| `/npm <args>`                  | Comandi npm                              |
| `/yarn <args>`                 | Comandi yarn (sconsigliato)              |
| `/git <args>`                  | Comandi git                              |
| `/docker <args>`               | Comandi docker                           |
| `/ps`                          | Processi attivi                          |
| `/kill <pid>`                  | Termina processo                         |
| `/build`                       | Build progetto                           |
| `/test [pattern]`              | Test (vitest)                            |
| `/lint`                        | Linting                                  |
| `/create <type> <name>`        | Scaffolding progetto                     |

> Nota: i comandi “sensibili” possono richiedere approvazione interattiva (UI `approval-system`).

---

## 🧩 Agenti

Registrazione agenti in `src/cli/register-agents.ts`.

| ID                | Nome            | Descrizione                                                                                                                                       |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `universal-agent` | Universal Agent | Agente all‑in‑one con capacità di coding, analisi, review, ottimizzazione, testing, frontend, backend, DevOps, automazioni e file/terminal tools. |

> Nel codice esistono più classi di agenti in `src/cli/automation/agents/`, ma di default viene registrato l’`UniversalAgent` (orientato all’uso enterprise).

---

## 🛠️ Strumenti (Tools)

Implementati in `src/cli/tools/` con registro e policy di sicurezza.

| Tool                 | File                      | Funzionalità principali                                               |
| -------------------- | ------------------------- | --------------------------------------------------------------------- |
| read-file-tool       | `read-file-tool.ts`       | Lettura sicura, encoding configurabile, `maxLines`, streaming chunked |
| write-file-tool      | `write-file-tool.ts`      | Scrittura sicura, creazione file se assente                           |
| edit-tool            | `edit-tool.ts`            | Editing interattivo con diff                                          |
| multi-edit-tool      | `multi-edit-tool.ts`      | Modifiche multiple atomiche                                           |
| replace-in-file-tool | `replace-in-file-tool.ts` | Sostituzioni mirate con sicurezza                                     |
| find-files-tool      | `find-files-tool.ts`      | Ricerca file (glob)                                                   |
| grep-tool            | `grep-tool.ts`            | Ricerca contenuti stile grep                                          |
| list-tool            | `list-tool.ts`            | Listing sicuro directory/metadata                                     |
| run-command-tool     | `run-command-tool.ts`     | Esecuzione comandi controllata                                        |
| secure-command-tool  | `secure-command-tool.ts`  | Policy avanzate/approvazioni                                          |
| tools-manager        | `tools-manager.ts`        | Orchestrazione/registry strumenti                                     |

> Modalità lettura “a step” per range di righe: attualmente supporto parziale tramite `maxLines` e `readStream()`; stepping interattivo a range è in pianificazione.

---

## 🔒 Sicurezza e approvazioni

- `approval-system` (UI) per azioni sensibili (rete, comandi, modifiche file)
- Sandbox configurabile in `config.json` (`sandbox.enabled`, `allowNetwork`, `allowCommands` …)
- Policy esecuzione in `src/cli/policies/`

---

## 🏗️ Architettura (directory principali)

```
src/cli/
├── ai/                      # Provider e ModelProvider
├── automation/              # Agenti e orchestrazione
├── chat/                    # Interfacce chat e slash commands
├── context/                 # RAG e contesto workspace
├── core/                    # Config, logger, agent manager, types
├── services/                # Agent/Tool/Planning/LSP services
├── tools/                   # Strumenti sicuri e registry
├── ui/                      # UI terminale, diff e approvazioni
├── index.ts                 # Entrypoint unificato (streaming orchestrator)
└── unified-cli.ts           # Avvio interfaccia Claude-like
```

Componenti chiave:

- `ModelProvider` (`src/cli/ai/model-provider.ts`) – integrazione Anthropic/OpenAI/Google/Ollama (streaming incluso)
- `SimpleConfigManager` (`src/cli/core/config-manager.ts`) – caricamento/salvataggio config, validazione Zod
- `AgentManager` (`src/cli/core/agent-manager.ts`) – ciclo di vita agenti
- `approval-system`, `diff-manager` (UI) – UX per azioni e review diff
- `nik-cli-commands.ts` – mappa comandi `/...`

---

## 🧪 Sviluppo e script

Script (`package.json`):

| Script         | Comando                                                |
| -------------- | ------------------------------------------------------ |
| start          | `ts-node --project tsconfig.cli.json src/cli/index.ts` |
| dev            | `npm start`                                            |
| build          | `tsc --project tsconfig.cli.json`                      |
| prepublishOnly | `npm run build`                                        |
| build:start    | `npm run build && node dist/cli/index.js`              |
| build:binary   | `node build-all.js`                                    |
| test           | `vitest`                                               |
| test:run       | `vitest run`                                           |
| test:watch     | `vitest --watch`                                       |
| lint           | `eslint src --ext .ts,.tsx`                            |

Esecuzione test/lint:

```bash
npm test
npm run lint
```

Build binario standalone (opzionale):

```bash
npm run build:binary
```

---

## 🧩 Integrazioni e LSP

- LSP/JSON-RPC presente in `src/cli/lsp/` e `vscode-jsonrpc`
- MCP client placeholder in `src/cli/core/mcp-client.ts` (supporto server MCP completo previsto in roadmap)

---

## 🛠️ Risoluzione problemi

- Node.js < 18: aggiornare alla versione >= 18
- Chiavi API mancanti: usare `/set-key` o variabili d'ambiente
- Ollama non raggiungibile: avviare `ollama serve` o app; variabile `OLLAMA_HOST` opzionale
- Errori build TS: `rm -rf dist && npm run build`
- Permessi script: `chmod +x bin/nikcli`

---

## 🗺️ Roadmap sintetica

- Step-wise reader per file di grandi dimensioni (range interattivi)
- Integrazione MCP server lato client (completa)
- Estensioni/plugin esterni e API gateway

---

## 📄 Licenza & contributi

- Licenza: MIT
- PR benvenute: aprire branch feature, testare con `vitest`, descrizione chiara

---

Costruito con ❤️ per sviluppatori che vogliono portare l’esperienza Claude Code nel terminale, in modo sicuro e produttivo.
