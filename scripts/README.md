# Scripts Directory

Questa directory contiene gli script essenziali per la distribuzione del progetto.

## 📁 File Disponibili

### `export-dist.js`

Script principale per l'export completo della distribuzione.

**Funzionalità:**

- Build del progetto con Node.js
- Creazione binari con pkg
- Generazione package di distribuzione
- Creazione script di installazione
- Generazione archive tar.gz

**Utilizzo:**

```bash
npm run build:binary
```

**Output:**

- Directory `export/` con tutti i file necessari
- Archive `nikcli-dist.tar.gz` pronto per distribuzione
- Script di installazione automatica

## 🚀 Workflow di Distribuzione

1. **Build**: `npm run build`
2. **Export**: `npm run build:binary`
3. **Test**: Verifica contenuto directory `export/`
4. **Distribuzione**: Upload dell'archive o pubblicazione npm

## 📦 Contenuto Export

L'export include:

- CLI compilato (`dist/cli/`)
- Binari per diverse piattaforme (`build/`)
- File di configurazione (`package.json`, `tsconfig.json`)
- Documentazione (`README.md`, `LICENSE`)
- Script di installazione (`install.sh`)

## 🔧 Personalizzazione

Per modificare il processo di export, editare `scripts/export-dist.js`:

- Aggiungere file essenziali
- Modificare script di installazione
- Cambiare formato archive
- Personalizzare package.json di distribuzione
