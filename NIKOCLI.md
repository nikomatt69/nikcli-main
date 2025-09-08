# NikCLI Project Overview

Generated: 2025-08-28T16:15:53.119Z

## Project

- Name: @cadcamfun/nikcli
- Version: 0.5.7-beta
- Description: NikCLI - Context-Aware AI Development Assistant
- Git Branch: main-0.3.3
- Last Commit: 9250dc8 2025-08-28 0.4.0-beta

## Scripts

- start: ts-node --project tsconfig.cli.json src/cli/index.ts
- dev: npm start
- build: tsc --project tsconfig.cli.json
- prepublishOnly: npm run build
- build:start: npm run build && node dist/cli/index.js
- build:binary: node build-all.js
- build:release: node scripts/build-release.js
- test: vitest
- test:run: vitest run
- test:watch: vitest --watch
- test:coherence: node tests/verify-coherence.js
- test:system: node tests/verify-system.js
- lint: eslint src --ext .ts,.tsx

## Dependencies

- Dependencies (56)
  - @ai-sdk/anthropic
  - @ai-sdk/gateway
  - @ai-sdk/google
  - @ai-sdk/openai
  - @ai-sdk/vercel
  - @chroma-core/default-embed
  - @supabase/supabase-js
  - @types/blessed
  - @types/diff
  - @types/inquirer
  - @upstash/redis
  - ai
  - blessed
  - boxen
  - chalk
  - chokidar
  - chromadb
  - cli-progress
  - commander
  - conf
  - cors
  - diff
  - dotenv
  - express
  - express-rate-limit
  - globby
  - gradient-string
  - helmet
  - highlight.js
  - ink
  - ink-box
  - ink-divider
  - ink-select-input
  - ink-spinner
  - ink-table
  - ink-text-input
  - inquirer
  - ioredis
  - js-yaml
  - jsonwebtoken
  - keytar
  - marked
  - marked-terminal
  - nanoid
  - next
  - ollama-ai-provider
  - ora
  - prismjs
  - react
  - react-dom
  - ...
- DevDependencies (27)
  - @types/chalk
  - @types/cli-progress
  - @types/cors
  - @types/express
  - @types/glob
  - @types/gradient-string
  - @types/ioredis
  - @types/js-yaml
  - @types/jsonwebtoken
  - @types/marked-terminal
  - @types/react
  - @types/react-dom
  - @types/uuid
  - @typescript-eslint/eslint-plugin
  - @typescript-eslint/parser
  - @vercel/ncc
  - @vitest/coverage-v8
  - @vitest/ui
  - autoprefixer
  - conf
  - esbuild
  - eslint
  - pkg
  - ts-node
  - typescript
  - vitest
  - ws

## Top-level Structure

- .checkpoints/
- .claude/
- .git/
- .github/
- .nikcli/
- .vscode/
- bin/
- database/
- dist/
- docs/
- generated_images/
- installer/
- node_modules/
- scripts/
- src/
- tests/
- ~/
- .DS_Store
- .editorconfig
- .env
- .env.production
- .eslintrc.js
- .gitattributes
- .gitignore
- AGENTS.md
- CHANGELOG.md
- CLAUDE.md
- LICENSE
- NIKOCLI.md
- README.md
- README_EN.md
- README_IT.md
- RELEASE.md
- RELEASE_README.md
- SECURITY.md
- create-release.sh
- package-lock.json
- package.json
- pkg-config.json
- tsconfig.cli.json
- tsconfig.json
- vitest.config.ts

## Code Stats

- Files: 34348
- Directories: 3832
- Test Files: 174
- TypeScript Files: 7442
- JavaScript Files: 13213

## Notes

- This file is used by NikCLI to provide project context.
- Update sections as needed, or regenerate with /init --force.
