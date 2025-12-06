# Piano di Migrazione Completa a Bun Native APIs + Fix Path Handling

## Obiettivo Principale
Risolvere i problemi critici di path handling E completare la migrazione a Bun native APIs per ~167 file in `src/cli/`.

## ⚠️ PROBLEMI CRITICI SCOPERTI
Durante l'analisi è emerso che **i problemi di path handling sono più gravi della migrazione Bun**:
1. Working directory statica (non aggiornabile dinamicamente)
2. Path resolution inconsistente tra tool diversi
3. Directory vs File detection fallace
4. Trailing slash ignorato (crea file invece di directory)
5. `isPathSafe()` broken (usa `process.cwd()` invece di `workingDirectory`)
6. Security vulnerability in `tools-manager.ts`

**Questi bug DEVONO essere risolti PRIMA della migrazione Bun, altrimenti peggiorano.**

---

## Stato Attuale (Analisi Completata)

### ✅ Layer di Compatibilità Esistente
`src/cli/utils/bun-compat.ts` è **MOLTO COMPLETO**:
- 45+ funzioni Bun wrapper
- Bun Shell API (`$`) completamente integrato
- File I/O: `bunFile`, `bunWrite`
- Crypto: `bunHash`, `bunRandomBytes`, `Bun.CryptoHasher`
- Process: `bunSpawn`, `bunExec`, `bunShell`
- Utilities: `bunGlob`, `bunSleep`, `bunWhich`, `bunResolve`

### ❌ Problemi Critici Identificati

#### 1. **Funzioni Helper Mancanti** (URGENTE)
File: `src/cli/github-bot/task-executor.ts:6`
```typescript
import { $, bunShellSync, fileExists, mkdirp } from '../utils/bun-compat'
```
**Problema**: `fileExists` e `mkdirp` sono importati ma **NON ESISTONO** in bun-compat.ts!
**Impatto**: Runtime error garantito

#### 2. **task-executor.ts ha execSync non importato** (BUG)
File: `src/cli/github-bot/task-executor.ts:635`
```typescript
const output = execSync(nikCliCommand, { ... })
```
**Problema**: `execSync` usato senza import, dovrebbe usare Bun Shell
**Fix**: Sostituire con `bunShellSync` o `$`

#### 3. **write-file-tool.ts Migrazione Incompleta**
File: `src/cli/tools/write-file-tool.ts`
- ✅ Usa `Bun.file()` per lettura (riga 79)
- ✅ Usa `Bun.write()` per scrittura (riga 135)
- ❌ Ancora usa `node:fs/promises` per `mkdir`, `unlink` (riga 1, 96)
- ❌ Usa `node:fs` per `copyFile` (riga 22)

---

## Piano di Esecuzione RIVISTO

### FASE 0: Fix Path Handling (PRIORITÀ CRITICA - DA FARE PRIMA)
**Tempo stimato: 45-60 minuti**

#### Task 0.1: Creare PathResolver Centralizzato
**Nuovo file**: `src/cli/utils/path-resolver.ts`

Questo file conterrà tutta la logica di path resolution in un unico posto, risolvendo inconsistenze.

```typescript
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { statSync } from 'node:fs'

export interface ResolvedPath {
  absolutePath: string
  isDirectoryIntent: boolean  // User wants a directory (trailing slash)
  exists: boolean
  existsAsFile: boolean
  existsAsDirectory: boolean
  relativePath: string        // Relative to workingDirectory
}

export class PathResolver {
  constructor(private workingDirectory: string) {
    this.workingDirectory = resolve(workingDirectory)
  }

  /**
   * Resolve path with proper directory/file detection
   */
  resolve(userPath: string): ResolvedPath {
    // Detect directory intent from trailing slash
    const hasTrailingSlash = userPath.endsWith('/') || userPath.endsWith('\\')

    // Normalize and resolve to absolute
    const normalized = normalize(userPath)
    const absolute = resolve(this.workingDirectory, normalized)

    // Security: prevent path traversal
    if (!this.isWithinWorkingDirectory(absolute)) {
      throw new Error(`Path traversal detected: ${userPath} resolves outside working directory`)
    }

    // Check actual filesystem state
    let exists = false
    let existsAsFile = false
    let existsAsDirectory = false

    try {
      const stats = statSync(absolute)
      exists = true
      existsAsFile = stats.isFile()
      existsAsDirectory = stats.isDirectory()
    } catch {
      // Path doesn't exist yet - that's OK
    }

    return {
      absolutePath: absolute,
      isDirectoryIntent: hasTrailingSlash || existsAsDirectory,
      exists,
      existsAsFile,
      existsAsDirectory,
      relativePath: absolute.substring(this.workingDirectory.length + 1)
    }
  }

  /**
   * Check if path is within working directory
   */
  isWithinWorkingDirectory(absolutePath: string): boolean {
    const workingDirNormalized = this.workingDirectory + sep
    return absolutePath === this.workingDirectory ||
           absolutePath.startsWith(workingDirNormalized)
  }

  /**
   * Update working directory and return new instance
   */
  withWorkingDirectory(newDir: string): PathResolver {
    return new PathResolver(newDir)
  }
}

/**
 * Legacy compatibility: sanitizePath replacement
 */
export function sanitizePath(filePath: string, workingDirectory: string): string {
  const resolver = new PathResolver(workingDirectory)
  return resolver.resolve(filePath).absolutePath
}

/**
 * Better isDirectory: distinguishes "doesn't exist" from "exists but is file"
 */
export function checkPath(path: string): {
  exists: boolean
  isFile: boolean
  isDirectory: boolean
} {
  try {
    const stats = statSync(path)
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    }
  } catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false
    }
  }
}
```

#### Task 0.2: Aggiornare Base Tool
**File**: `src/cli/tools/base-tool.ts`

Modificare per usare PathResolver:

```typescript
import { PathResolver } from '../utils/path-resolver'

export abstract class BaseTool {
  protected pathResolver: PathResolver

  constructor(
    name: string,
    protected workingDirectory: string
  ) {
    this.name = name
    this.pathResolver = new PathResolver(workingDirectory)
  }

  // Fix isPathSafe - ora usa pathResolver
  protected isPathSafe(path: string): boolean {
    try {
      const resolved = this.pathResolver.resolve(path)
      return this.pathResolver.isWithinWorkingDirectory(resolved.absolutePath)
    } catch {
      return false
    }
  }

  // Nuovo metodo per aggiornare working directory
  updateWorkingDirectory(newDir: string): void {
    this.workingDirectory = newDir
    this.pathResolver = new PathResolver(newDir)
  }
}
```

#### Task 0.3: Fix Write File Tool
**File**: `src/cli/tools/write-file-tool.ts`

Modificare per gestire correttamente directory vs file:

```typescript
async execute(filePath: string, content: string, options: WriteFileOptions = {}): Promise<ToolExecutionResult> {
    // Use PathResolver invece di sanitizePath diretto
    const resolved = this.pathResolver.resolve(filePath)

    // Check 1: User specified directory intent
    if (resolved.isDirectoryIntent) {
        throw new Error(`Cannot write to directory: ${filePath} (trailing slash detected - use a filename)`)
    }

    // Check 2: Path exists and is a directory
    if (resolved.existsAsDirectory) {
        throw new Error(`Path is an existing directory: ${filePath} (cannot overwrite with file)`)
    }

    // Check 3: If path doesn't exist, ensure parent directory exists
    const parentDir = dirname(resolved.absolutePath)
    await mkdirp(parentDir)  // Bun helper from next phase

    // Now safe to write
    await Bun.write(resolved.absolutePath, content)
    // ... resto della logica
}
```

#### Task 0.4: Aggiornare Tool Registry
**File**: `src/cli/tools/tool-registry.ts`

Aggiungere metodo per aggiornare working directory dinamicamente:

```typescript
updateWorkingDirectory(newDir: string): void {
    this.workingDirectory = newDir

    // Update all tool instances
    for (const [_name, toolDef] of this.tools.entries()) {
        if (toolDef.instance && typeof toolDef.instance.updateWorkingDirectory === 'function') {
            toolDef.instance.updateWorkingDirectory(newDir)
        }
    }
}
```

#### Task 0.5: Fix Tools Manager Security Vulnerability
**File**: `src/cli/tools/tools-manager.ts`

Sostituire uso diretto di `path.resolve()` con PathResolver:

```typescript
// BEFORE (linea 69-78):
async readFile(filePath: string): Promise<FileInfo> {
    const fullPath = path.resolve(this.workingDirectory, filePath)
    // ... VULNERABILE a path traversal

// AFTER:
async readFile(filePath: string): Promise<FileInfo> {
    const resolved = this.pathResolver.resolve(filePath)
    const fullPath = resolved.absolutePath
    // ... PathResolver ha già fatto security check
```

#### Task 0.6: Fix Secure File Tools
**File**: `src/cli/tools/secure-file-tools.ts`

Sostituire funzioni `isDirectory` e `isFile` con versione migliorata:

```typescript
// Importa da path-resolver
import { checkPath } from '../utils/path-resolver'

// Sostituisci isDirectory (linee 67-76)
export function isDirectory(dirPath: string): boolean {
  const check = checkPath(dirPath)
  return check.exists && check.isDirectory
}

// Sostituisci isFile (linee 78-86)
export function isFile(filePath: string): boolean {
  const check = checkPath(filePath)
  return check.exists && check.isFile
}

// Nuova funzione: pathInfo
export function pathInfo(path: string) {
  return checkPath(path)
}
```

---

### FASE 1: Aggiungere Helper Functions a Bun Compat (Priorità ALTA)
**Tempo stimato: 15-20 minuti**

#### Task 1.1: Estendere bun-compat.ts
**File**: `src/cli/utils/bun-compat.ts`

Aggiungere dopo riga 538 (`export const bunWrite = Bun.write`):

```typescript
// ============================================================================
// FILE SYSTEM HELPERS
// ============================================================================

/**
 * Check if file or directory exists
 * Replacement for fs.existsSync / fs.promises.access
 */
export async function fileExists(path: string): Promise<boolean> {
  const file = Bun.file(path)
  return await file.exists()
}

/**
 * Synchronous file existence check
 */
export function fileExistsSync(path: string): boolean {
  try {
    // Use Bun.spawnSync for fast sync check
    const result = Bun.spawnSync(['test', '-e', path])
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Create directory recursively (mkdir -p)
 * Replacement for fs.mkdir({ recursive: true })
 */
export async function mkdirp(path: string): Promise<void> {
  await $`mkdir -p ${path}`.quiet()
}

/**
 * Synchronous recursive directory creation
 */
export function mkdirpSync(path: string): void {
  Bun.spawnSync(['mkdir', '-p', path])
}

/**
 * Read and parse JSON file
 */
export async function readJson<T = any>(path: string): Promise<T> {
  return await bunFile(path).json()
}

/**
 * Write JSON file with formatting
 */
export async function writeJson(
  path: string,
  data: any,
  options?: { spaces?: number }
): Promise<void> {
  const json = JSON.stringify(data, null, options?.spaces ?? 2)
  await bunWrite(path, json)
}

/**
 * Copy file (replacement for fs.copyFile)
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await $`cp ${src} ${dest}`.quiet()
}

/**
 * Remove file (replacement for fs.unlink)
 */
export async function removeFile(path: string): Promise<void> {
  await $`rm -f ${path}`.quiet()
}

/**
 * Remove directory recursively (replacement for fs.rm({ recursive: true }))
 */
export async function removeDir(path: string): Promise<void> {
  await $`rm -rf ${path}`.quiet()
}
```

#### Task 1.2: Fix task-executor.ts execSync Bug
**File**: `src/cli/github-bot/task-executor.ts`

**Riga 635-639** - Sostituire:
```typescript
const output = execSync(nikCliCommand, {
  cwd: context.workingDirectory,
  encoding: 'utf8',
  stdio: 'pipe',
})
```

Con:
```typescript
const output = bunShellSync(nikCliCommand, {
  cwd: context.workingDirectory,
}).stdout
```

**Righe 713-728** - Sostituire git commit con Bun Shell:
```typescript
// OLD:
execSync('git add .', { cwd: context.workingDirectory, stdio: 'pipe' })
execSync(`git commit -m "${commitMessage}"`, { ... })
execSync(`git push -u origin ${tempBranch}`, { ... })

// NEW:
await $`git add .`.cwd(context.workingDirectory).quiet()
await $`git commit -m ${commitMessage}`.cwd(context.workingDirectory).quiet()
await $`git push -u origin ${tempBranch}`.cwd(context.workingDirectory).quiet()
```

**Righe 780-783** - Fix runTests:
```typescript
// OLD:
const testCommand = `${repository.packageManager} test`
execSync(testCommand, { cwd: context.workingDirectory, stdio: 'pipe' })

// NEW:
const testCommand = `${repository.packageManager} test`
await bunShell(testCommand, { cwd: context.workingDirectory, quiet: true })
```

#### Task 1.3: Completare write-file-tool.ts Migration
**File**: `src/cli/tools/write-file-tool.ts`

**Riga 1-2** - Sostituire import:
```typescript
// OLD:
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { copyFile } from 'node:fs'

// NEW:
import { dirname, join } from 'node:path'
import { mkdirp, removeFile, copyFile } from '../utils/bun-compat'
```

**Riga 96** - Sostituire mkdir:
```typescript
// OLD:
await mkdir(dir, { recursive: true })

// NEW:
await mkdirp(dir)
```

**Riga 326** - Sostituire mkdir backup:
```typescript
// OLD:
await mkdir(this.backupDirectory, { recursive: true })

// NEW:
await mkdirp(this.backupDirectory)
```

**Riga 334** - Sostituire mkdir backup subdirs:
```typescript
// OLD:
await mkdir(dirname(backupPath), { recursive: true })

// NEW:
await mkdirp(dirname(backupPath))
```

**Riga 337-342** - Sostituire copyFile callback con async:
```typescript
// OLD:
copyFile(filePath, backupPath, (err: any) => {
  if (err) {
    throw new Error(`Failed to copy file: ${err.message}`)
  }
})

// NEW:
await copyFile(filePath, backupPath)
```

**Riga 357-361** - Fix rollback copyFile:
```typescript
// OLD:
copyFile(backupPath, sanitizedPath, (err: any) => {
  if (err) {
    throw new Error(`Failed to copy file: ${err.message}`)
  }
})

// NEW:
await copyFile(backupPath, sanitizedPath)
```

**Riga 362** - Sostituire unlink:
```typescript
// OLD:
await unlink(backupPath)

// NEW:
await removeFile(backupPath)
```

**Riga 426** - Sostituire unlink in cleanBackups:
```typescript
// OLD:
await unlink(filePath)

// NEW:
await removeFile(filePath)
```

---

### FASE 2: Migrazione File High-Impact (Priorità ALTA)
**Tempo stimato: 1-2 ore**

#### File da Migrare:
1. `src/cli/persistence/session-manager.ts`
2. `src/cli/persistence/work-session-manager.ts`
3. `src/cli/context/workspace-context.ts`
4. `src/cli/core/config-manager.ts`
5. `src/cli/chat/nik-cli-commands.ts`

**Pattern di Migrazione Standard:**

##### File I/O:
```typescript
// BEFORE:
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const content = await readFile(path, 'utf8')
await writeFile(path, data, 'utf8')
await mkdir(dir, { recursive: true })

// AFTER:
import { bunFile, bunWrite, mkdirp } from '../utils/bun-compat'
const content = await bunFile(path).text()
await bunWrite(path, data)
await mkdirp(dir)
```

##### Crypto (createHash):
```typescript
// BEFORE:
import { createHash } from 'node:crypto'
const hash = createHash('sha256').update(data).digest('hex')

// AFTER:
import { bunHash } from '../utils/bun-compat'
const hash = await bunHash('sha256', data)
```

##### Crypto (randomBytes):
```typescript
// BEFORE:
import { randomBytes } from 'node:crypto'
const token = randomBytes(32).toString('hex')

// AFTER:
import { bunRandomBytes } from '../utils/bun-compat'
const token = bunRandomBytes(32)
```

##### Child Process:
```typescript
// BEFORE:
import { exec, execSync } from 'node:child_process'
execSync('git status', { cwd: '/path' })
exec('npm install', (err, stdout) => { ... })

// AFTER:
import { $, bunShellSync } from '../utils/bun-compat'
bunShellSync('git status', { cwd: '/path' })
await $`npm install`.cwd('/path')
```

---

### FASE 3: Migrazione Batch Files (Priorità MEDIA)
**Tempo stimato: 2-3 ore**

#### Gruppi di File:

**Gruppo 1: Context/RAG Systems** (10 file)
- `src/cli/context/context-aware-rag.ts`
- `src/cli/context/workspace-rag.ts`
- `src/cli/context/rag-system.ts`
- `src/cli/context/semantic-search-engine.ts`
- Tutti usano `createHash` → migrare a `bunHash`

**Gruppo 2: Providers** (15 file)
- `src/cli/providers/image/image-generator.ts`
- `src/cli/providers/vision/vision-provider.ts`
- `src/cli/providers/memory/mem0-provider.ts`
- Usano `existsSync`, `readFileSync`, `writeFileSync` → migrare a Bun APIs

**Gruppo 3: Services** (15 file)
- `src/cli/services/tool-service.ts`
- `src/cli/services/agent-service.ts`
- Vari pattern di file I/O e crypto

**Gruppo 4: Background Agents** (10 file)
- `src/cli/background-agents/background-agent-service.ts`
- `src/cli/github-bot/pr-review-executor.ts`
- Usano `execSync` → migrare a Bun Shell

---

### FASE 4: Cleanup e Verifica (Priorità BASSA)
**Tempo stimato: 30 minuti**

1. **Rimuovere import inutilizzati**:
   ```bash
   # Verificare che non ci siano più import di node:
   grep -r "from 'node:fs'" src/cli/
   grep -r "from 'node:child_process'" src/cli/
   grep -r "from 'node:crypto'" src/cli/
   ```

2. **Aggiornare cross-runtime.ts**:
   - Deprecare o rimuovere (il progetto è Bun-only)
   - Aggiungere warning se ancora usato

3. **Verificare build**:
   ```bash
   bun run build
   ```

4. **Test funzionali**:
   ```bash
   bun test
   ```

---

## Metriche di Successo

### Performance Attese:
- File I/O: **30-50% più veloce** (Bun.file vs fs.readFile)
- Process spawn: **5-10x più veloce** (Bun.spawn vs child_process)
- Crypto hash: **2-3x più veloce** (Bun.CryptoHasher vs crypto.createHash)
- Overall CLI: **40-60% più responsive**

### Obiettivi:
- ✅ 0 import da `node:child_process`
- ✅ 0 import da `node:fs/promises` per operazioni base
- ✅ 0 import da `node:crypto` per hash/random
- ✅ Tutti i comandi shell usano Bun Shell `$` o `bunShell`
- ✅ Build passa senza errori
- ✅ Test passano

---

## File Critici da Modificare

### Fase 1 (Fix Immediati):
1. `src/cli/utils/bun-compat.ts` - Aggiungere 10 helper functions
2. `src/cli/github-bot/task-executor.ts` - Fix execSync bug (4 locations)
3. `src/cli/tools/write-file-tool.ts` - Completare migrazione (7 locations)

### Fase 2 (High-Impact):
4. `src/cli/persistence/session-manager.ts`
5. `src/cli/persistence/work-session-manager.ts`
6. `src/cli/context/workspace-context.ts`
7. `src/cli/core/config-manager.ts`
8. `src/cli/chat/nik-cli-commands.ts`

### Fase 3 (Batch):
9-38. 30+ file in context/, providers/, services/, background-agents/

---

## Note Importanti

1. **NON modificare**:
   - `src/cli/utils/runtime-detect.ts` (già completo)
   - File che richiedono NAPI modules
   - Integrazioni con librerie che richiedono Node.js specifico

2. **Sempre testare** dopo ogni migrazione:
   ```bash
   bun run build && bun test
   ```

3. **Preservare funzionalità**:
   - Ogni migrazione deve mantenere il comportamento esistente
   - No breaking changes nelle API pubbliche
   - Mantenere backward compatibility dove necessario

4. **Bun Shell Best Practices**:
   - Usare `$\`command\`` per comandi con output
   - Usare `.quiet()` per silenziare output
   - Usare `.cwd()` per cambiare directory
   - Sempre escape variabili: `$\`git add ${file}\``

---

## Ordine di Esecuzione RACCOMANDATO

### ⚠️ IMPORTANTE: FASE 0 deve essere completata PRIMA di FASE 1-4

1. **FASE 0**: Fix Path Handling (6 task) - **DA FARE PRIMA DI TUTTO**
   - Crea PathResolver centralizzato
   - Fix BaseTool, WriteFileTool, ToolRegistry
   - Fix security vulnerability in tools-manager
   - Fix secure-file-tools

2. **FASE 1**: Aggiungere helper Bun a bun-compat.ts
   - `fileExists`, `mkdirp`, `copyFile`, `removeFile`, ecc.

3. **FASE 2**: Fix task-executor.ts bug execSync
   - Sostituire execSync con Bun Shell

4. **FASE 3**: Completare write-file-tool.ts migration
   - Rimuovere import node:fs/promises

5. **FASE 4**: Migrazione high-impact files
   - session-manager, config-manager, workspace-context, ecc.

6. **FASE 5**: Batch migration (context, providers, services)

7. **FASE 6**: Cleanup e verifica

---

## File Critici da Modificare (in ordine di priorità)

### FASE 0 (Path Fixes):
1. **NUOVO**: `src/cli/utils/path-resolver.ts` - PathResolver centralizzato
2. `src/cli/tools/base-tool.ts` - Aggiungere PathResolver + updateWorkingDirectory
3. `src/cli/tools/write-file-tool.ts` - Usare PathResolver per validazione
4. `src/cli/tools/tool-registry.ts` - Aggiungere updateWorkingDirectory
5. `src/cli/tools/tools-manager.ts` - Fix security vulnerability
6. `src/cli/tools/secure-file-tools.ts` - Fix isDirectory/isFile

### FASE 1 (Bun Helpers):
7. `src/cli/utils/bun-compat.ts` - Aggiungere 10 helper functions

### FASE 2 (Fix Bugs):
8. `src/cli/github-bot/task-executor.ts` - Fix execSync (4 locations)

### FASE 3-6 (Migration):
9-38. Altri 30+ file da migrare

---

## Perché FASE 0 è Prioritaria?

I problemi di path handling causano:
- ✖️ Creazione di file invece di directory
- ✖️ Blocco di operazioni legittime (path traversal falso positivo)
- ✖️ Security vulnerability (tools-manager.ts)
- ✖️ Comportamento inconsistente tra tool

Se migriamo a Bun SENZA risolvere questi bug, i problemi peggioreranno perché:
- Bun Shell `$` richiede path corretti
- `mkdirp()` Bun deve sapere se creare file o directory
- `fileExists()` Bun deve distinguere file da directory

**Quindi: Fix path PRIMA, migrazione Bun DOPO.**

---

## Metriche di Successo

### Dopo FASE 0:
- ✅ Path resolution consistente in tutti i tool
- ✅ Trailing slash gestito correttamente
- ✅ Working directory aggiornabile dinamicamente
- ✅ Security vulnerability risolta
- ✅ `isDirectory()` distingue "non esiste" da "è un file"

### Dopo FASE 1-6:
- ✅ 0 import da `node:child_process`
- ✅ 0 import da `node:fs/promises` per operazioni base
- ✅ 0 import da `node:crypto` per hash/random
- ✅ Performance I/O +30-50%
- ✅ Process spawn +5-10x
- ✅ Crypto hash +2-3x

**Ready to execute?** 🚀
