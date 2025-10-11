#!/usr/bin/env bun

/**
 * Migration script to replace Node.js APIs with Bun 1.3 equivalents
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, extname } from 'path'

const replacements = [
  // Node.js imports to Bun equivalents
  { from: "import { spawn } from 'child_process'", to: "import { spawn } from 'child_process'" },
  { from: "import { exec } from 'child_process'", to: "import { exec } from 'child_process'" },
  { from: "import { execSync } from 'child_process'", to: "import { execSync } from 'child_process'" },
  { from: "import { execFile } from 'child_process'", to: "import { execFile } from 'child_process'" },
  { from: "import { EventEmitter } from 'events'", to: "import { EventEmitter } from 'events'" },
  { from: "import * as fs from 'fs'", to: "import * as fs from 'fs'" },
  { from: "import { promises as fs } from 'fs'", to: "import { promises as fs } from 'fs'" },
  { from: "import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs'", to: "import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs'" },
  { from: "import { readFile, writeFile, mkdir, unlink, copyFile } from 'fs/promises'", to: "import { readFile, writeFile, mkdir, unlink, copyFile } from 'fs/promises'" },
  { from: "import * as path from 'path'", to: "import * as path from 'path'" },
  { from: "import { join, resolve, dirname, extname, basename, relative } from 'path'", to: "import { join, resolve, dirname, extname, basename, relative } from 'path'" },
  { from: "import { randomBytes, createHash } from 'crypto'", to: "import { randomBytes, createHash } from 'crypto'" },
  { from: "import crypto from 'crypto'", to: "import crypto from 'crypto'" },
  { from: "import { promisify } from 'util'", to: "import { promisify } from 'util'" },
  { from: "import { performance } from 'perf_hooks'", to: "import { performance } from 'perf_hooks'" },
  { from: "import { homedir, tmpdir } from 'os'", to: "import { homedir, tmpdir } from 'os'" },
  { from: "import * as os from 'os'", to: "import * as os from 'os'" },
  { from: "import { createServer } from 'http'", to: "import { createServer } from 'http'" },
  { from: "import http from 'http'", to: "import http from 'http'" },
  { from: "import https from 'https'", to: "import https from 'https'" },
  { from: "import { readline } from 'readline'", to: "import { readline } from 'readline'" },
  { from: "import * as readline from 'readline'", to: "import * as readline from 'readline'" },

  // Process references to Bun equivalents
  { from: "process.env.", to: "process.env." },
  { from: "process.cwd()", to: "process.cwd()" },
  { from: "process.exit(", to: "process.exit(" },
  { from: "process.version", to: "process.version" },
  { from: "process.platform", to: "process.platform" },
  { from: "process.arch", to: "process.arch" },
  { from: "process.stdin", to: "process.stdin" },
  { from: "process.stdout", to: "process.stdout" },
  { from: "process.stderr", to: "process.stderr" },
  { from: "process.argv", to: "process.argv" },
  { from: "process.on(", to: "process.on(" },
  { from: "process.off(", to: "process.off(" },
  { from: "process.removeListener(", to: "process.removeListener(" },
  { from: "process.addListener(", to: "process.addListener(" },

  // require.main to import.meta.main
  { from: "import.meta.main", to: "import.meta.main" },

  // Timer to Timer
  { from: "Timer", to: "Timer" },

  // require('node:') patterns
  { from: "require('child_process')", to: "require('child_process')" },
  { from: "require('events')", to: "require('events')" },
  { from: "require('fs')", to: "require('fs')" },
  { from: "require('fs/promises')", to: "require('fs/promises')" },
  { from: "require('path')", to: "require('path')" },
  { from: "require('crypto')", to: "require('crypto')" },
  { from: "require('util')", to: "require('util')" },
  { from: "require('os')", to: "require('os')" },
  { from: "require('http')", to: "require('http')" },
  { from: "require('https')", to: "require('https')" },
  { from: "require('perf_hooks')", to: "require('perf_hooks')" },
  { from: "require('readline')", to: "require('readline')" },

  // Shebang updates
  { from: "#!/usr/bin/env bun", to: "#!/usr/bin/env bun" },
]

async function migrateFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    let newContent = content

    // Apply all replacements
    for (const replacement of replacements) {
      newContent = newContent.replace(new RegExp(replacement.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement.to)
    }

    // Only write if content changed
    if (newContent !== content) {
      await writeFile(filePath, newContent, 'utf8')
      console.log(`✅ Migrated: ${filePath}`)
      return true
    }
    return false
  } catch (error) {
    console.error(`❌ Error migrating ${filePath}:`, error.message)
    return false
  }
}

async function migrateDirectory(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    let migratedCount = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      
      if (entry.isDirectory()) {
        // Skip node_modules and other directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue
        }
        migratedCount += await migrateDirectory(fullPath)
      } else if (entry.isFile() && (extname(entry.name) === '.ts' || extname(entry.name) === '.js')) {
        if (await migrateFile(fullPath)) {
          migratedCount++
        }
      }
    }

    return migratedCount
  } catch (error) {
    console.error(`❌ Error migrating directory ${dirPath}:`, error.message)
    return 0
  }
}

async function main() {
  console.log('🚀 Starting migration from Node.js to Bun 1.3...')
  
  const startTime = Date.now()
  const migratedCount = await migrateDirectory('.')
  const endTime = Date.now()
  
  console.log(`\n✅ Migration completed!`)
  console.log(`📊 Migrated ${migratedCount} files in ${endTime - startTime}ms`)
  console.log(`\n🔧 Next steps:`)
  console.log(`   1. Run 'bun install' to install dependencies`)
  console.log(`   2. Run 'bun run build' to build the project`)
  console.log(`   3. Run 'bun run start' to test the application`)
}

main().catch(console.error)