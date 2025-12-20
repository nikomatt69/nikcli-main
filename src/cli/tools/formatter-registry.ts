import path from 'node:path'

export type FormatterId = 'biome' | 'prettier' | 'black' | 'ruff-format' | 'rustfmt' | 'gofmt'

export interface FormatterSuggestion {
  id: FormatterId
  command: string
  args: string[]
  stdinFilePath?: string
  description: string
}

const EXTENSION_MAP: Record<string, FormatterId> = {
  '.ts': 'biome',
  '.tsx': 'biome',
  '.js': 'biome',
  '.jsx': 'biome',
  '.mjs': 'biome',
  '.cjs': 'biome',
  '.cts': 'biome',
  '.mts': 'biome',
  '.json': 'prettier',
  '.md': 'prettier',
  '.py': 'black',
  '.pyi': 'black',
  '.rs': 'rustfmt',
  '.go': 'gofmt',
}

function resolveFormatter(extension: string): FormatterId | undefined {
  return EXTENSION_MAP[extension.toLowerCase()]
}

export function suggestFormatter(filePath: string): FormatterSuggestion | null {
  const ext = path.extname(filePath)
  const formatter = resolveFormatter(ext)
  if (!formatter) return null

  switch (formatter) {
    case 'biome':
      return {
        id: 'biome',
        command: 'npx',
        args: ['biome', 'format', '--stdin-file-path', filePath],
        stdinFilePath: filePath,
        description: 'Biome formatter (ts/js/tsx)',
      }
    case 'prettier':
      return {
        id: 'prettier',
        command: 'npx',
        args: ['prettier', '--stdin-filepath', filePath],
        stdinFilePath: filePath,
        description: 'Prettier formatter (json/md/etc)',
      }
    case 'black':
      return {
        id: 'black',
        command: 'black',
        args: ['-'],
        stdinFilePath: filePath,
        description: 'Black formatter (python)',
      }
    case 'ruff-format':
      return {
        id: 'ruff-format',
        command: 'ruff',
        args: ['format', '-'],
        stdinFilePath: filePath,
        description: 'Ruff format (python)',
      }
    case 'rustfmt':
      return {
        id: 'rustfmt',
        command: 'rustfmt',
        args: ['--emit', 'stdout'],
        stdinFilePath: filePath,
        description: 'rustfmt (rust)',
      }
    case 'gofmt':
      return {
        id: 'gofmt',
        command: 'gofmt',
        args: ['-w'],
        description: 'gofmt (go)',
      }
    default:
      return null
  }
}

















