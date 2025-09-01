/**
 * Build configuration per Terminal UI Kit
 * Configurazione ESBuild per compilare i componenti React/Ink
 */

const esbuild = require('esbuild');
const path = require('path');

const buildConfig = {
  entryPoints: [
    'src/cli/ui/terminal-ui-kit/index.ts',
    'src/cli/ui/terminal-ui-kit/TerminalUIManager.ts',
    'src/cli/ui/terminal-ui-kit/integration/NikCLIIntegration.ts'
  ],
  bundle: false, // Non bundlare per mantenere la struttura
  outdir: 'dist/cli/ui/terminal-ui-kit',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: [
    'ink',
    'ink-*',
    'react',
    'react-dom',
    'chalk',
    'boxen',
    'ora',
    'cli-progress',
    'inquirer',
    'readline'
  ],
  sourcemap: true,
  minify: false,
  keepNames: true,
  tsconfig: path.join(__dirname, 'tsconfig.json'),
  logLevel: 'info',
};

async function build() {
  try {
    console.log('🔨 Building Terminal UI Kit...');
    
    await esbuild.build(buildConfig);
    
    console.log('✅ Terminal UI Kit build completed successfully!');
    console.log('📁 Output directory: dist/cli/ui/terminal-ui-kit/');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  build();
}

module.exports = { buildConfig, build };