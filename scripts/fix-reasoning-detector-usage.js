#!/usr/bin/env bun

/**
 * Fix ReasoningDetector usage after converting to functions
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, extname } from 'path'

const replacements = [
  { from: 'ReasoningDetector.detectReasoningSupport', to: 'detectReasoningSupport' },
  { from: 'ReasoningDetector.shouldEnableReasoning', to: 'shouldEnableReasoning' },
  { from: 'ReasoningDetector.getProviderReasoningConfig', to: 'getProviderReasoningConfig' },
  { from: 'ReasoningDetector.extractReasoning', to: 'extractReasoning' },
  { from: 'ReasoningDetector.supportsReasoningMiddleware', to: 'supportsReasoningMiddleware' },
  { from: 'ReasoningDetector.getReasoningEnabledModels', to: 'getReasoningEnabledModels' },
  { from: 'ReasoningDetector.getModelReasoningSummary', to: 'getModelReasoningSummary' },
]

async function fixFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    let newContent = content

    // Apply all replacements
    for (const replacement of replacements) {
      newContent = newContent.replace(new RegExp(replacement.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement.to)
    }

    // Add import if needed
    if (newContent.includes('detectReasoningSupport') && !newContent.includes('import { detectReasoningSupport')) {
      const importLine = "import { detectReasoningSupport, shouldEnableReasoning, getProviderReasoningConfig, extractReasoning, supportsReasoningMiddleware, getReasoningEnabledModels, getModelReasoningSummary } from '../ai/reasoning-detector'"
      newContent = newContent.replace(/import.*from.*reasoning-detector.*\n/, '')
      newContent = newContent.replace(/(import.*\n)+/, `$&${importLine}\n`)
    }

    // Only write if content changed
    if (newContent !== content) {
      await writeFile(filePath, newContent, 'utf8')
      console.log(`✅ Fixed ReasoningDetector usage: ${filePath}`)
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
  console.log('🔧 Fixing ReasoningDetector usage...')
  
  const startTime = Date.now()
  const fixedCount = await fixDirectory('src')
  const endTime = Date.now()
  
  console.log(`\n✅ Fixed ${fixedCount} files in ${endTime - startTime}ms`)
}

main().catch(console.error)