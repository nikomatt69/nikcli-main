#!/usr/bin/env bun

/**
 * Automated Node.js to Bun API Migration Script
 *
 * This script automatically migrates Node.js-specific APIs to Bun equivalents
 * across the codebase.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

interface MigrationRule {
  pattern: RegExp
  replacement: string
  description: string
}

const MIGRATION_RULES: MigrationRule[] = [
  // Import migrations
  {
    pattern: /import\s+{([^}]*?)}\s+from\s+['"]node:fs['"]/g,
    replacement: "import { bunFile, bunWrite, readText, writeText, fileExists, mkdirp } from '../utils/bun-compat'",
    description: 'Migrate fs imports to bun-compat'
  },
  {
    pattern: /import\s+fs\s+from\s+['"]node:fs['"]/g,
    replacement: "import { bunFile, bunWrite, readText, writeText, fileExists, mkdirp } from '../utils/bun-compat'",
    description: 'Migrate fs default import to bun-compat'
  },
  {
    pattern: /import\s+{([^}]*?)}\s+from\s+['"]node:crypto['"]/g,
    replacement: "import { bunHash, bunHashSync, bunRandomBytes } from '../utils/bun-compat'",
    description: 'Migrate crypto imports to bun-compat'
  },

  // fs.existsSync replacements
  {
    pattern: /fs\.existsSync\(([^)]+)\)/g,
    replacement: 'await fileExists($1)',
    description: 'Replace fs.existsSync with fileExists'
  },
  {
    pattern: /existsSync\(([^)]+)\)/g,
    replacement: 'await fileExists($1)',
    description: 'Replace existsSync with fileExists'
  },

  // fs.readFileSync replacements
  {
    pattern: /fs\.readFileSync\(([^,]+),\s*['"]utf-?8['"]\)/g,
    replacement: 'await readText($1)',
    description: 'Replace fs.readFileSync with readText'
  },
  {
    pattern: /readFileSync\(([^,]+),\s*['"]utf-?8['"]\)/g,
    replacement: 'await readText($1)',
    description: 'Replace readFileSync with readText'
  },

  // fs.writeFileSync replacements
  {
    pattern: /fs\.writeFileSync\(([^,]+),\s*([^,]+),\s*['"]utf-?8['"]\)/g,
    replacement: 'await writeText($1, $2)',
    description: 'Replace fs.writeFileSync with writeText'
  },
  {
    pattern: /writeFileSync\(([^,]+),\s*([^,]+),\s*['"]utf-?8['"]\)/g,
    replacement: 'await writeText($1, $2)',
    description: 'Replace writeFileSync with writeText'
  },
  {
    pattern: /fs\.writeFileSync\(([^,]+),\s*([^)]+)\)/g,
    replacement: 'await writeText($1, $2)',
    description: 'Replace fs.writeFileSync with writeText (no encoding)'
  },
  {
    pattern: /writeFileSync\(([^,]+),\s*([^)]+)\)/g,
    replacement: 'await writeText($1, $2)',
    description: 'Replace writeFileSync with writeText (no encoding)'
  },

  // fs.mkdirSync replacements
  {
    pattern: /fs\.mkdirSync\(([^,]+),\s*{\s*recursive:\s*true\s*}\)/g,
    replacement: 'await mkdirp($1)',
    description: 'Replace fs.mkdirSync with mkdirp'
  },
  {
    pattern: /mkdirSync\(([^,]+),\s*{\s*recursive:\s*true\s*}\)/g,
    replacement: 'await mkdirp($1)',
    description: 'Replace mkdirSync with mkdirp'
  },

  // crypto.createHash replacements
  {
    pattern: /createHash\(['"]([^'"]+)['"]\)\.update\(([^)]+)\)\.digest\(['"]hex['"]\)/g,
    replacement: 'bunHashSync(\'$1\', $2, \'hex\')',
    description: 'Replace createHash(...).update(...).digest(hex)'
  },
  {
    pattern: /createHash\(['"]([^'"]+)['"]\)\.update\(([^)]+)\)\.digest\(['"]base64['"]\)/g,
    replacement: 'bunHashSync(\'$1\', $2, \'base64\')',
    description: 'Replace createHash(...).update(...).digest(base64)'
  },

  // crypto.randomBytes replacements
  {
    pattern: /crypto\.randomBytes\((\d+)\)/g,
    replacement: 'bunRandomBytes($1)',
    description: 'Replace crypto.randomBytes'
  },
  {
    pattern: /randomBytes\((\d+)\)/g,
    replacement: 'bunRandomBytes($1)',
    description: 'Replace randomBytes'
  },

  // path.join with homedir() - specific for nikcli pattern
  {
    pattern: /join\(homedir\(\),\s*['"]\.nikcli['"](.*?)\)/g,
    replacement: '`${homedir()}/.nikcli$1`',
    description: 'Replace path.join with template strings for .nikcli paths'
  },
]

class BunMigrationTool {
  private stats = {
    filesProcessed: 0,
    filesModified: 0,
    rulesApplied: 0,
    errors: 0
  }

  async migrateFile(filePath: string, dryRun = false): Promise<boolean> {
    try {
      const content = await readFile(filePath, 'utf-8')
      let modified = content
      let changed = false
      const appliedRules: string[] = []

      for (const rule of MIGRATION_RULES) {
        const before = modified
        modified = modified.replace(rule.pattern, rule.replacement)

        if (before !== modified) {
          changed = true
          appliedRules.push(rule.description)
          this.stats.rulesApplied++
        }
      }

      this.stats.filesProcessed++

      if (changed) {
        this.stats.filesModified++

        if (!dryRun) {
          await writeFile(filePath, modified, 'utf-8')
          console.log(`✓ Migrated: ${filePath}`)
          appliedRules.forEach(rule => console.log(`  - ${rule}`))
        } else {
          console.log(`[DRY RUN] Would migrate: ${filePath}`)
          appliedRules.forEach(rule => console.log(`  - ${rule}`))
        }

        return true
      }

      return false
    } catch (error) {
      console.error(`✖ Error migrating ${filePath}:`, error)
      this.stats.errors++
      return false
    }
  }

  async migrateDirectory(dirPath: string, pattern: RegExp = /\.ts$/, dryRun = false): Promise<void> {
    if (!existsSync(dirPath)) {
      console.error(`Directory not found: ${dirPath}`)
      return
    }

    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'dist', 'build'].includes(entry.name)) {
        await this.migrateDirectory(fullPath, pattern, dryRun)
      } else if (entry.isFile() && pattern.test(entry.name)) {
        await this.migrateFile(fullPath, dryRun)
      }
    }
  }

  printStats(): void {
    console.log('\n' + '='.repeat(50))
    console.log('Migration Statistics:')
    console.log('='.repeat(50))
    console.log(`Files processed: ${this.stats.filesProcessed}`)
    console.log(`Files modified:  ${this.stats.filesModified}`)
    console.log(`Rules applied:   ${this.stats.rulesApplied}`)
    console.log(`Errors:          ${this.stats.errors}`)
    console.log('='.repeat(50))
  }
}

// CLI execution
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find(arg => !arg.startsWith('--')) || 'src/cli'

console.log('🔧 Bun API Migration Tool')
console.log(`Target: ${target}`)
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY CHANGES'}`)
console.log('')

const migrator = new BunMigrationTool()

await migrator.migrateDirectory(target, /\.ts$/, dryRun)
migrator.printStats()

if (dryRun) {
  console.log('\n💡 Run without --dry-run to apply changes')
}
