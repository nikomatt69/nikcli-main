import { useTerminal, Box, Text, Spinner } from '@tui-kit-ai/core';
import { AIService } from '@tui-kit-ai/ai';

const { screen } = useTerminal();
const root = new Box({ parent: screen, top: 0, left: 0, right: 0, bottom: 0, borderStyle: 'line', label: 'Code Assistant' });
new Text({ parent: root.el, top: 1, left: 2, text: 'Analyzing your project...' });
const spinner = new Spinner({ parent: root.el, top: 3, left: 2, });

const ai = new AIService({ provider: 'openai', model: 'gpt-4' });

async function run() {
  const result = await ai.streamCompletion([{ role: 'user', content: 'Analyze this repository' }]);
  for await (const ch of result.textStream) {
    // Here you would stream into a buffer/component
  }
}

run();
screen.render();
