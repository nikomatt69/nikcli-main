# NikCLI Installer (curl)

This folder contains simple shell scripts to install or uninstall the `nikcli` package using npm, convenient for curl piping.

> Beta: This project is currently at `0.2.60-beta`. Interfaces and behavior may change.

## Quick install (global)

Replace `USER_OR_ORG/REPO` with your GitHub path when publishing these scripts publicly.

```bash
# Install latest beta
type curl >/dev/null 2>&1 && curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash

# Or specify exact version
type curl >/dev/null 2>&1 && curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s -- --version 0.1.2
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/uninstall.sh | bash
```

## What the installer does

- Verifies Node.js (>= 18) and npm availability
- Installs `nikcli` globally via npm
- Summarizes PATH/bin location

## Notes & risks

- The installer uses `npm i -g`. Ensure your environment allows global installs.
- The CLI can propose/execute shell commands and modify files in the current workspace. Always review before accepting.
- With cloud providers configured, prompts/snippets may be sent to the provider. With Ollama, inference stays local.
