# GitHub Secrets Configuration

Questo documento descrive i secrets necessari per il funzionamento completo dei workflow GitHub Actions.

## 🔐 Secrets Richiesti

### NPM_TOKEN

**Descrizione**: Token per la pubblicazione su npm registry  
**Tipo**: Secret  
**Come ottenerlo**:

1. Vai su [npmjs.com](https://www.npmjs.com)
2. Accedi al tuo account
3. Vai su "Access Tokens"
4. Crea un nuovo token con permessi di pubblicazione
5. Copia il token e aggiungilo ai secrets del repository

**Uso**: Pubblicazione automatica su npm quando viene creata una release

### CHROMA_API_KEY (Opzionale)

**Descrizione**: API key per ChromaDB cloud  
**Tipo**: Secret  
**Come ottenerlo**:

1. Vai su [chroma.ai](https://chroma.ai)
2. Crea un account
3. Genera un API key
4. Aggiungi il token ai secrets

**Uso**: Connessione a ChromaDB cloud per test CI/CD

### ANTHROPIC_API_KEY (Opzionale)

**Descrizione**: API key per test con Claude  
**Tipo**: Secret  
**Come ottenerlo**:

1. Vai su [console.anthropic.com](https://console.anthropic.com)
2. Crea un account
3. Genera un API key
4. Aggiungi il token ai secrets

**Uso**: Test di integrazione con AI providers

### OPENAI_API_KEY (Opzionale)

**Descrizione**: API key per test con OpenAI  
**Tipo**: Secret  
**Come ottenerlo**:

1. Vai su [platform.openai.com](https://platform.openai.com)
2. Crea un account
3. Genera un API key
4. Aggiungi il token ai secrets

**Uso**: Test di integrazione con AI providers

## 🔧 Configurazione Secrets

### Aggiungere Secrets al Repository

1. Vai nella pagina del repository su GitHub
2. Clicca su "Settings"
3. Nel menu laterale, clicca su "Secrets and variables" → "Actions"
4. Clicca su "New repository secret"
5. Inserisci il nome e il valore del secret
6. Clicca "Add secret"

### Verifica Configurazione

Dopo aver aggiunto i secrets, puoi verificare che funzionino:

1. Crea una Pull Request
2. I workflow dovrebbero essere triggerati automaticamente
3. Controlla che i job che usano i secrets si completino con successo

## 🚨 Sicurezza

- **Non committare mai** i secrets nel codice
- Usa sempre i secrets di GitHub per le credenziali
- Rivedi regolarmente i permessi dei token
- Usa token con permessi minimi necessari

## 📋 Checklist Setup

- [ ] NPM_TOKEN configurato
- [ ] CHROMA_API_KEY configurato (opzionale)
- [ ] ANTHROPIC_API_KEY configurato (opzionale)
- [ ] OPENAI_API_KEY configurato (opzionale)
- [ ] Workflow testati con PR
- [ ] Release workflow verificato

## 🆘 Troubleshooting

### Errori Comuni

**"NPM_TOKEN not found"**

- Verifica che il secret sia stato aggiunto correttamente
- Controlla che il nome sia esattamente `NPM_TOKEN`

**"Permission denied"**

- Verifica che il token abbia i permessi corretti
- Per npm, il token deve avere permessi di pubblicazione

**"Invalid API key"**

- Verifica che l'API key sia valida
- Controlla che non sia scaduta
- Verifica che abbia i permessi corretti

### Supporto

Se hai problemi con la configurazione:

1. Controlla i log dei workflow per errori specifici
2. Verifica la documentazione ufficiale di GitHub Actions
3. Apri un issue nel repository per supporto
