#!/usr/bin/env node

/**
 * Update Homebrew Formula
 * Automatically calculates SHA256 and updates nikcli.rb
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const distDir = path.join(projectRoot, 'public', 'bin')
const formulaPath = path.join(projectRoot, 'installer', 'nikcli.rb')

console.log('🍺 Updating Homebrew Formula\n')

// Read package.json for version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
)
const version = packageJson.version

console.log(`📦 Version: ${version}`)

// Check if tar.gz exists
const tarballPath = path.join(distDir, 'nikcli-standalone.tar.gz')
if (!fs.existsSync(tarballPath)) {
  console.error('❌ nikcli-standalone.tar.gz not found!')
  console.error('   Run: bun run package:standalone first')
  process.exit(1)
}

// Calculate SHA256
console.log('\n🔐 Calculating SHA256...')
const sha256 = execSync(`shasum -a 256 "${tarballPath}"`, {
  encoding: 'utf-8',
})
  .trim()
  .split(' ')[0]

console.log(`   SHA256: ${sha256}`)

// Read current formula
const formula = fs.readFileSync(formulaPath, 'utf-8')

// Update formula
let updatedFormula = formula

// Update version
updatedFormula = updatedFormula.replace(
  /version\s+"[^"]+"/,
  `version "${version}"`
)

// Update SHA256 (support both ARM64 and x64, but use same hash for now)
updatedFormula = updatedFormula.replace(
  /sha256\s+"REPLACE_WITH_ACTUAL_SHA256_ARM64"/,
  `sha256 "${sha256}"`
)
updatedFormula = updatedFormula.replace(
  /sha256\s+"REPLACE_WITH_ACTUAL_SHA256_X64"/,
  `sha256 "${sha256}"`
)
updatedFormula = updatedFormula.replace(
  /sha256\s+"REPLACE_WITH_ACTUAL_SHA256_LINUX"/,
  `sha256 "${sha256}"`
)

// Update all existing SHA256 hashes to the new one
updatedFormula = updatedFormula.replace(
  /sha256\s+"[a-f0-9]{64}"/g,
  `sha256 "${sha256}"`
)

// Write updated formula
fs.writeFileSync(formulaPath, updatedFormula)

console.log('\n✅ Homebrew formula updated!')
console.log(`📍 Location: ${formulaPath}`)

console.log('\n📋 Next steps:')
console.log('  1. Review changes: git diff installer/nikcli.rb')
console.log('  2. Create GitHub release v' + version)
console.log('  3. Upload nikcli-standalone.tar.gz as release asset')
console.log('  4. Update Homebrew tap:')
console.log('     cd ../homebrew-nikcli')
console.log('     cp ../nikcli-main/installer/nikcli.rb Formula/')
console.log('     git add Formula/nikcli.rb')
console.log('     git commit -m "Update nikcli to v' + version + '"')
console.log('     git push')
