# Polymarket Integration Setup Guide

## Panoramica

Questa guida ti aiuterà a configurare correttamente l'integrazione Polymarket per NikCLI seguendo la documentazione ufficiale.

## Credenziali Richieste

### 1. Credenziali API Polymarket CLOB

Devi ottenere queste credenziali dall'interfaccia web di Polymarket:

- **POLYMARKET_API_KEY** - La tua chiave API
- **POLYMARKET_SECRET** - Il secret associato alla chiave API
- **POLYMARKET_PASSPHRASE** - La passphrase per l'autenticazione

### 2. Wallet Ethereum/Polygon

- **POLYMARKET_PRIVATE_KEY** - Chiave privata del wallet (formato hex 64 caratteri o con prefisso 0x)
- **POLYMARKET_FUNDER_ADDRESS** (opzionale) - Indirizzo del funder per wallet proxy

## Come Ottenere le Credenziali

### Passo 1: Registrazione su Polymarket

1. Vai su [polymarket.com](https://polymarket.com)
2. Crea un account e completa la verifica
3. Connetti il tuo wallet Ethereum/Polygon

### Passo 2: Generazione API Keys

1. Accedi al tuo account Polymarket
2. Vai nelle impostazioni del profilo
3. Cerca la sezione "API Keys" o "Developer Settings"
4. Genera una nuova API key con i permessi di trading
5. Salva in modo sicuro: API Key, Secret, e Passphrase

### Passo 3: Configurazione Wallet

1. Usa un wallet esistente o creane uno nuovo per Polygon
2. Assicurati che abbia fondi USDC su Polygon per il trading
3. Esporta la chiave privata (64 caratteri hex)

## Configurazione Environment Variables

Crea un file `.env` nella root del progetto:

```bash
# Polymarket CLOB API Credentials
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_SECRET=your_secret_here
POLYMARKET_PASSPHRASE=your_passphrase_here

# Wallet Configuration
POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...  # 64 char hex
POLYMARKET_FUNDER_ADDRESS=0x...  # Optional, for proxy wallets

# Network Configuration (optional)
# POLYMARKET_TESTNET=true  # Uncomment for testnet
```

## Verifica della Configurazione

### Test delle Credenziali

```bash
# Inizializza Polymarket
/web3 polymarket init

# Diagnostica completa del setup
/web3 polymarket diagnose

# Verifica lo status
/web3 polymarket status

# Test connessione con Gamma API
/web3 polymarket trending
/web3 polymarket sports football
/web3 polymarket markets bitcoin
```

### Nuove Funzionalità Gamma API

#### Mercati Trending (Real-time)

```bash
# Tutti i mercati trending
/web3 polymarket trending

# Mercati trending per categoria
/web3 polymarket trending politics
/web3 polymarket trending crypto
```

#### Mercati Sportivi Specializzati

```bash
# Tutti i mercati sportivi
/web3 polymarket sports

# Sport specifici
/web3 polymarket sports football
/web3 polymarket sports basketball
/web3 polymarket sports tennis
```

#### Analisi AI con Dati Reali

```bash
# L'AI ora usa automaticamente i tools per dati reali
/web3 polymarket "show me current football betting trends"
/web3 polymarket "what are the hottest political markets right now"
```

### Diagnostica Errori Comuni

#### "Missing required environment variables"

- Verifica che tutte le variabili siano impostate nel file `.env`
- Riavvia l'applicazione dopo aver modificato `.env`

#### "Private key format invalid"

- La chiave privata deve essere esattamente 64 caratteri hex
- Può avere il prefisso `0x` o essere senza prefisso
- Esempio valido: `0x1234567890abcdef...` (66 caratteri totali con 0x)
- Esempio valido: `1234567890abcdef...` (64 caratteri senza 0x)

#### "API authentication failed"

- Verifica che API Key, Secret e Passphrase siano corretti
- Assicurati che l'API key abbia i permessi di trading abilitati
- Controlla che l'account Polymarket sia verificato

#### "Wallet connection failed"

- Verifica che il wallet abbia fondi USDC su Polygon
- Controlla che la chiave privata corrisponda all'indirizzo corretto
- Assicurati che il wallet sia connesso alla rete Polygon (Chain ID: 137)

## Dipendenze Richieste

Assicurati che queste dipendenze siano installate:

```bash
npm install @polymarket/clob-client @goat-sdk/plugin-polymarket @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem viem
```

## Risorse Utili

- [Documentazione Ufficiale Polymarket](https://docs.polymarket.com/)
- [Developer Quickstart](https://docs.polymarket.com/quickstart)
- [API Showcase](https://docs.polymarket.com/quickstart/introduction/showcase)
- [Discord Community #devs](https://discord.com/invite/polymarket)

## Sicurezza

⚠️ **IMPORTANTE**:

- Non condividere mai le tue chiavi private o credenziali API
- Usa wallet dedicati per il trading automatizzato
- Inizia sempre con importi piccoli per testare
- Considera l'uso della testnet per lo sviluppo

## Supporto

Se incontri problemi:

1. Controlla i log per errori specifici
2. Verifica che tutte le credenziali siano corrette
3. Testa con la testnet prima della mainnet
4. Unisciti al Discord di Polymarket per supporto della community
