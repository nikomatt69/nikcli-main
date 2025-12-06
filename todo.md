# TaskMaster AI Plan: TaskMaster Plan: '/Volumes/SSD/Documents/Personal/nikcli-main/src/streamed-wiggling-fog.md' leggi e poi crea le task necessarie per esegguire il plan

**Generated:** 2025-12-06T20:29:04.294Z
**Planning Engine:** TaskMaster AI
**Request:** '/Volumes/SSD/Documents/Personal/nikcli-main/src/streamed-wiggling-fog.md' leggi e poi crea le task necessarie per esegguire il plan
**Risk Level:** medium
**Estimated Duration:** 0 minutes

## Description

'/Volumes/SSD/Documents/Personal/nikcli-main/src/streamed-wiggling-fog.md' leggi e poi crea le task necessarie per esegguire il plan

## Risk Assessment

- **Overall Risk:** medium
- **Destructive Operations:** 2
- **File Modifications:** 7
- **External Calls:** 0

## Tasks

### 1. ⚡︎ Fix Path Handling System (FASE 0) 🔴

**Description:** CRITICO: Risolvere bug path handling prima della migrazione Bun. Creare PathResolver centralizzato in `src/cli/utils/path-resolver.ts` che gestisce: 1) Working directory dinamica, 2) Trailing slash detection, 3) Security path traversal, 4) Directory vs File distinction. Aggiornare BaseTool, WriteFileTool, ToolRegistry e ToolsManager per usare il nuovo sistema.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** I bug di path handling sono più gravi della migrazione Bun e devono essere risolti PRIMA, altrimenti peggiorano durante la migrazione. Include security vulnerability in tools-manager.ts.

**Status:** in_progress
**Priority:** high
**Progress:** 15%

---

### 2. ⏳︎ Estendere Bun Compat Helpers (FASE 1) 🔴

**Description:** Aggiungere helper functions mancanti a `src/cli/utils/bun-compat.ts`: fileExists(), mkdirp(), copyFile(), removeFile(), readJson(), writeJson() per risolvere runtime error in task-executor.ts. Estendere il layer di compatibilità esistente (già 45+ funzioni) con 10+ nuove utility.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** task-executor.ts importa funzioni (fileExists, mkdirp) che non esistono causando runtime error garantito. Queste sono prerequisite per completare le migrazioni successive.

**Status:** pending
**Priority:** high
**Progress:** 0%

---

### 3. ⏳︎ Fix Critical Task Executor Bug 🔴

**Description:** Risolvere bug in `src/cli/github-bot/task-executor.ts`: sostituire execSync non importato (riga 635) con bunShellSync, migrare git commands a Bun Shell (righe 713-728), e aggiornare runTests function (righe 780-783). Il file usa execSync senza import corretto.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** Bug critico che impedisce l'esecuzione del GitHub bot. execSync è usato senza import e deve essere sostituito con Bun equivalent per consistenza con la migrazione.

**Status:** pending
**Priority:** high
**Progress:** 0%

---

### 4. ⏳︎ Completare Write File Tool Migration 🔴

**Description:** Terminare migrazione di `src/cli/tools/write-file-tool.ts` da node:fs a Bun: sostituire import node:fs/promises con bun-compat helpers, migrare mkdir() a mkdirp(), unlink() a removeFile(), copyFile() a Bun version. Il file usa già Bun.file() e Bun.write() ma mantiene dipendenze Node.js per mkdir/unlink/copyFile.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** Migrazione parziale che causa dipendenze miste Node/Bun. Deve essere completata per eliminare tutte le dipendenze node:fs/promises in questo file critico per le operazioni file.

**Status:** pending
**Priority:** high
**Progress:** 0%

---

### 5. ⏳︎ Migrare File High-Impact Core 🟡

**Description:** Migliare 5 file core ad alto impatto: session-manager.ts, work-session-manager.ts, workspace-context.ts, config-manager.ts, nik-cli-commands.ts. Pattern: replace node:fs/promises → bunFile/bunWrite/mkdirp, node:crypto → bunHash/bunRandomBytes, child_process → Bun Shell/$.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** File core che impattano sessioni, workspace, configurazioni e comandi CLI. Migrare questi per ottenere il maggior beneficio di performance (30-50% I/O, 5-10x process spawn) early nel processo.

**Status:** pending
**Priority:** medium
**Progress:** 0%

---

### 6. ⏳︎ Batch Migration Remaining Files 🟡

**Description:** Migrare in batch i ~150 file rimanenti organizzati per categoria: Context/RAG systems (10 file), Providers (15 file), Services (15 file), Background agents (10 file). Applicare pattern standard di migrazione Node→Bun per crypto, file I/O e child process.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** Volume maggiore del lavoro di migrazione. Batch processing organizzato per mantenere consistenza e ridurre il tempo totale di migrazione. Questi file beneficiano della migrazione ma non sono bloccanti.

**Status:** pending
**Priority:** medium
**Progress:** 0%

---

### 7. ⏳︎ Cleanup Finale e Verifica 🟢

**Description:** Rimuovere import inutilizzati da node:fs, node:child_process, node:crypto. Verificare che non ci siano più dipendenze Node.js (grep pattern). Testare build con `bun run build` e test funzionali con `bun test`. Aggiornare/deprecare cross-runtime.ts e documentare metriche di successo raggiunte.

**Tools:** find-files-tool, glob-tool, read-file-tool, write-file-tool, web-search-tool, replace, edit, multi-edit-tool, multi-read-tool, rag-search-tool, run-command-tool, bash-tool, json-patch-tool, git-tools, delete-file-tool, vision-analysis-tool, image-generation-tool, coinbase-agentkit-tool, goat-tool, browserbase-tool, list-tool, grep-tool, text-to-cad-tool, text-to-gcode-tool, diff-tool, tree-tool, watch-tool, browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract_text, browser_wait_for_element, browser_scroll, browser_execute_script, browser_get_page_info, nikdrive-tool

**Reasoning:** Cleanup finale per assicurare migrazione completa senza residui Node.js. Verifica che tutti gli obiettivi di performance siano stati raggiunti e che il sistema sia completamente Bun-native.

**Status:** pending
**Priority:** low
**Progress:** 0%

---

## Summary

- **Total Tasks:** 7
- **Pending:** 6
- **In Progress:** 1
- **Completed:** 0
- **Failed:** 0

*Generated by TaskMaster AI integrated with NikCLI*
