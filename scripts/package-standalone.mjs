#!/usr/bin/env node

/**
 * Package Standalone Distribution
 * Creates a complete package with binary + node_modules for standalone installation
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const distDir = path.join(projectRoot, 'public', 'bin')

console.log('📦 Creating standalone distribution packages\n')

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// Build all platform binaries with secrets first
console.log('🔨 Building all platform binaries...')
execSync('bun run build:all', {
  cwd: projectRoot,
  stdio: 'inherit',
})

// Get only production dependencies (no devDependencies)
console.log('\n📚 Installing production dependencies only...')
const tempNodeModules = path.join(projectRoot, 'node_modules_prod')
if (fs.existsSync(tempNodeModules)) {
  fs.rmSync(tempNodeModules, { recursive: true, force: true })
}

// Install only production deps in temporary location
execSync('bun install --production --no-save', {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
})

// Copy node_modules to temp location
console.log('\n📋 Copying production dependencies...')
fs.cpSync(
  path.join(projectRoot, 'node_modules'),
  tempNodeModules,
  { recursive: true }
)

// Restore full node_modules
console.log('\n🔄 Restoring development dependencies...')
execSync('bun install', {
  cwd: projectRoot,
  stdio: 'inherit',
})

// Create package structure
const platforms = [
  { name: 'macos-arm64', binary: 'nikcli-aarch64-apple-darwin' },
  { name: 'macos-x64', binary: 'nikcli-x86_64-apple-darwin' },
  { name: 'linux-x64', binary: 'nikcli-x86_64-linux' },
  { name: 'windows-x64', binary: 'nikcli-x86_64-windows.exe' },
]

for (const platform of platforms) {
  console.log(`\n📦 Packaging ${platform.name}...`)

  const packageDir = path.join(distDir, `nikcli-${platform.name}`)
  const packageBinDir = path.join(packageDir, 'bin')
  const packageLibDir = path.join(packageDir, 'lib')

  // Create package structure
  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true })
  }
  fs.mkdirSync(packageBinDir, { recursive: true })
  fs.mkdirSync(packageLibDir, { recursive: true })

  // Copy binary
  const binarySource = path.join(distDir, platform.binary)
  const binaryDest = path.join(packageBinDir, platform.binary)

  if (fs.existsSync(binarySource)) {
    fs.copyFileSync(binarySource, binaryDest)
    fs.chmodSync(binaryDest, 0o755)
    console.log(`  ✓ Binary: ${platform.binary}`)
  } else {
    console.log(`  ⚠️  Binary not found: ${platform.binary} - skipping`)
    continue
  }

  // Copy node_modules
  fs.cpSync(tempNodeModules, path.join(packageLibDir, 'node_modules'), {
    recursive: true,
  })
  console.log('  ✓ Dependencies copied')

  // Create wrapper script
  const isWindows = platform.name.includes('windows')
  const wrapperScript = isWindows
    ? createWindowsWrapper(platform.binary)
    : createUnixWrapper(platform.binary)

  const wrapperPath = path.join(packageBinDir, isWindows ? 'nikcli.bat' : 'nikcli')
  fs.writeFileSync(wrapperPath, wrapperScript)
  if (!isWindows) {
    fs.chmodSync(wrapperPath, 0o755)
  }
  console.log('  ✓ Wrapper script created')

  // Create tar.gz (except for Windows)
  if (!isWindows) {
    console.log('  🗜️  Creating archive...')
    execSync(
      `tar -czf nikcli-${platform.name}.tar.gz -C ${distDir} nikcli-${platform.name}`,
      {
        cwd: distDir,
        stdio: 'inherit',
      }
    )
    console.log(`  ✓ Archive: nikcli-${platform.name}.tar.gz`)
  } else {
    console.log('  🗜️  Creating zip...')
    execSync(
      `zip -r nikcli-${platform.name}.zip nikcli-${platform.name}`,
      {
        cwd: distDir,
        stdio: 'inherit',
      }
    )
    console.log(`  ✓ Archive: nikcli-${platform.name}.zip`)
  }
}

// Cleanup
console.log('\n🧹 Cleaning up...')
fs.rmSync(tempNodeModules, { recursive: true, force: true })

console.log('\n✅ Standalone packages created successfully!\n')
console.log('📍 Location:', distDir)
console.log('\nPackages:')
for (const platform of platforms) {
  const ext = platform.name.includes('windows') ? 'zip' : 'tar.gz'
  console.log(`  - nikcli-${platform.name}.${ext}`)
}

function createUnixWrapper(binaryName) {
  return `#!/bin/bash
# NikCLI Launcher Script
# Sets up NODE_PATH to find bundled dependencies

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

export NODE_PATH="$LIB_DIR/node_modules:\${NODE_PATH}"

exec "$SCRIPT_DIR/${binaryName}" "$@"
`
}

function createWindowsWrapper(binaryName) {
  return `@echo off
REM NikCLI Launcher Script
REM Sets up NODE_PATH to find bundled dependencies

set SCRIPT_DIR=%~dp0
set LIB_DIR=%SCRIPT_DIR%..\\lib

set NODE_PATH=%LIB_DIR%\\node_modules;%NODE_PATH%

"%SCRIPT_DIR%\\${binaryName}" %*
`
}
