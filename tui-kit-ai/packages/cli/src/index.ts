import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { TEMPLATE } from './templates/ai-app';

const program = new Command();

program
  .name('tui-kit-ai')
  .description('CLI for TUI-Kit-AI')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate components, agents, or CLI templates')
  .option('--type <type>', 'Type to generate: component|agent|cli')
  .option('--name <name>', 'Name')
  .action((opts) => {
    if (opts.type === 'cli') {
      const targetDir = path.resolve(process.cwd(), opts.name || 'ai-cli-app');
      fs.mkdirSync(targetDir, { recursive: true });
      const srcDir = path.join(targetDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'index.ts'), TEMPLATE, 'utf8');
      fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({ name: opts.name || 'ai-cli-app', private: true, scripts: { dev: 'tsx src/index.ts' }, dependencies: { '@tui-kit-ai/core': '*', '@tui-kit-ai/ai': '*', blessed: '^0.1.81', tsx: '^4.17.0' } }, null, 2));
      console.log('Created AI CLI at', targetDir);
      return;
    }
    console.log('Generate invoked with options', opts);
  });

program.parse();
