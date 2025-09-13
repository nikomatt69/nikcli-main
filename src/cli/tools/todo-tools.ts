import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { toolService, type ToolCapability } from '../services/tool-service'
import { todoStore, type SessionTodo, type TodoStatus, type TodoPriority } from '../store/todo-store'

function getSessionId(): string {
  try {
    const globalAny = global as any
    const id =
      globalAny.__streamingOrchestrator?.context?.session?.id ||
      globalAny.__nikCLI?.context?.session?.id ||
      globalAny.__unifiedChat?.session?.id ||
      `${Date.now()}`
    return String(id)
  } catch {
    return `${Date.now()}`
  }
}

// Register todoread/todowrite tools in the global tool service
export function registerTodoTools(): void {
  const readTool: ToolCapability = {
    name: 'todoread',
    description:
      'Read the current session todo list. Use this frequently to stay in sync with the plan. No parameters.',
    category: 'analysis',
    handler: async (_args: {}) => {
      const sessionId = getSessionId()
      const todos = todoStore.getTodos(sessionId)
      return {
        title: `${todos.filter((t) => t.status !== 'completed').length} todos`,
        output: JSON.stringify(todos, null, 2),
        metadata: { todos },
      }
    },
  }

  const writeTool: ToolCapability = {
    name: 'todowrite',
    description:
      'Create or update the session todo list. Accepts { todos: [{id, content, status, priority, progress?}] }.',
    category: 'analysis',
    handler: async (args: { todos: Array<Partial<SessionTodo> & { content: string }> }) => {
      const sessionId = getSessionId()
      const raw = Array.isArray(args?.todos) ? args.todos : []
      const norm = raw.map((t) => ({
        id: t.id || nanoid(),
        content: String(t.content || '').trim(),
        status: (t.status || 'pending') as TodoStatus,
        priority: ((t.priority as TodoPriority) || 'medium') as TodoPriority,
        progress: typeof t.progress === 'number' ? Math.max(0, Math.min(100, Math.round(t.progress))) : undefined,
      }))

      todoStore.setTodos(sessionId, norm)

      // Update dashboard panel when list changes
      try {
        const { advancedUI } = await import('../ui/advanced-cli-ui')
        const items = norm.map((t) => ({
          content: t.content,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
        }))
        ;(advancedUI as any).showTodoDashboard?.(items, 'Plan Todos')
      } catch {}

      return {
        title: `${norm.filter((x) => x.status !== 'completed').length} todos`,
        output: JSON.stringify(norm, null, 2),
        metadata: { todos: norm },
      }
    },
  }

  try {
    toolService.registerTool(readTool)
    toolService.registerTool(writeTool)
    console.log(chalk.cyan('📋 Registered todo tools: todoread, todowrite'))
  } catch (e) {
    // ignore duplicate registration errors
  }
}

// Auto-register on import
registerTodoTools()

