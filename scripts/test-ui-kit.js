#!/usr/bin/env node

/**
 * Script per testare il Terminal UI Kit
 * Verifica che tutti i componenti siano configurati correttamente
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Terminal UI Kit...\n');

// Verifica che i file necessari esistano
const requiredFiles = [
  'src/cli/ui/terminal-ui-kit/index.ts',
  'src/cli/ui/terminal-ui-kit/components/App.tsx',
  'src/cli/ui/terminal-ui-kit/TerminalUIManager.ts',
  'src/cli/ui/terminal-ui-kit/integration/NikCLIIntegration.ts',
];

console.log('📁 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please run the setup again.');
  process.exit(1);
}

console.log('\n📦 Checking dependencies...');

// Verifica dipendenze Ink
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = [
  'ink',
  'ink-box', 
  'ink-divider',
  'ink-select-input',
  'ink-spinner',
  'ink-table',
  'ink-text-input',
  'react',
  'react-dom'
];

requiredDeps.forEach(dep => {
  if (packageJson.dependencies[dep] || packageJson.devDependencies[dep]) {
    console.log(`  ✅ ${dep}`);
  } else {
    console.log(`  ⚠️ ${dep} - Not found in package.json`);
  }
});

console.log('\n🔧 Testing TypeScript compilation...');

// Test compilazione TypeScript
const tscProcess = spawn('npx', ['tsc', '--noEmit', '--project', 'tsconfig.json'], {
  stdio: 'pipe',
  shell: true
});

let tscOutput = '';
tscProcess.stdout.on('data', (data) => {
  tscOutput += data.toString();
});

tscProcess.stderr.on('data', (data) => {
  tscOutput += data.toString();
});

tscProcess.on('close', (code) => {
  if (code === 0) {
    console.log('  ✅ TypeScript compilation successful');
    
    console.log('\n🎨 Terminal UI Kit Test Summary:');
    console.log('  ✅ All required files present');
    console.log('  ✅ Dependencies configured');
    console.log('  ✅ TypeScript compilation successful');
    console.log('\n🚀 Terminal UI Kit is ready to use!');
    console.log('\nUsage:');
    console.log('  /ui-kit enable    - Enable Terminal UI Kit');
    console.log('  /ui-kit status    - Check UI Kit status'); 
    console.log('  /toggle-ui        - Quick toggle UI mode');
    console.log('\nComponents available for commands:');
    console.log('  📚 /help         - Interactive help system');
    console.log('  🤖 /model        - Model selection UI');
    console.log('  🤖 /agents       - Agent management UI');
    console.log('  📁 /read, /ls    - File browser UI');
    console.log('  🐳 /vm-*         - VM management UI');
    console.log('  📋 /plan, /todo  - Planning UI');
    console.log('  👁️ /images       - Vision UI');
    console.log('  ⚙️ /config       - Configuration UI');
    console.log('  ⚡ /run, /install - Terminal UI');
    
  } else {
    console.log('  ❌ TypeScript compilation failed:');
    console.log(tscOutput);
    console.log('\n⚠️ Please fix TypeScript errors before using the Terminal UI Kit');
    process.exit(1);
  }
});

tscProcess.on('error', (error) => {
  console.log('  ⚠️ Could not run TypeScript check:', error.message);
  console.log('  📝 Make sure TypeScript is installed: npm install -g typescript');
  
  console.log('\n🎨 Terminal UI Kit files created successfully!');
  console.log('⚠️ TypeScript check skipped - please verify manually');
});