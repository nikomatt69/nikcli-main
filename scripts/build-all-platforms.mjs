#!/usr/bin/env bun

/**
 * Build All Platforms
 * Builds binaries with embedded secrets for all platforms
 */

import fs from 'fs'
import path from 'path'
import { getExternalArgs } from './external-deps.mjs'

const projectRoot = path.join(import.meta.dir, '..')
const distDir = path.join(projectRoot, 'public', 'bin')

console.log('🔨 Building NikCLI for all platforms\n')

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// First run build-with-secrets to generate embedded secrets
console.log('🔐 Generating embedded secrets...')
const secretsBuild = Bun.spawn(['bun', 'scripts/build-with-secrets.mjs'], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})
await secretsBuild.exited

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
    const proc = Bun.spawn(buildArgs, {
      cwd: projectRoot,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`Build exited with code ${exitCode}`)
    }
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
