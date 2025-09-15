import { EventEmitter } from 'node:events'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface SessionTodo {
  id: string
  content: string
  status: TodoStatus
  priority: TodoPriority
  progress?: number
}

class TodoStore extends EventEmitter {
  private todosBySession: Map<string, SessionTodo[]> = new Map()

  getTodos(sessionId: string): SessionTodo[] {
    return this.todosBySession.get(sessionId) || []
  }

  setTodos(sessionId: string, todos: SessionTodo[]): void {
    this.todosBySession.set(sessionId, todos)
    this.emit('update', { sessionId, todos })
  }

  updateTodo(sessionId: string, todo: Partial<SessionTodo> & { id: string }): void {
    const list = this.getTodos(sessionId)
    const idx = list.findIndex((t) => t.id === todo.id)
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...todo }
      this.setTodos(sessionId, [...list])
    }
  }
}

export const todoStore = new TodoStore()
