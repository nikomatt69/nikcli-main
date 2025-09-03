#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const type = arg('--type');
const name = arg('--name');

if (!type || !name) {
  console.error('Usage: generate --type <component|agent|cli> --name <Name>');
  process.exit(1);
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

if (type === 'component') {
  const target = path.join(__dirname, '..', 'packages', 'core', 'src', 'components', `${name}.ts`);
  ensureDir(path.dirname(target));
  const content = `import { Widgets } from 'blessed';\nimport { BaseProps, Component, createBoxBase } from '../components/BaseComponent';\n\nexport type ${name}Props = BaseProps & {};\n\nexport class ${name} implements Component<Widgets.BoxElement> {\n  el: Widgets.BoxElement;\n  theme: any;\n  destroy: () => void;\n  constructor(props: ${name}Props) {\n    const comp = createBoxBase<Widgets.BoxElement>({ ...props });\n    this.el = comp.el;\n    this.theme = comp.theme;\n    this.destroy = comp.destroy;\n  }\n}\n`;
  fs.writeFileSync(target, content, 'utf8');
  console.log('Component created:', target);
} else if (type === 'agent') {
  const dir = path.join(__dirname, '..', 'packages', 'agents', 'src', name);
  ensureDir(dir);
  const target = path.join(dir, `${name}.ts`);
  const content = `import { BaseAgent, AgentConfig } from '../base/BaseAgent';\n\nexport class ${name} extends BaseAgent {\n  constructor(config: AgentConfig) { super(config); }\n  async start() {}\n}\n`;
  fs.writeFileSync(target, content, 'utf8');
  console.log('Agent created:', target);
} else if (type === 'cli') {
  const dir = path.join(__dirname, '..', 'packages', 'cli', 'src', name);
  ensureDir(dir);
  const target = path.join(dir, 'index.ts');
  const content = `export function run() {\n  console.log('Hello from ${name} CLI');\n}\n`;
  fs.writeFileSync(target, content, 'utf8');
  console.log('CLI template created:', target);
} else {
  console.error('Unknown type:', type);
  process.exit(1);
}
