import { BaseAgent, AgentConfig } from '../base/BaseAgent';

export type Todo = { id: string; title: string; completed?: boolean };

export class TodoAgent extends BaseAgent {
  private todos: Todo[] = [];

  constructor(config: AgentConfig) {
    super(config);
  }

  async start() {}

  async addTask(task: { type: 'create'; data: { title: string } }) {
    const todo: Todo = { id: Math.random().toString(36).slice(2), title: task.data.title };
    this.todos.push(todo);
    return todo;
  }
}
