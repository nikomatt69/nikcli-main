import { BaseAgent, AgentConfig, AgentTask, CreateTask, UpdateTask, DeleteTask } from '../base/BaseAgent';

export type Todo = { id: string; title: string; completed?: boolean };

export class TodoAgent extends BaseAgent {
  private todos: Todo[] = [];

  constructor(config: AgentConfig) {
    super(config);
  }

  async start() {
    await super.start();
    console.log(`TodoAgent ${this.name} started`);
  }

  async stop() {
    await super.stop();
    console.log(`TodoAgent ${this.name} stopped`);
  }

  // Type-safe task handling with discriminated unions
  async handleTask(task: AgentTask): Promise<Todo | Todo[] | boolean> {
    switch (task.type) {
      case 'create':
        return this.createTodo(task as CreateTask);
      case 'update':
        return this.updateTodo(task as UpdateTask);
      case 'delete':
        return this.deleteTodo(task as DeleteTask);
      default:
        throw new Error(`Unknown task type: ${(task as any).type}`);
    }
  }

  private async createTodo(task: CreateTask): Promise<Todo> {
    const todo: Todo = { 
      id: Math.random().toString(36).slice(2), 
      title: task.data.title,
      completed: false
    };
    this.todos.push(todo);
    this.emit('todoCreated', todo);
    return todo;
  }

  private async updateTodo(task: UpdateTask): Promise<Todo | boolean> {
    const todo = this.todos.find(t => t.id === task.data.id);
    if (todo) {
      Object.assign(todo, task.data.patch);
      this.emit('todoUpdated', todo);
      return todo;
    }
    return false;
  }

  private async deleteTodo(task: DeleteTask): Promise<boolean> {
    const index = this.todos.findIndex(t => t.id === task.data.id);
    if (index >= 0) {
      const todo = this.todos.splice(index, 1)[0];
      this.emit('todoDeleted', todo);
      return true;
    }
    return false;
  }

  // Public API methods
  async addTask(title: string): Promise<Todo> {
    return this.handleTask({ type: 'create', data: { title } }) as Promise<Todo>;
  }

  async completeTask(id: string): Promise<Todo | boolean> {
    const result = await this.handleTask({ type: 'update', data: { id, patch: { completed: true } } });
    return typeof result === 'boolean' ? result : result as Todo;
  }

  async removeTask(id: string): Promise<boolean> {
    const result = await this.handleTask({ type: 'delete', data: { id } });
    return typeof result === 'boolean' ? result : false;
  }

  getAllTodos(): Todo[] {
    return [...this.todos];
  }

  getCompletedTodos(): Todo[] {
    return this.todos.filter(todo => todo.completed);
  }

  getPendingTodos(): Todo[] {
    return this.todos.filter(todo => !todo.completed);
  }
}


