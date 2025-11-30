#!/usr/bin/env node

/**
 * Build All Platforms
 * Builds binaries with embedded secrets for all platforms
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getExternalArgs } from './external-deps.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const distDir = path.join(projectRoot, 'public', 'bin')

console.log('🔨 Building NikCLI for all platforms\n')

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// First run build-with-secrets to generate embedded secrets
console.log('🔐 Generating embedded secrets...')
execSync('bun scripts/build-with-secrets.mjs', {
  cwd: projectRoot,
  stdio: 'inherit',
})

// Get external args
const externalArgs = getExternalArgs()

const platforms = [
  {
    name: 'macOS ARM64',
    target: 'bun-darwin-arm64',
    outfile: 'nikcli-aarch64-apple-darwin',
  },
  {
    name: 'macOS x64',
    target: 'bun-darwin-x64',
    outfile: 'nikcli-x86_64-apple-darwin',
  },
  {
    name: 'Linux x64',
    target: 'bun-linux-x64',
    outfile: 'nikcli-x86_64-linux',
  },
  {
    name: 'Windows x64',
    target: 'bun-windows-x64',
    outfile: 'nikcli-x86_64-windows.exe',
  },
]

console.log('\n🚀 Building platform binaries...\n')

for (const platform of platforms) {
  console.log(`📦 Building ${platform.name}...`)

  const buildArgs = [
    'bun',
    'build',
    '--compile',
    '--minify',
    '--sourcemap',
    '--packages=external',
    `--target=${platform.target}`,
    ...externalArgs,
    'src/cli/index.ts',
    `--outfile=${path.join(distDir, platform.outfile)}`,
  ]

  try {
    execSync(buildArgs.join(' '), {
      cwd: projectRoot,
      stdio: 'inherit',
    })
    console.log(`✅ ${platform.name} built successfully\n`)
  } catch (error) {
    console.error(`❌ Failed to build ${platform.name}`)
    console.error(error.message)
    process.exit(1)
  }
}

console.log('✅ All platforms built successfully!\n')
console.log('📍 Binaries location:', distDir)
console.log('\nNext steps:')
console.log('  1. Test binaries: ./public/bin/nikcli-*')
console.log('  2. Package for distribution: bun run package:standalone')
