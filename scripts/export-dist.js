#!/usr/bin/env node

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

console.log('🚀 Starting NikCLI distribution export...')

// Configuration
const DIST_DIR = 'dist'
const EXPORT_DIR = 'export'
const CLI_NAME = 'nikcli'

// Clean and create export directory
if (fs.existsSync(EXPORT_DIR)) {
  fs.rmSync(EXPORT_DIR, { recursive: true, force: true })
}
fs.mkdirSync(EXPORT_DIR, { recursive: true })

// Step 1: Build with Bun
console.log('📦 Building with Bun...')
try {
  execSync('bun run build', { stdio: 'inherit' })
  console.log('✅ Build completed successfully!')
} catch (_error) {
  console.error('❌ Build failed!')
  process.exit(1)
}

// Step 2: Copy distribution files
console.log('📁 Copying distribution files...')
const copyRecursive = (src, dest) => {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    fs.readdirSync(src).forEach((file) => {
      copyRecursive(path.join(src, file), path.join(dest, file))
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

// Copy CLI distribution
copyRecursive(DIST_DIR, path.join(EXPORT_DIR, DIST_DIR))

// Copy essential files
const essentialFiles = ['README.md', 'README_EN.md', 'README_IT.md', 'LICENSE', 'CHANGELOG.md', 'bunfig.toml']

essentialFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(EXPORT_DIR, file))
  }
})

// Step 3: Create binary with pkg
console.log('🔧 Creating binary with pkg...')
try {
  execSync('npx pkg .', { stdio: 'inherit' })
  console.log('✅ Binary creation completed!')
} catch (_error) {
  console.error('❌ Binary creation failed!')
  process.exit(1)
}

// Step 4: Copy binaries to export
console.log('📦 Copying binaries...')
if (fs.existsSync('build')) {
  copyRecursive('build', path.join(EXPORT_DIR, 'build'))
}

// Step 5: Create installation script
console.log('📝 Creating installation script...')
const installScript = `#!/bin/bash
echo "🚀 Installing NikCLI..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "📦 Please install Node.js >= 18 from https://nodejs.org/"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the CLI
echo "🔨 Building NikCLI..."
npm run build

# Make CLI executable
chmod +x dist/cli/index.js

echo "✅ NikCLI installed successfully!"
echo "🎯 Run with: npm start"
`

fs.writeFileSync(path.join(EXPORT_DIR, 'install.sh'), installScript)
fs.chmodSync(path.join(EXPORT_DIR, 'install.sh'), '755')

// Step 6: Create package for distribution
console.log('📦 Creating distribution package...')
const packageJson = require('../package.json')

// Create distribution package.json
const distPackageJson = {
  name: CLI_NAME,
  version: packageJson.version,
  description: 'NikCLI - Context-Aware AI Development Assistant',
  main: 'dist/cli/index.js',
  bin: 'dist/cli/index.js',
  files: ['dist/**', 'build/**', 'README.md', 'install.sh', 'bunfig.toml'],
  scripts: {
    start: 'node dist/cli/index.js',
    build: 'echo "Pre-built distribution"',
    install: 'chmod +x install.sh && ./install.sh',
  },
  engines: {
    node: '>=18',
  },
}

fs.writeFileSync(path.join(EXPORT_DIR, 'package.json'), JSON.stringify(distPackageJson, null, 2))

// Step 7: Create archive
console.log('🗜️ Creating distribution archive...')
try {
  execSync(`cd ${EXPORT_DIR} && tar -czf ../${CLI_NAME}-dist.tar.gz .`, { stdio: 'inherit' })
  console.log('✅ Archive created successfully!')
} catch (_error) {
  console.error('❌ Archive creation failed!')
}

console.log('🎉 Distribution export completed!')
console.log(`📁 Export directory: ${EXPORT_DIR}`)
console.log(`📦 Archive: ${CLI_NAME}-dist.tar.gz`)
console.log('🚀 Ready for distribution!')
