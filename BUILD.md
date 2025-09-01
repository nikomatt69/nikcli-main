# NikCLI Build System

This document describes the esbuild-based build system for NikCLI.

## Overview

NikCLI uses esbuild for fast, efficient builds with the following features:

- **Fast compilation**: esbuild is significantly faster than TypeScript compiler
- **Bundle optimization**: Tree shaking and dead code elimination
- **Path aliases**: Support for TypeScript path mapping
- **Multiple build modes**: Development and production configurations
- **Watch mode**: Automatic rebuilds during development

## Build Commands

### Basic Build Commands

```bash
# Development build (default)
npm run build:esbuild

# Development build with sourcemaps
npm run build:esbuild:dev

# Production build (minified)
npm run build:esbuild:prod

# Watch mode for development
npm run build:esbuild:watch
```

### Direct esbuild Usage

```bash
# Run the esbuild config directly
node esbuild.config.js

# Specify build mode
node esbuild.config.js dev
node esbuild.config.js prod

# Watch mode
node esbuild.config.js dev --watch
```

## Configuration

The build configuration is defined in `esbuild.config.js` with the following key features:

### Path Aliases

Matches the TypeScript configuration in `tsconfig.cli.json`:

```javascript
const alias = {
  '@': path.resolve(__dirname, './src'),
  '@cli': path.resolve(__dirname, './src/cli'),
  '@agents': path.resolve(__dirname, './src/cli/automation/agents'),
  '@core': path.resolve(__dirname, './src/cli/core'),
  '@utils': path.resolve(__dirname, './src/cli/utils'),
  '@tools': path.resolve(__dirname, './src/cli/tools'),
  '@ai': path.resolve(__dirname, './src/cli/ai'),
};
```

### External Dependencies

All dependencies from `package.json` are marked as external to avoid bundling:

```javascript
const external = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];
```

### Build Modes

#### Development Mode
- Source maps enabled
- No minification
- Watch mode support
- Optimized for debugging

#### Production Mode
- No source maps
- Minified output
- Tree shaking enabled
- Optimized for performance

## Output

The build produces a single bundled file at `dist/cli/index.js` with:

- Shebang (`#!/usr/bin/env node`) for CLI execution
- All TypeScript compiled to JavaScript
- Path aliases resolved
- External dependencies excluded
- Optimized bundle size

## Build Analysis

When building, esbuild generates a metafile that can be analyzed:

```bash
# Build with analysis
npm run build:esbuild:prod

# The build output includes bundle analysis showing:
# - Bundle size
# - Import dependencies
# - Tree shaking results
```

## Integration with Existing Workflow

The esbuild build system integrates with the existing development workflow:

- **Development**: Use `npm start` for ts-node development
- **Testing**: Use `npm test` for running tests
- **Production**: Use `npm run build:esbuild:prod` for optimized builds
- **Publishing**: `prepublishOnly` script uses esbuild production build

## Troubleshooting

### Common Issues

1. **Path alias resolution**: Ensure all aliases in `tsconfig.cli.json` are also defined in `esbuild.config.js`
2. **External dependencies**: If a dependency should be bundled, remove it from the `external` array
3. **TypeScript errors**: Run `npm run lint` to check for TypeScript issues before building

### Performance Tips

- Use watch mode during development: `npm run build:esbuild:watch`
- Production builds are automatically minified and optimized
- The build system includes tree shaking to eliminate unused code

## Migration from TypeScript Compiler

The esbuild build system replaces the TypeScript compiler (`tsc`) for production builds:

- **Before**: `npm run build` (uses tsc)
- **After**: `npm run build:esbuild:prod` (uses esbuild)

The TypeScript compiler is still used for:
- Type checking during development
- IDE support
- Test compilation

## File Structure

```
├── esbuild.config.js      # Main build configuration
├── esbuild.config.d.ts    # TypeScript declarations
├── package.json           # Build scripts
├── tsconfig.cli.json      # TypeScript configuration
└── dist/
    └── cli/
        └── index.js       # Built output
```
