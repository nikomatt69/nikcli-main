# StreamTTY - Cleanup & Integration Report

**Data**: 2025-01-18  
**Status**: Cleanup in Progress

## 🗑️ File da Rimuovere (Vecchi/Duplicati)

### Plugin System - OLD
- `src/plugins/plugin-system.ts` - OBSOLETO (rimpiazzato da plugin-system-inline.ts)
- `src/plugins/types.ts` - OBSOLETO
- `src/plugins/remark/` - DIR (plugins vecchi remark)
- `src/plugins/rehype/` - DIR (plugins vecchi rehype)
- `src/plugins/index.ts` - OBSOLETO

### Renderers - OLD/DUPLICATE
- `src/renderers/math-renderer.ts` - DUPLICATE (rimpiazzato da utils/math-unicode-renderer.ts)
- `src/renderers/unicode-math.ts` - DUPLICATE
- `src/renderers/mermaid-renderer.ts` - DUPLICATE (rimpiazzato da utils/mermaid-ascii-renderer.ts)
- `src/renderers/mermaid-ascii.ts` - DUPLICATE
- `src/renderers/table-renderer.ts` - DUPLICATE (rimpiazzato da utils/table-formatter-inline.ts)
- `src/renderers/table-ascii.ts` - DUPLICATE
- `src/renderers/shiki-ansi.ts` - DUPLICATE (rimpiazzato da utils/shiki-ansi-renderer.ts)
- `src/renderers/index.ts` - OBSOLETO
- `src/renderers/` - DIR (intero)

### Streaming - OLD
- `src/streaming-integration.ts` - OBSOLETO (rimpiazzato da plugins/plugin-system-inline.ts)

### Security - OLD
- `src/security/` - DIR (controllare cosa c'è dentro)

## ✅ File da Mantenere (Nuovi/Core)

### Nuovo Plugin System
- ✅ `src/plugins/plugin-system-inline.ts` - NUOVO (core)

### Nuovi Utils
- ✅ `src/utils/shiki-ansi-renderer.ts` - NUOVO
- ✅ `src/utils/math-unicode-renderer.ts` - NUOVO
- ✅ `src/utils/mermaid-ascii-renderer.ts` - NUOVO
- ✅ `src/utils/table-formatter-inline.ts` - NUOVO

### Nuova Security
- ✅ `src/security/ansi-sanitizer.ts` - NUOVO

### Streaming & Widgets
- ✅ `src/streaming/stream-stats.ts` - NUOVO
- ✅ `src/widgets/stream-indicator.ts` - NUOVO

### Core Files
- ✅ `src/index.ts` - AGGIORNATO
- ✅ `src/renderer/blessed-renderer.ts` - MANTENERE
- ✅ `src/parser/streaming-parser.ts` - MANTENERE
- ✅ `src/types/` - MANTENERE
- ✅ `src/themes/` - MANTENERE

## 📋 Azioni

1. Elimina dirs vecchie: renderers/, renderers dupl., vecchi plugin systems
2. Verifica security/ (potrebbe avere input-validator.ts utilizzato)
3. Aggiorna index.ts per verificare imports
4. Verifica che blessed-renderer.ts usi i nuovi utils
5. Test build
