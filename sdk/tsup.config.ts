import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    commands: 'src/commands.ts',
    tools: 'src/tools.ts',
    agents: 'src/agents.ts',
    services: 'src/services.ts',
    ai: 'src/ai.ts',
    browser: 'src/browser.ts',
    vm: 'src/vm.ts',
    web3: 'src/web3.ts',
    types: 'src/types.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
  external: [],
});
