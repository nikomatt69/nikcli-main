# GitHub Webhook 404 Fix

## Problema Identificato

Il webhook GitHub restituisce **404 NOT_FOUND** perché l'URL configurato non corrisponde all'endpoint effettivo:

```
❌ URL Webhook Configurato: https://nikcli-main.vercel.app/api/v1/web/github/webhook
✅ Endpoint Reale:         https://nikcli-main.vercel.app/api/github/webhook
```

## Causa

Il percorso `/api/v1/web/` non esiste nella struttura del progetto:

```
api/
├── github/
│   └── webhook.ts  → Crea endpoint: /api/github/webhook
└── health.ts       → Crea endpoint: /api/health
```

## Soluzione Implementata

### Opzione A: Correggere URL su GitHub (Consigliata)

1. Vai su GitHub → Repository Settings → Webhooks
2. Modifica il webhook esistente
3. Cambia **Payload URL** in:
   ```
   https://nikcli-main.vercel.app/api/github/webhook
   ```
4. Clicca "Update webhook"

### Opzione B: Rewrite Rule in Vercel (Implementata)

Ho aggiunto un rewrite rule in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/v1/web/github/webhook",
      "destination": "/api/github/webhook"
    }
  ]
}
```

Questo permette di mantenere l'URL attuale reindirizzandolo all'endpoint corretto.

## Verifica Configurazione

### 1. Variabili d'Ambiente Vercel

Assicurati che siano configurate:

```bash
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=...
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
GITHUB_INSTALLATION_ID=...
```

### 2. Test del Webhook

```bash
# Test locale
curl -X POST http://localhost:3000/api/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main"}'

# Test produzione
curl -X POST https://nikcli-main.vercel.app/api/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main"}'
```

### 3. Logs Vercel

Controlla i logs in Vercel Dashboard:
- Vai su https://vercel.com/nikcli/nikcli-main
- Sezione "Logs"
- Filtra per "api/github/webhook"

## Endpoint Disponibili

```
✅ /api/health              - Health check
✅ /api/github/webhook      - GitHub webhook handler
✅ /api/v1/web/github/webhook - Rewrite → /api/github/webhook
```

## Struttura Webhook Handler

```typescript
// api/github/webhook.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Verifica metodo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Valida variabili d'ambiente
  const requiredVars = [
    'GITHUB_TOKEN',
    'GITHUB_WEBHOOK_SECRET',
    'GITHUB_APP_ID',
    'GITHUB_PRIVATE_KEY',
    'GITHUB_INSTALLATION_ID'
  ];

  // 3. Verifica signature GitHub
  const signature = req.headers['x-hub-signature-256'];

  // 4. Processa evento
  const handler = getWebhookHandler();
  await handler.handleWebhook(mockReq, mockRes);
}
```

## Eventi Supportati

Il webhook gestisce:
- ✅ `push` - Push a repository
- ✅ `pull_request` - PR created/updated/closed
- ✅ `issue_comment` - Comments on PR/Issues
- ✅ `pull_request_review_comment` - PR review comments
- ✅ Custom events via GitHubWebhookHandler

## Troubleshooting

### 404 NOT_FOUND

```bash
# Verifica routing
curl -I https://nikcli-main.vercel.app/api/github/webhook

# Dovrebbe restituire 405 Method Not Allowed (perché richiede POST)
# Se restituisce 404, l'endpoint non esiste
```

### 500 Internal Server Error

Controlla variabili d'ambiente mancanti:

```typescript
// Il webhook logga variabili mancanti
Missing required environment variables: GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET
```

### Signature Verification Failed

Il webhook secret su GitHub deve corrispondere a `GITHUB_WEBHOOK_SECRET`:

```bash
# In GitHub Webhook Settings
Secret: <stesso valore di GITHUB_WEBHOOK_SECRET>
```

## Deploy

Dopo le modifiche, rideploya su Vercel:

```bash
# Opzione 1: Push su GitHub (auto-deploy)
git add vercel.json
git commit -m "fix: add webhook rewrite rule"
git push

# Opzione 2: Deploy manuale
vercel --prod
```

## Verifica Post-Deploy

1. **Webhook Delivery**: Vai su GitHub → Settings → Webhooks → Recent Deliveries
2. **Dovrebbe mostrare**: ✅ 200 OK invece di ❌ 404
3. **Logs**: Controlla Vercel logs per conferma

## Next Steps

1. ✅ Rewrite rule aggiunto
2. ⏳ Deploy su Vercel
3. ⏳ Test webhook delivery
4. ⏳ Verifica eventi GitHub processati correttamente
