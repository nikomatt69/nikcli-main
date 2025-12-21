/**
 * Todo Panel
 * Displays and manages todo items in a TUI panel
 */

import { PanelElement, PanelElementConfig } from '../specialized/PanelElement'
import { eventBus } from '../../core/EventBus'

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  priority?: 'low' | 'medium' | 'high'
  tags?: string[]
  createdAt: number
  completedAt?: number
}

export interface TodoPanelConfig extends PanelElementConfig {
  panelType: 'todo-panel'
  todos?: TodoItem[]
  filter?: 'all' | 'active' | 'completed'
  sortBy?: 'created' | 'priority' | 'text'
}

export class TodoPanel extends PanelElement {
  private todos: TodoItem[] = []
  private filter: TodoPanelConfig['filter'] = 'all'
  private sortBy: TodoPanelConfig['sortBy'] = 'created'

  constructor(config: TodoPanelConfig, eventBus: any, theme: any) {
    super({ ...config, type: 'panel' }, eventBus, theme)

    this.todos = config.todos || []
    this.filter = config.filter || 'all'
    this.sortBy = config.sortBy || 'created'
  }

  protected onMount(): void {
    super.onMount()

    // Listen to todo events
    eventBus.on('todo:add', (todo: TodoItem) => {
      this.addTodo(todo)
    })

    eventBus.on('todo:update', (data: { id: string; updates: Partial<TodoItem> }) => {
      this.updateTodo(data.id, data.updates)
    })

    eventBus.on('todo:remove', (id: string) => {
      this.removeTodo(id)
    })

    eventBus.on('todo:toggle', (id: string) => {
      this.toggleTodo(id)
    })

    eventBus.on('todo:clear', () => {
      this.clearTodos()
    })

    // Initial render
    this.renderTodos()
  }

  /**
   * Add new todo
   */
  addTodo(todo: TodoItem): void {
    this.todos.push(todo)
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'add', todo })
  }

  /**
   * Update todo
   */
  updateTodo(id: string, updates: Partial<TodoItem>): void {
    const index = this.todos.findIndex(t => t.id === id)
    if (index === -1) return

    this.todos[index] = { ...this.todos[index], ...updates }
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'update', todo: this.todos[index] })
  }

  /**
   * Remove todo
   */
  removeTodo(id: string): void {
    const index = this.todos.findIndex(t => t.id === id)
    if (index === -1) return

    const removed = this.todos.splice(index, 1)[0]
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'remove', todo: removed })
  }

  /**
   * Toggle todo completion
   */
  toggleTodo(id: string): void {
    const todo = this.todos.find(t => t.id === id)
    if (!todo) return

    todo.completed = !todo.completed
    todo.completedAt = todo.completed ? Date.now() : undefined
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'toggle', todo })
  }

  /**
   * Clear all todos
   */
  clearTodos(): void {
    this.todos = []
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'clear' })
  }

  /**
   * Clear completed todos
   */
  clearCompleted(): void {
    const completedTodos = this.todos.filter(t => t.completed)
    this.todos = this.todos.filter(t => !t.completed)
    this.renderTodos()
    eventBus.emit('todo:changed', { type: 'clear-completed', todos: completedTodos })
  }

  /**
   * Set filter
   */
  setFilter(filter: TodoPanelConfig['filter']): void {
    this.filter = filter
    this.renderTodos()
  }

  /**
   * Set sort
   */
  setSort(sortBy: TodoPanelConfig['sortBy']): void {
    this.sortBy = sortBy
    this.renderTodos()
  }

  /**
   * Get filtered and sorted todos
   */
  private getFilteredAndSortedTodos(): TodoItem[] {
    let filtered = [...this.todos]

    // Apply filter
    if (this.filter === 'active') {
      filtered = filtered.filter(t => !t.completed)
    } else if (this.filter === 'completed') {
      filtered = filtered.filter(t => t.completed)
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 }
          return priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium']

        case 'text':
          return a.text.localeCompare(b.text)

        case 'created':
        default:
          return a.createdAt - b.createdAt
      }
    })

    return filtered
  }

  /**
   * Render todos
   */
  renderTodos(): void {
    const todos = this.getFilteredAndSortedTodos()
    super.renderTodos(todos)
  }

  /**
   * Get todo stats
   */
  getStats(): { total: number; active: number; completed: number; high: number } {
    return {
      total: this.todos.length,
      active: this.todos.filter(t => !t.completed).length,
      completed: this.todos.filter(t => t.completed).length,
      high: this.todos.filter(t => t.priority === 'high' && !t.completed).length
    }
  }

  protected onInput(key: string): boolean {
    switch (key) {
      case 'n':
        // Add new todo
        eventBus.emit('tui:panel:action', {
          panelId: (this.config as TodoPanelConfig).panelId,
          action: 'add-todo'
        })
        return true

      case 'x':
        // Toggle selected todo (requires selection implementation)
        eventBus.emit('tui:panel:action', {
          panelId: (this.config as TodoPanelConfig).panelId,
          action: 'toggle-selected'
        })
        return true

      case 'd':
        // Delete selected todo
        eventBus.emit('tui:panel:action', {
          panelId: (this.config as TodoPanelConfig).panelId,
          action: 'delete-selected'
        })
        return true

      case 'f':
        // Cycle through filters
        const filters: Array<TodoPanelConfig['filter']> = ['all', 'active', 'completed']
        const currentIndex = filters.indexOf(this.filter)
        const nextIndex = (currentIndex + 1) % filters.length
        this.setFilter(filters[nextIndex])
        return true

      case 's':
        // Cycle through sort options
        const sorts: Array<TodoPanelConfig['sortBy']> = ['created', 'priority', 'text']
        const sortIndex = sorts.indexOf(this.sortBy)
        const nextSortIndex = (sortIndex + 1) % sorts.length
        this.setSort(sorts[nextSortIndex])
        return true

      case 'c':
        // Clear completed
        this.clearCompleted()
        return true
    }

    return super.onInput(key)
  }

  protected onUpdate(data: any): void {
    if (data.type === 'todos') {
      this.todos = data.todos || []
      this.renderTodos()
    } else if (data.type === 'filter') {
      this.setFilter(data.filter)
    } else if (data.type === 'sort') {
      this.setSort(data.sortBy)
    } else {
      super.onUpdate(data)
    }
  }
}
