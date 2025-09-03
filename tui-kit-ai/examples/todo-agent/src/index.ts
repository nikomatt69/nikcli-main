import { useTerminal, Box, Text, TextInput } from '@tui-kit-ai/core';
import { ChatContainer, AIService } from '@tui-kit-ai/ai';
import { AgentManager, TodoAgent } from '@tui-kit-ai/agents';

const { screen } = useTerminal();

const container = new Box({ parent: screen, top: 0, left: 0, right: 0, bottom: 0, borderStyle: 'line', label: 'Todo Agent' });
new Text({ parent: container.el, top: 1, left: 2, text: 'Welcome to TUI-Kit-AI Todo Agent' });

const chat = new ChatContainer({ parent: container.el, messages: [], onMessageSubmit: async (content) => {
  await ai.streamCompletion([{ role: 'user', content }]);
}});

const input = new TextInput({ parent: container.el, bottom: 1, left: 2, width: '50%', label: 'New Todo', placeholder: 'Type a task and press Enter', onSubmit: async (value) => {
  await todoAgent.addTask({ type: 'create', data: { title: value } });
}});

const ai = new AIService({ provider: 'openai', model: 'gpt-4' });
const manager = new AgentManager();
const todoAgent = new TodoAgent({ name: 'todo-agent', description: 'Manages development tasks' });
manager.registerAgent(todoAgent);
manager.startAllAgents();

screen.render();
