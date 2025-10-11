import { EventEmitter } from 'events'

export interface EditOperation {
  id?: string
  filePath: string
  description?: string
  timestamp: string
  operation: 'create' | 'update' | 'delete' | string
  metadata?: Record<string, any>
  // Arbitrary payload for the edit (e.g., diff, old/new text, etc.)
  payload?: unknown
}

export interface EditHistoryState {
  undoStack: EditOperation[]
  redoStack: EditOperation[]
  currentPosition: number
  maxStackSize: number
}

export interface EditHistoryManagerOptions {
  maxStackSize?: number
  persistToDisk?: boolean
  autoSave?: boolean
}

export interface EditHistorySummary {
  undoCount: number
  redoCount: number
  recentOperations: EditOperation[]
}

export interface EditHistoryStats {
  totalOperations: number
  editOperations: number
  createOperations: number
  deleteOperations: number
  uniqueFiles: number
}

function getISO(): string {
  return new Date().toISOString()
}

export class EditHistoryManager extends EventEmitter {
  private state: EditHistoryState
  private readonly maxStackSize: number

  constructor(options?: EditHistoryManagerOptions) {
    super()
    this.maxStackSize = options?.maxStackSize ?? 50
    this.state = {
      undoStack: [],
      redoStack: [],
      currentPosition: 0,
      maxStackSize: this.maxStackSize,
    }
  }

  async initialize(): Promise<void> {
    // No-op placeholder for parity with dist behavior
    this.emit('initialized')
  }

  getState(): EditHistoryState {
    // Return a deep-ish copy to avoid external mutation
    return {
      undoStack: [...this.state.undoStack],
      redoStack: [...this.state.redoStack],
      currentPosition: this.state.currentPosition,
      maxStackSize: this.state.maxStackSize,
    }
  }

  importHistory(serialized: string): void {
    try {
      const parsed = JSON.parse(serialized) as EditHistoryState
      // Basic validation
      if (
        parsed &&
        Array.isArray(parsed.undoStack) &&
        Array.isArray(parsed.redoStack) &&
        typeof parsed.currentPosition === 'number'
      ) {
        this.state = {
          undoStack: parsed.undoStack,
          redoStack: parsed.redoStack,
          currentPosition: parsed.currentPosition,
          maxStackSize: parsed.maxStackSize || this.maxStackSize,
        }
        this.emit('imported')
      }
    } catch {
      // ignore invalid history
    }
  }

  async recordEdit(operation: EditOperation): Promise<string> {
    const opId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const op: EditOperation = {
      ...operation,
      id: opId,
      timestamp: getISO(),
    }

    // Pushing new edit invalidates the redo stack
    this.state.redoStack = []
    this.state.undoStack.push(op)
    this.state.currentPosition = this.state.undoStack.length

    // Enforce max size (drop oldest)
    if (this.state.undoStack.length > this.maxStackSize) {
      this.state.undoStack.splice(0, this.state.undoStack.length - this.maxStackSize)
      this.state.currentPosition = this.state.undoStack.length
    }

    this.emit('edit_recorded', op)
    return opId
  }

  async undo(count = 1): Promise<EditOperation[]> {
    const undone: EditOperation[] = []
    while (count-- > 0 && this.state.undoStack.length > 0) {
      const op = this.state.undoStack.pop()!
      this.state.redoStack.push(op)
      undone.push(op)
    }
    this.state.currentPosition = this.state.undoStack.length
    if (undone.length > 0) this.emit('undo', undone)
    return undone
  }

  async redo(count = 1): Promise<EditOperation[]> {
    const redone: EditOperation[] = []
    while (count-- > 0 && this.state.redoStack.length > 0) {
      const op = this.state.redoStack.pop()!
      this.state.undoStack.push(op)
      redone.push(op)
    }
    this.state.currentPosition = this.state.undoStack.length
    if (redone.length > 0) this.emit('redo', redone)
    return redone
  }

  getHistorySummary(): EditHistorySummary {
    const recentOperations = [...this.state.undoStack].slice(-10)
    return {
      undoCount: this.state.undoStack.length,
      redoCount: this.state.redoStack.length,
      recentOperations,
    }
  }

  getStatistics(): EditHistoryStats {
    const all = [...this.state.undoStack, ...this.state.redoStack]
    const totalOperations = all.length
    const createOperations = all.filter((op) => op.operation === 'create').length
    const deleteOperations = all.filter((op) => op.operation === 'delete').length
    const editOperations = totalOperations - createOperations - deleteOperations
    const uniqueFiles = new Set(all.map((op) => op.filePath)).size
    return {
      totalOperations,
      editOperations,
      createOperations,
      deleteOperations,
      uniqueFiles,
    }
  }
}

export const editHistoryManager = new EditHistoryManager({ maxStackSize: 50 })
