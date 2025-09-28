import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { createTaskMasterAdapter } from '../adapters/taskmaster-adapter'
import { taskMasterService } from '../services/taskmaster-service'
import { type ToolCapability, toolService } from '../services/tool-service'
import { type SessionTodo, type TodoPriority, type TodoStatus, todoStore } from '../store/todo-store'

// Initialize TaskMaster adapter
const taskMasterAdapter = createTaskMasterAdapter(taskMasterService)

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

/**
 * Check if TaskMaster is available for enhanced todo features
 */
function isTaskMasterAvailable(): boolean {
  return taskMasterAdapter.isTaskMasterAvailable()
}

// Register todoread/todowrite tools in the global tool service
export function registerTodoTools(): void {
  const readTool: ToolCapability = {
    name: 'todoread',
    description:
      'Read the current session todo list with TaskMaster AI enhancements. Use this frequently to stay in sync with the plan. No parameters.',
    category: 'analysis',
    handler: async (_args: {}) => {
      const sessionId = getSessionId()
      const todos = todoStore.getTodos(sessionId)

      // Try to get TaskMaster enhanced context
      let enhancedOutput = JSON.stringify(todos, null, 2)
      let metadata: any = { todos }

      if (isTaskMasterAvailable()) {
        try {
          // Get TaskMaster plan status for enhanced context
          const activePlans = taskMasterService.listPlans()
          const currentPlan = activePlans.find((plan) => plan.status === 'running' || plan.status === 'pending')

          if (currentPlan) {
            const planStatus = await taskMasterService.getPlanStatus(currentPlan.id)
            metadata = {
              todos,
              taskMasterPlan: {
                id: currentPlan.id,
                title: currentPlan.title,
                status: planStatus?.status,
                progress: planStatus?.progress,
                currentTask: planStatus?.currentTask,
                estimatedDuration: currentPlan.estimatedDuration,
              },
              enhanced: true,
            }

            enhancedOutput = JSON.stringify(
              {
                todos,
                taskMasterContext: {
                  activePlan: currentPlan.title,
                  planProgress: planStatus?.progress ? `${planStatus.progress}%` : '0%',
                  currentTask: planStatus?.currentTask || 'None',
                  remainingTasks: planStatus ? planStatus.totalTasks - planStatus.completedTasks : 0,
                },
              },
              null,
              2
            )
          }
        } catch (error: any) {
          console.log(chalk.gray(`ℹ️ TaskMaster context unavailable: ${error.message}`))
        }
      }

      return {
        title: `${todos.filter((t) => t.status !== 'completed').length} todos${isTaskMasterAvailable() ? ' (TaskMaster)' : ''}`,
        output: enhancedOutput,
        metadata,
      }
    },
  }

  const writeTool: ToolCapability = {
    name: 'todowrite',
    description:
      'Create or update the session todo list with TaskMaster AI synchronization. Accepts { todos: [{id, content, status, priority, progress?}] }.',
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

      // Store in session todo store
      todoStore.setTodos(sessionId, norm)

      // Sync with TaskMaster if available
      if (isTaskMasterAvailable()) {
        try {
          // Convert session todos to TaskMaster format
          const taskMasterTodos = norm.map((sessionTodo) => taskMasterAdapter.sessionTodoToTaskMaster(sessionTodo))

          // Find or create a TaskMaster plan for the session
          const activePlans = taskMasterService.listPlans()
          let currentPlan = activePlans.find((plan) => plan.id.includes(sessionId))

          if (!currentPlan) {
            // Create a new plan for the session
            currentPlan = await taskMasterService.createPlan('Session Todo Management', {
              projectPath: process.cwd(),
              relevantFiles: [],
              projectType: 'session',
            })
          }

          // Update TaskMaster plan with new todos
          await taskMasterService.updatePlan(currentPlan.id, {
            todos: taskMasterTodos,
          })

          console.log(chalk.cyan('⚡︎ Synced with TaskMaster'))
        } catch (error: any) {
          console.log(chalk.gray(`ℹ️ TaskMaster sync failed: ${error.message}`))
        }
      }

      // Update dashboard panel when list changes
      try {
        const { advancedUI } = await import('../ui/advanced-cli-ui')
        const items = norm.map((t) => ({
          content: t.content,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
        }))
        ;(advancedUI as any).showTodoDashboard?.(items, `Plan Todos${isTaskMasterAvailable() ? ' (TaskMaster)' : ''}`)
      } catch {}

      return {
        title: `${norm.filter((x) => x.status !== 'completed').length} todos${isTaskMasterAvailable() ? ' (TaskMaster)' : ''}`,
        output: JSON.stringify(norm, null, 2),
        metadata: { todos: norm, taskMasterEnabled: isTaskMasterAvailable() },
      }
    },
  }

  try {
    toolService.registerTool(readTool)
    toolService.registerTool(writeTool)
    const taskMasterStatus = isTaskMasterAvailable() ? '(TaskMaster enabled)' : '(legacy mode)'
    console.log(chalk.cyan(`📋 Registered todo tools: todoread, todowrite ${taskMasterStatus}`))
  } catch (_e) {
    // ignore duplicate registration errors
  }
}

// Auto-register on import
registerTodoTools()
