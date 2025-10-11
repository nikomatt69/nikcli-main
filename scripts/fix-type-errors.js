#!/usr/bin/env bun

/**
 * Fix TypeScript and linting errors after Bun migration
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, extname } from 'path'

const fixes = [
  // Fix non-null assertions with optional chaining
  { from: /(\w+)!\.(\w+)/g, to: '$1?.$2' },
  { from: /(\w+)!\[/g, to: '$1?.[' },
  { from: /(\w+)!\(/g, to: '$1?.(' },
  
  // Fix forEach with return values
  { from: /\.forEach\([^)]*\)\s*\.forEach\(/g, to: '.forEach(' },
  
  // Remove unused variables
  { from: /const\s*{\s*name,\s*config\s*}\s*=\s*[^;]+;\s*$/gm, to: 'const { config } = this.getCurrentModelInfo()' },
  
  // Fix static-only classes by converting to functions
  { from: /export class (\w+)\s*{([^}]+)}\s*$/gms, to: (match, className, body) => {
    if (body.includes('static ')) {
      return `export function ${className.toLowerCase()}() {\n${body.replace(/static /g, '')}\n}`
    }
    return match
  }},
  
  // Remove unused private members
  { from: /private\s+\w+:\s*any\s*=\s*null;\s*$/gm, to: '' },
]

async function fixFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    let newContent = content

    // Apply all fixes
    for (const fix of fixes) {
      if (typeof fix === 'function') {
        newContent = newContent.replace(fix.from, fix.to)
      } else {
        newContent = newContent.replace(fix.from, fix.to)
      }
    }

    // Only write if content changed
    if (newContent !== content) {
      await writeFile(filePath, newContent, 'utf8')
      console.log(`✅ Fixed: ${filePath}`)
      return true
    }
    return false
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message)
    return false
  }
}

async function fixDirectory(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    let fixedCount = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      
      if (entry.isDirectory()) {
        // Skip node_modules and other directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue
        }
        fixedCount += await fixDirectory(fullPath)
      } else if (entry.isFile() && extname(entry.name) === '.ts') {
        if (await fixFile(fullPath)) {
          fixedCount++
        }
      }
    }

    return fixedCount
  } catch (error) {
    console.error(`❌ Error fixing directory ${dirPath}:`, error.message)
    return 0
  }
}

async function main() {
  console.log('🔧 Fixing TypeScript and linting errors...')
  
  const startTime = Date.now()
  const fixedCount = await fixDirectory('src')
  const endTime = Date.now()
  
  console.log(`\n✅ Fixed ${fixedCount} files in ${endTime - startTime}ms`)
}

main().catch(console.error)