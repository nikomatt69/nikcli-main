#!/usr/bin/env bun

/**
 * Fix process.cwd() usage - replace with process.cwd()
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, extname } from 'path'

async function fixFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    let newContent = content

    // Replace process.cwd() with process.cwd()
    newContent = newContent.replace(/Bun\.cwd\(\)/g, 'process.cwd()')

    // Only write if content changed
    if (newContent !== content) {
      await writeFile(filePath, newContent, 'utf8')
      console.log(`✅ Fixed process.cwd(): ${filePath}`)
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
      } else if (entry.isFile() && (extname(entry.name) === '.ts' || extname(entry.name) === '.js')) {
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
  console.log('🔧 Fixing process.cwd() usage...')
  
  const startTime = Date.now()
  const fixedCount = await fixDirectory('.')
  const endTime = Date.now()
  
  console.log(`\n✅ Fixed ${fixedCount} files in ${endTime - startTime}ms`)
}

main().catch(console.error)