# 📝 Changelog - Nikcli

All notable changes to Nikcli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2025-09-30

### 🚀 **Vim Integration & Cognitive Enhancements**

#### ✨ **Added**

##### **Comprehensive Vim Mode Integration**

- **VimManager Class**: Full Vim integration via `dist/cli/vim/vim-manager-fixed.js` (397 lines).
  - Auto-generates optimized .vimrc with vim-plug, 10+ plugins (NERDTree, ALE, Gruvbox, etc.).
  - Custom mappings (jj to Esc, leader keys for save/quit/toggle).
  - Session management in `~/.vim/sessions` with auto-save on exit.
  - Methods: `setupVim()`, `openFile()`, `quickEdit()`, `diffFiles()`, `addPlugin()`.
- **New /vim Commands**: `/vim setup`, `/vim open <file>`, `/vim diff`, `/vim config`, `/vim sessions`.
- **AI-Vim Synergy**: Combine with agents for AI-assisted editing in Vim sessions.

##### **Cognitive Capabilities Enhancement**

- Improved agent cognition across universal, react, backend agents (commit bea036b).
- Enhanced output style management for AI responses (commit c9622b8).

##### **CAD & GCode Tooling**

- Integrated ai-cad-sdk bridge with SCAD export and CAD commands (commit 07be9d7).
- Restored TextToGCodeTool to fix type issues (commit 28cbb33).

#### 🔧 **Changes**

- Updated formatter config and CLI tool integration (commit 3107587).
- Code cleanup for consistency (commit 032d577).
- Dependency updates and CLI UI logging improvements (commit a144964).

#### 🐛 **Fixed**

- Resolved type-check failures in GCode tooling.

#### 📚 **Documentation**

- Updated NIKOCLI.md and README.md to reflect Vim features.
- Added examples for Vim-AI workflows.

### Previous Versions

## [0.1.1] - 2025-01-27

... (rest of previous changelog preserved)
