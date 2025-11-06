#!/usr/bin/env node

/**
 * Fix ESM-only packages to add "main" field for CommonJS compatibility
 * This resolves "No exports main defined" errors
 */

const fs = require('fs')
const path = require('path')

// List of ESM-only packages that need "main" field fixes
const packagesToFix = [
  {
    name: 'unicorn-magic',
    main: './node.js', // Uses node.js as entry point
  },
  {
    name: 'is-plain-obj',
    main: './index.js',
  },
  {
    name: 'is-docker',
    main: './index.js',
  },
  {
    name: 'is-inside-container',
    main: './index.js',
  },
  {
    name: 'responselike',
    main: './index.js',
  },
  {
    name: 'pkce-challenge',
    main: './dist/index.js', // Check if dist exists, otherwise use index.js
  },
]

function fixPackage(pkgName, mainField) {
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules')

  // Try standard location first
  let pkgPath = path.join(nodeModulesPath, pkgName, 'package.json')

  // If not found, try pnpm structure (.pnpm/package@version/node_modules/package)
  // pnpm can nest packages inside other packages (e.g., .pnpm/globby@15.0.0/node_modules/unicorn-magic)
  if (!fs.existsSync(pkgPath)) {
    const pnpmPath = path.join(nodeModulesPath, '.pnpm')
    if (fs.existsSync(pnpmPath)) {
      // Search recursively in .pnpm structure
      // Check all directories in .pnpm for nested node_modules containing our package
      const entries = fs.readdirSync(pnpmPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if this directory has node_modules with our package
          const candidatePath = path.join(pnpmPath, entry.name, 'node_modules', pkgName, 'package.json')
          if (fs.existsSync(candidatePath)) {
            pkgPath = candidatePath
            break
          }
        }
      }
    }
  }

  if (!fs.existsSync(pkgPath)) {
    return { fixed: false, reason: 'not found' }
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

    // Skip if already has main field
    if (packageJson.main) {
      return { fixed: false, reason: 'already has main' }
    }

    // Verify the main file exists
    const mainPath = path.join(path.dirname(pkgPath), mainField)
    if (!fs.existsSync(mainPath)) {
      // Try alternative paths
      const alternatives = ['./index.js', './dist/index.js', './src/index.js']
      let found = false
      for (const alt of alternatives) {
        const altPath = path.join(path.dirname(pkgPath), alt)
        if (fs.existsSync(altPath)) {
          packageJson.main = alt
          found = true
          break
        }
      }
      if (!found) {
        return { fixed: false, reason: `main file not found: ${mainField}` }
      }
    } else {
      packageJson.main = mainField
    }

    // Write back the fixed package.json
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, '\t') + '\n', 'utf8')
    return { fixed: true, main: packageJson.main }
  } catch (error) {
    return { fixed: false, reason: error.message }
  }
}

// Fix all packages
console.log('🔧 Fixing ESM-only packages for CommonJS compatibility...\n')

let fixedCount = 0
let skippedCount = 0

for (const pkg of packagesToFix) {
  const result = fixPackage(pkg.name, pkg.main)

  if (result.fixed) {
    console.log(`✅ Fixed ${pkg.name}: added "main": "${result.main}"`)
    fixedCount++
  } else if (result.reason === 'not found') {
    // Silently skip if package not installed
  } else if (result.reason === 'already has main') {
    // Silently skip if already fixed
  } else {
    console.log(`⚠️  Skipped ${pkg.name}: ${result.reason}`)
    skippedCount++
  }
}

console.log(`\n✨ Fixed ${fixedCount} package(s)${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`)

