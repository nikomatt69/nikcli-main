# nikCLI Background Agents Web Interface

Una moderna interfaccia web chat per gestire i Background Agents di nikCLI, ispirata al design di Cursor.

## 🚀 Caratteristiche

- **💬 Interfaccia Chat**: Comunicazione naturale con i background agents
- **📊 Dashboard Real-time**: Monitoraggio in tempo reale dei job e del sistema
- **⚙️ Gestione Configurazioni**: Modifica delle impostazioni del config manager
- **🔔 Notifiche**: Alert per eventi importanti
- **📱 Design Responsive**: Funziona su desktop e mobile
- **🎨 UI Moderna**: Design scuro ispirato a Cursor

## 🏗 Architettura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Interface │    │   API Server    │    │ Background      │
│   (Chat UI)     │◄──►│   (Express)     │◄──►│ Agents Service  │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Avvia il Server API

```bash
# Nel progetto nikCLI principale
cd /workspace
yarn start:daemon  # Avvia il server API su porta 3000
```

### 2. Avvia l'Interfaccia Web

```bash
# In una nuova finestra terminale
cd /workspace/web-interface
python3 -m http.server 8080
```

### 3. Apri l'Interfaccia

Apri il browser e vai su: `http://localhost:8080`

## 💬 Comandi Chat

L'interfaccia supporta comandi naturali in italiano e inglese:

### Gestione Job
- `"Avvia un background agent per fixare i test falliti"`
- `"Start a background agent to upgrade dependencies"`
- `"Lista tutti i job in esecuzione"`
- `"Mostra lo status del sistema"`

### Monitoraggio
- `"Visualizza i log recenti"`
- `"Apri il dashboard"`
- `"Mostra i dettagli del job [ID]"`

### Configurazione
- `"Apri le impostazioni"`
- `"Configura le impostazioni degli agenti"`

## 🎯 Funzionalità Principali

### 1. Chat Interface
- **Input intelligente**: Riconosce automaticamente i comandi
- **Risposte formattate**: Markdown support con syntax highlighting
- **Typing indicator**: Feedback visivo durante l'elaborazione
- **Storia conversazioni**: Mantiene il contesto della chat

### 2. Dashboard
- **Statistiche real-time**: Job attivi, completati, falliti
- **Grafici di performance**: Success rate, durata media
- **Lista job recenti**: Accesso rapido ai job più recenti
- **Status del sistema**: Connessione API, queue status

### 3. Sidebar
- **Quick Actions**: Pulsanti per azioni comuni
- **Recent Activity**: Cronologia delle attività
- **Agent Status**: Contatori in tempo reale
- **Repository Selector**: Selezione repo e branch

### 4. Settings
- **General**: URL API, refresh rate, notifiche
- **Agents**: Limiti di risorse, timeout, memoria
- **Config Manager**: Path config, workspace, modelli AI

## ⚙️ Configurazione

### Impostazioni API
```javascript
{
  "apiUrl": "http://localhost:3000",
  "autoRefresh": 5,
  "showNotifications": true
}
```

### Impostazioni Agent
```javascript
{
  "maxConcurrentJobs": 3,
  "defaultTimeLimit": 30,
  "defaultMemoryLimit": 2048
}
```

### Config Manager Settings
```javascript
{
  "configPath": ".nik/config.json",
  "workspaceRoot": "/workspace",
  "modelProvider": "anthropic",
  "defaultModel": "claude-3-sonnet-20240229",
  "temperature": 0.7,
  "enableMemory": true,
  "enableSnapshots": true
}
```

## 🔧 Sviluppo

### Struttura File
```
web-interface/
├── index.html          # Interfaccia principale
├── styles.css          # Stili CSS
├── app.js             # Logica JavaScript
├── package.json       # Configurazione progetto
└── README.md          # Documentazione
```

### Personalizzazione

#### Modificare i Colori
```css
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --text-primary: #e6edf3;
  --accent-color: #238636;
}
```

#### Aggiungere Nuovi Comandi
```javascript
// In app.js, metodo parseMessage()
if (lowerMessage.includes('nuovo-comando')) {
    return {
        type: 'nuovo_comando',
        message: message
    };
}
```

#### Personalizzare le Notifiche
```javascript
// In app.js, metodo showNotification()
this.showNotification('Messaggio personalizzato', 'success');
```

## 📱 Responsive Design

L'interfaccia è completamente responsive e si adatta a:
- **Desktop**: Layout completo con sidebar
- **Tablet**: Sidebar collassabile
- **Mobile**: Layout verticale ottimizzato

## 🔒 Sicurezza

- **CORS**: Configurato per localhost
- **Rate Limiting**: Protezione contro spam
- **Input Validation**: Sanitizzazione dei dati
- **HTTPS Ready**: Supporto per connessioni sicure

## 🚀 Deployment

### Sviluppo Locale
```bash
python3 -m http.server 8080
```

### Produzione con Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /path/to/web-interface;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

### Docker
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

## 🐛 Troubleshooting

### Problemi Comuni

#### 1. Connessione API Fallita
```
Error: Failed to connect to API
```
**Soluzione**: Verifica che il server API sia in esecuzione su `http://localhost:3000`

#### 2. CORS Errors
```
Access to fetch at 'http://localhost:3000' from origin 'http://localhost:8080' has been blocked by CORS policy
```
**Soluzione**: Configura CORS nel server API o usa un proxy

#### 3. Event Stream Disconnesso
```
EventSource connection failed
```
**Soluzione**: Verifica che il server supporti Server-Sent Events

### Debug Mode
```javascript
// Abilita debug nel browser console
localStorage.setItem('debug', 'true');
```

## 📊 Performance

- **Bundle Size**: ~50KB (HTML + CSS + JS)
- **Load Time**: < 1 secondo
- **Memory Usage**: < 10MB
- **API Calls**: Ottimizzate con caching

## 🤝 Contributing

1. Fork il repository
2. Crea un branch per la feature (`git checkout -b feature/amazing-feature`)
3. Commit le modifiche (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Apri una Pull Request

## 📄 License

MIT License - vedi [LICENSE](../../LICENSE) per dettagli.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/nikomatt69/nikcli-main/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nikomatt69/nikcli-main/discussions)
- **Documentation**: [Wiki](https://github.com/nikomatt69/nikcli-main/wiki)

---

## 🎉 Ready to Chat with Your Agents?

Inizia subito con l'interfaccia web e scopri come gestire i tuoi background agents in modo naturale e intuitivo! 🚀

### Prova questi comandi:
- `"Avvia un agent per analizzare il codice"`
- `"Mostra tutti i job in esecuzione"`
- `"Apri le impostazioni del config manager"`
- `"Visualizza lo status del sistema"`