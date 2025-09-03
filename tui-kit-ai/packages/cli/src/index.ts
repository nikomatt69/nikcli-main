import { Command } from 'commander';

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
    console.log('Generate invoked with options', opts);
  });

program.parse();
