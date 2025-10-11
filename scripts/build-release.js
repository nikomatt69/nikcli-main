#!/usr/bin/env bun

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🚀 Building NikCLI release binaries...\n')

// Assicurati che la build TypeScript sia completata
console.log('📦 Building TypeScript...')
execSync('npm run build', { stdio: 'inherit' })

// Crea la directory releases se non esiste
const releasesDir = path.join(__dirname, 'releases')
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true })
}

// Configurazione pkg per diverse piattaforme
const targets = ['node18-linux-x64', 'node18-macos-x64', 'node18-macos-arm64', 'node18-win-x64']

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const version = packageJson.version

console.log(`📋 Building version ${version} for multiple platforms...\n`)

targets.forEach((target) => {
  console.log(`🔨 Building for ${target}...`)

  const outputName = `nikcli-${target.replace('node18-', '').replace('-', '-')}`
  const outputPath = path.join(releasesDir, outputName)

  try {
    execSync(`npx pkg dist/cli/index.js --target ${target} --output ${outputPath}`, {
      stdio: 'inherit',
    })

    // Aggiungi estensione .exe per Windows
    if (target.includes('win')) {
      const exePath = `${outputPath}.exe`
      if (fs.existsSync(outputPath)) {
        fs.renameSync(outputPath, exePath)
        console.log(`✅ Built: ${exePath}`)
      }
    } else {
      console.log(`✅ Built: ${outputPath}`)
    }
  } catch (error) {
    console.error(`❌ Failed to build for ${target}:`, error.message)
  }
})

console.log('\n🎉 Release build completed!')
console.log(`📁 Binaries saved in: ${releasesDir}`)

// Crea archivi gzip tar per ogni piattaforma
console.log('\n🗜️ Creating gzip tar archives...')

// Funzione per copiare file ricorsivamente
const _copyRecursive = (src, dest) => {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    fs.readdirSync(src).forEach((file) => {
      _copyRecursive(path.join(src, file), path.join(dest, file))
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

// File essenziali da includere negli archivi
const essentialFiles = ['README.md', 'README_EN.md', 'README_IT.md', 'LICENSE', 'CHANGELOG.md']

// Crea un archivio completo con tutti i binari
console.log('📦 Creating complete distribution archive...')
const completeArchiveDir = path.join(releasesDir, 'temp-complete')
if (!fs.existsSync(completeArchiveDir)) {
  fs.mkdirSync(completeArchiveDir, { recursive: true })
}

// Copia tutti i binari
const builtFiles = fs.readdirSync(releasesDir).filter((file) => !file.endsWith('.json') && !file.startsWith('temp-'))
builtFiles.forEach((file) => {
  const sourcePath = path.join(releasesDir, file)
  const destPath = path.join(completeArchiveDir, file)
  fs.copyFileSync(sourcePath, destPath)
})

// Copia file essenziali
essentialFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(completeArchiveDir, file))
  }
})

// Crea package.json per la distribuzione completa
const completePackageJson = {
  name: 'nikcli',
  version: version,
  description: 'NikCLI - Context-Aware AI Development Assistant',
  files: [...builtFiles, ...essentialFiles],
  scripts: {
    install: 'echo "Extract and run the appropriate binary for your platform"',
  },
  engines: {
    node: '>=18',
  },
}

fs.writeFileSync(path.join(completeArchiveDir, 'package.json'), JSON.stringify(completePackageJson, null, 2))

// Crea archivio completo
const completeArchiveName = `nikcli-v${version}-complete.tar.gz`
const completeArchivePath = path.join(releasesDir, completeArchiveName)
try {
  execSync(`cd ${completeArchiveDir} && tar -czf ${completeArchivePath} .`, { stdio: 'inherit' })
  console.log(`✅ Complete archive created: ${completeArchiveName}`)
} catch (_error) {
  console.error('❌ Complete archive creation failed!')
}

// Crea archivi per piattaforma singola
console.log('📦 Creating platform-specific archives...')
builtFiles.forEach((file) => {
  const platformName = file.replace(/\.exe$/, '') // Rimuovi estensione .exe
  const platformArchiveDir = path.join(releasesDir, `temp-${platformName}`)

  if (!fs.existsSync(platformArchiveDir)) {
    fs.mkdirSync(platformArchiveDir, { recursive: true })
  }

  // Copia il binario
  const sourcePath = path.join(releasesDir, file)
  const destPath = path.join(platformArchiveDir, file)
  fs.copyFileSync(sourcePath, destPath)

  // Copia file essenziali
  essentialFiles.forEach((essentialFile) => {
    if (fs.existsSync(essentialFile)) {
      fs.copyFileSync(essentialFile, path.join(platformArchiveDir, essentialFile))
    }
  })

  // Crea package.json per la piattaforma
  const platformPackageJson = {
    name: `nikcli-${platformName}`,
    version: version,
    description: `NikCLI - Context-Aware AI Development Assistant (${platformName})`,
    main: file,
    bin: file,
    files: [file, ...essentialFiles],
    scripts: {
      start: `./${file}`,
      install: 'echo "Extract and run the binary"',
    },
    engines: {
      node: '>=18',
    },
  }

  fs.writeFileSync(path.join(platformArchiveDir, 'package.json'), JSON.stringify(platformPackageJson, null, 2))

  // Crea archivio per piattaforma
  const platformArchiveName = `nikcli-v${version}-${platformName}.tar.gz`
  const platformArchivePath = path.join(releasesDir, platformArchiveName)

  try {
    execSync(`cd ${platformArchiveDir} && tar -czf ${platformArchivePath} .`, { stdio: 'inherit' })
    console.log(`✅ Platform archive created: ${platformArchiveName}`)
  } catch (error) {
    console.error(`❌ Failed to create archive for ${platformName}:`, error.message)
  }

  // Pulisci directory temporanea
  fs.rmSync(platformArchiveDir, { recursive: true, force: true })
})

// Pulisci directory temporanea completa
fs.rmSync(completeArchiveDir, { recursive: true, force: true })

// Crea un file di checksum per verificare l'integrità
console.log('\n🔍 Generating checksums...')
const allFiles = fs.readdirSync(releasesDir)
const checksums = {}

allFiles.forEach((file) => {
  const filePath = path.join(releasesDir, file)
  const content = fs.readFileSync(filePath)
  const hash = require('crypto').createHash('sha256').update(content).digest('hex')
  checksums[file] = hash
})

fs.writeFileSync(path.join(releasesDir, 'checksums.json'), JSON.stringify(checksums, null, 2))

console.log('✅ Checksums saved to releases/checksums.json')

// Crea un file di release info
const releaseInfo = {
  version: version,
  buildDate: new Date().toISOString(),
  targets: targets,
  files: allFiles,
  checksums: checksums,
  archives: {
    complete: completeArchiveName,
    platforms: allFiles.filter((f) => f.includes('-complete.tar.gz') === false && f.endsWith('.tar.gz')),
  },
}

fs.writeFileSync(path.join(releasesDir, 'release-info.json'), JSON.stringify(releaseInfo, null, 2))

console.log('✅ Release info saved to releases/release-info.json')
console.log('\n🎯 Ready for GitHub release!')
console.log(`📦 Total archives created: ${allFiles.filter((f) => f.endsWith('.tar.gz')).length}`)
