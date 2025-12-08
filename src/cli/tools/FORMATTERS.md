## LSP preferences

- Python: prefer `pyright-langserver` when available; fallback to `pylsp`. Workspace root detection honors `pyproject.toml`, `pyrightconfig.json`, `poetry.lock`, `requirements.txt`, `Pipfile`, `.venv`/`venv`.

## Formatter mapping (suggest-only)

- `.ts/.tsx/.js/.jsx/.mjs/.cjs/.cts/.mts` → `npx biome format --stdin-file-path <file>`
- `.json/.md` → `npx prettier --stdin-filepath <file>`
- `.py/.pyi` → `black -` (or `ruff format -` alternative)
- `.rs` → `rustfmt --emit stdout`
- `.go` → `gofmt -w`

Notes:
- The format suggestion tool only returns the command/args; it does not execute the formatter.
- Commands assume availability in PATH (use `npx` for JS formatters).*** End Patch
