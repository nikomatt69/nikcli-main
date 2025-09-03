export const TEMPLATE = `import { useTerminal, Box } from '@tui-kit-ai/core';
import { AIService, MessageHistory, StreamingText, ToolOutput, ToolSelector } from '@tui-kit-ai/ai';

const { screen } = useTerminal();
const root = new Box({ parent: screen, label: 'AI CLI', borderStyle: 'line' });

const history = new MessageHistory({ parent: root.el });
const stream = new StreamingText({ parent: root.el, prefix: 'AI: ' });
const tools = new ToolSelector({ parent: root.el, tools: [{ name: 'search' }, { name: 'run' }] });
const output = new ToolOutput({ parent: root.el, title: 'Output' });

const ai = new AIService({ provider: 'openai', model: 'gpt-4', apiKey: process.env.OPENAI_API_KEY });

async function ask(prompt: string) {
  history.render([{ role: 'user', content: prompt }]);
  const res = await ai.streamCompletion([{ role: 'user', content: prompt }]);
  for await (const ch of res.textStream) stream.append(ch);
}

ask('Hello!');
screen.render();`;
