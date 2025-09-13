const esbuild = require('esbuild')
const { readFileSync } = require('node:fs')

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

const external = [...Object.keys(packageJson.dependencies || {}), ...Object.keys(packageJson.devDependencies || {})]

esbuild
  .build({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'dist/cli/index.js',
    format: 'cjs',
    external,
  })
  .catch(() => process.exit(1))
