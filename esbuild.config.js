const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');
const { rmSync, mkdirSync } = require('fs');
const path = require('path');

// Clean dist directory
try {
    rmSync('./dist', { recursive: true, force: true });
} catch (e) {
    // Directory doesn't exist, that's fine
}
mkdirSync('./dist', { recursive: true });

// Main CLI build configuration
const cliBuild = esbuild.build({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'dist/cli/index.js',
    external: [
        // External dependencies that should not be bundled
        '@ai-sdk/anthropic',
        '@ai-sdk/gateway',
        '@ai-sdk/google',
        '@ai-sdk/openai',
        '@ai-sdk/vercel',
        '@chroma-core/default-embed',
        '@supabase/supabase-js',
        '@upstash/redis',
        'ai',
        'blessed',
        'boxen',
        'chalk',
        'chokidar',
        'chromadb',
        'cli-highlight',
        'cli-progress',
        'commander',
        'conf',
        'cors',
        'diff',
        'dotenv',
        'express',
        'express-rate-limit',
        'globby',
        'gradient-string',
        'helmet',
        'highlight.js',
        'ink',
        'ink-box',
        'ink-divider',
        'ink-select-input',
        'ink-spinner',
        'ink-table',
        'ink-text-input',
        'inquirer',
        'ioredis',
        'js-yaml',
        'jsonwebtoken',
        'keytar',
        'marked',
        'marked-terminal',
        'nanoid',
        'next',
        'ollama-ai-provider',
        'ora',
        'prismjs',
        'react',
        'react-dom',
        'readline',
        'strip-ansi',
        'uuid',
        'vscode-jsonrpc',
        'ws',
        'zod',
        'zustand'
    ],
    sourcemap: false,
    minify: false, // Keep readable for debugging
    treeShaking: true,
    metafile: true,
    define: {
        'process.env.NODE_ENV': '"production"'
    },
    plugins: [
        // Copy necessary files to dist
        copy({
            assets: [
                {
                    from: ['./src/cli/prompts/**/*'],
                    to: ['./dist/cli/prompts']
                },
                {
                    from: ['./src/cli/schemas/**/*'],
                    to: ['./dist/cli/schemas']
                },
                {
                    from: ['./src/cli/config/**/*'],
                    to: ['./dist/cli/config']
                },
                {
                    from: ['./src/cli/guidance/**/*'],
                    to: ['./dist/cli/guidance']
                },
                {
                    from: ['./src/cli/policies/**/*'],
                    to: ['./dist/cli/policies']
                }
            ]
        })
    ]
});

// Build function
async function build() {
    try {
        console.log('🔨 Building NikCLI with esbuild...');

        const result = await cliBuild;

        console.log('✅ Build completed successfully!');
        console.log(`📦 Output: dist/cli/index.js`);
        console.log(`📊 Bundle size: ${(result.metafile ? 'Calculated' : 'Unknown')}`);

        // Make the CLI executable
        const fs = require('fs');
        const cliPath = path.join(__dirname, 'dist/cli/index.js');
        fs.chmodSync(cliPath, '755');

        console.log('🔧 Made CLI executable');

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

// Run build if this file is executed directly
if (require.main === module) {
    build();
}

module.exports = { build, cliBuild };
