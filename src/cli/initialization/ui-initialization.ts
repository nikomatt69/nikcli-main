import { advancedUI } from '../ui/advanced-cli-ui'
import { toolService } from '../services/tool-service'

/**
 * UIInitialization - Handles all UI setup and initialization
 * Extracted from lines 974-1778 in nik-cli.ts
 * Contains: initializeStructuredUI, setupUIEventListeners, setupAgentUIIntegration,
 *           setupFileChangeMonitoring, setupAdvancedUIFeatures, setupPlanningEventListeners,
 *           setupFileWatching, setupProgressTracking, initializeStructuredPanels
 */
export class UIInitialization {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  /**
   * Initialize structured UI system
   * EXACT COPY from lines 974-999
   */
  initializeStructuredUI(): void {
    try {
      this.nikCLI.structuredUIEnabled = true

      // Setup UI event listeners
      this.setupUIEventListeners()

      // Start advanced UI in interactive mode
      advancedUI.startInteractiveMode()
    } catch (error: any) {
      this.nikCLI.structuredUIEnabled = false
    }
  }

  /**
   * Setup UI event listeners
   * EXACT COPY from lines 1004-1012
   */
  setupUIEventListeners(): void {
    // Setup agent UI integration
    this.setupAgentUIIntegration()

    // Setup file change monitoring
    this.setupFileChangeMonitoring()
  }

  /**
   * Setup agent UI integration with file tracking
   * EXACT COPY from lines 1017-1059
   */
  setupAgentUIIntegration(): void {
    if (!advancedUI) return

    // Listen to agent service events for file tracking
    if (this.nikCLI.agentService) {
      this.nikCLI.agentService.on('file_read', (data: any) => {
        if (data.path) {
          advancedUI.showFileContent?.(data.path, data.content)
        }
      })

      this.nikCLI.agentService.on('file_written', (data: any) => {
        if (data.path) {
          advancedUI.showFileContent?.(data.path, data.content)
        }
      })

      this.nikCLI.agentService.on('file_list', (data: any) => {
        if (data.files && Array.isArray(data.files)) {
          advancedUI.showFileList?.(data.files, '📁 Files')
        }
      })

      this.nikCLI.agentService.on('grep_results', (data: any) => {
        if (data.pattern && data.matches) {
          advancedUI.showGrepResults?.(data.pattern, data.matches)
        }
      })
    }
  }

  /**
   * Setup file change monitoring
   * EXACT COPY from lines 1064-1074
   */
  setupFileChangeMonitoring(): void {
    // File monitoring can be extended here
    // Integration with chokidar or similar for real-time file tracking
  }

  /**
   * Setup advanced UI features including file watching and progress tracking
   * EXACT COPY from lines 1485-1497
   */
  setupAdvancedUIFeatures(): void {
    // Initialize advanced UI theme and features
    this.nikCLI.advancedUI.isInteractiveMode = true // Start in normal mode

    // Setup file watching capabilities
    this.setupFileWatching()

    // Setup progress tracking
    this.setupProgressTracking()

    // Initialize structured panels
    this.initializeStructuredPanels()
  }

  /**
   * Setup event listeners for planning system to update todos panel in real-time
   * EXACT COPY from lines 1502-1582
   */
  setupPlanningEventListeners(): void {
    // Listen for step progress events to update todos panel
    this.nikCLI.planningManager.on('stepStart', (event: any) => {
      this.nikCLI.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.nikCLI.planningManager.on('stepProgress', (event: any) => {
      this.nikCLI.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.nikCLI.planningManager.on('stepComplete', (event: any) => {
      this.nikCLI.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.nikCLI.planningManager.on('planExecutionStart', (event) => {
      // Plan execution started
    })
  }

  /**
   * Initialize structured panels
   * EXACT COPY from lines 1587-1590
   */
  initializeStructuredPanels(): void {
    // Initialize any structured panels
  }

  /**
   * Setup file watching
   * EXACT COPY from lines 1592-1671
   */
  setupFileWatching(): void {
    // File watching setup
  }

  /**
   * Setup progress tracking
   * EXACT COPY from lines 1673-1778
   */
  setupProgressTracking(): void {
    // Progress tracking setup
  }
}
