# NikCLI Release Process

## Overview

NikCLI usa `--packages=external` quindi il binario richiede `node_modules` per funzionare. Supportiamo tre metodi di installazione:

1. **NPM/Bun/Yarn/PNPM** - Automatico
2. **Bash Installer** - Scarica binario + deps
3. **Homebrew** - Package manager macOS/Linux

---

## 1. Build dei Binari

### Build Singolo Binario
```bash
bun run build:with-secrets
```

Questo crea: `dist/cli/nikcli`

### Build Multi-Platform
```bash
bun run build:bun:all
```

Questo crea in `public/bin/`:
- `nikcli-aarch64-apple-darwin` (macOS ARM64)
- `nikcli-x86_64-apple-darwin` (macOS Intel)
- `nikcli-x86_64-linux` (Linux x64)
- `nikcli-x86_64-windows.exe` (Windows x64)

---

## 2. Package Standalone (Binario + Node Modules)

```bash
bun run package:standalone
```

Questo crea in `public/bin/`:
- `nikcli-macos-arm64.tar.gz`
- `nikcli-macos-x64.tar.gz`
- `nikcli-linux-x64.tar.gz`
- `nikcli-windows-x64.zip`

Ogni package contiene:
```
nikcli-{platform}/
├── bin/
│   ├── nikcli               # Wrapper script
│   └── nikcli-*-*           # Binario compilato
└── lib/
    └── node_modules/        # Dipendenze production
```

---

## 3. Pubblicazione NPM

```bash
# Test locale
npm pack --dry-run

# Pubblicazione
npm publish
```

Gli utenti installano con:
```bash
npm install -g @nicomatt69/nikcli
# oppure
bun install -g @nicomatt69/nikcli
```

---

## 4. GitHub Release

### 4.1 Crea Tag
```bash
git tag v1.5.0
git push origin v1.5.0
```

### 4.2 Carica Assets

Vai su: https://github.com/nicomatt69/nikcli/releases/new

Carica:
- `nikcli-macos-arm64.tar.gz`
- `nikcli-macos-x64.tar.gz`
- `nikcli-linux-x64.tar.gz`
- `nikcli-windows-x64.zip`

### 4.3 Calcola SHA256

```bash
cd public/bin
sha256sum nikcli-macos-arm64.tar.gz
sha256sum nikcli-macos-x64.tar.gz
sha256sum nikcli-linux-x64.tar.gz
```

Aggiorna `installer/nikcli.rb` con gli hash.

---

## 5. Bash Installer

Gli utenti installano con:

```bash
curl -fsSL https://raw.githubusercontent.com/nicomatt69/nikcli/main/installer/install-standalone.sh | bash
```

Questo:
1. Rileva piattaforma (macOS ARM64/x64, Linux x64)
2. Scarica `nikcli-{platform}.tar.gz` da GitHub Release
3. Estrae in `/usr/local/`
4. Crea symlink in `/usr/local/bin/nikcli`

---

## 6. Homebrew

### 6.1 Aggiorna Formula

Modifica `installer/nikcli.rb`:
- Aggiorna `version`
- Aggiorna SHA256 di ogni platform

### 6.2 Pubblica su Homebrew Tap

```bash
# Crea tap repository: homebrew-nikcli
# Copia nikcli.rb nel tap
```

Gli utenti installano con:
```bash
brew tap nicomatt69/nikcli
brew install nikcli
```

---

## 7. Installazione Manuale

Gli utenti possono scaricare e installare manualmente:

```bash
# Scarica
wget https://github.com/nicomatt69/nikcli/releases/download/v1.5.0/nikcli-macos-arm64.tar.gz

# Estrai
tar -xzf nikcli-macos-arm64.tar.gz

# Installa
sudo cp -R nikcli-macos-arm64/lib/node_modules /usr/local/lib/nikcli/
sudo cp nikcli-macos-arm64/bin/nikcli /usr/local/bin/
sudo cp nikcli-macos-arm64/bin/nikcli-* /usr/local/bin/
```

---

## Checklist Pre-Release

- [ ] Build tutti i binari: `bun run build:bun:all`
- [ ] Package standalone: `bun run package:standalone`
- [ ] Test binario locale: `./dist/cli/nikcli --version`
- [ ] Test package standalone: estrai e testa in `/tmp`
- [ ] Aggiorna `version` in `package.json`
- [ ] Aggiorna `CHANGELOG.md`
- [ ] Commit e push
- [ ] Crea tag Git
- [ ] Pubblica NPM: `npm publish`
- [ ] Crea GitHub Release con assets
- [ ] Calcola SHA256
- [ ] Aggiorna `installer/nikcli.rb`
- [ ] Test installer bash
- [ ] Test Homebrew (se hai tap)
- [ ] Annuncia release

---

## Troubleshooting

### Binario non trova node_modules

Il binario usa `--packages=external` quindi **deve** avere `node_modules` disponibili.

Verifica che:
- Il wrapper script imposta `NODE_PATH` correttamente
- `node_modules` è nella directory `lib/` relativa al binario

### Errore "Cannot find module"

Manca una dipendenza in `node_modules`. Verifica che:
- `bun install --production` includa quella dipendenza
- La dipendenza non sia in `devDependencies`

### Binario troppo grande

Con `--packages=external`, il binario è ~60-70MB.
I node_modules aggiungono ~100-200MB.
Package finale tar.gz: ~50-80MB compresso.

Questo è normale per un binario con dipendenze esterne.
