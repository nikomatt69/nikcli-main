# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (CLI in `src/cli/*`, agents in `src/cli/automation/agents`, utilities in `src/cli/utils`).
- Tests: `tests/` (unit, integration, e2e) and `src/**/*.{test,spec}.ts`.
- Builds: `dist/` (compiled output). Docs and scripts in `docs/` and `scripts/`.
- Other: `bin/` (entry), `installer/`, `database/`, `tsconfig*.json`.

## Build, Test, and Development Commands
- `npm start`: Run the CLI in dev via ts-node.
- `npm run build`: Compile TypeScript to `dist/` (Node 18+ required).
- `npm run build:start`: Build then execute `dist/cli/index.js`.
- `npm test` / `npm run test:watch`: Run tests (Vitest) with watch support.
- `npm run lint`: Lint TypeScript per ESLint rules.

## Coding Style & Naming Conventions
- Language: TypeScript. Indent with 2 spaces; LF line endings; final newline (`.editorconfig`).
- Style: single quotes, semicolons, no `var`, prefer `const`; enforce via ESLint.
- Files: descriptive names; tests end with `.test.ts` or `.spec.ts`.
- Imports: prefer path aliases (`@`, `@cli`, `@agents`, etc. per `vitest.config.ts`).

## Testing Guidelines
- Framework: Vitest with Node environment and globals.
- Locations: `tests/**` and `src/**` matching `*.{test,spec}.ts`.
- Coverage: V8 provider; CLI coverage thresholds set at 60% (branches, lines, funcs, stmts).
- Utilities: reuse helpers in `tests/setup.ts` (temp workspaces, file helpers).
- Run: `npm test` (CI uses `vitest run`).

## Commit & Pull Request Guidelines
- Commits: imperative, present tense (“Add…”, “Fix…”); concise subject; include scope when useful.
- Before PR: run `npm run lint` and `npm test`; add/adjust tests for changes.
- PRs: clear description, linked issues (`Fixes #123`), CLI screenshots or command output for UX changes.
- Versioning: tags like `0.3.x-beta` are used for releases; keep changelog entries focused.

## Security & Configuration Tips
- Secrets: never commit keys; use `.env`/`.env.production` (dotenv, keytar for storage at runtime).
- Node: require Node >= 18. Avoid test/network side effects; prefer mocks.

## Agent-Specific Notes
- Agent code lives in `src/cli/automation/agents`. Develop with `npm start` and exercise via the CLI (e.g., `/agent universal-agent "…"`).
