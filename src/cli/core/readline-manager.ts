import * as readline from 'readline'
import { AnsiStripper } from '../utils/ansi-strip'

/**
 * Singleton readline manager to prevent multiple instances
 * and ensure proper cleanup and event tracking
 * Critical for fixing ANSI codes in prompts and raw mode state
 */
export class ReadlineManager {
  private static instance: ReadlineManager
  private rl: readline.Interface | null = null
  private originalRawMode = false
  private eventListeners: Map<string, Set<Function>> = new Map()
  private isInitialized = false

  private constructor() { }

  static getInstance(): ReadlineManager {
    if (!ReadlineManager.instance) {
      ReadlineManager.instance = new ReadlineManager()
    }
    return ReadlineManager.instance
  }

  /**
   * Create or return existing readline interface
   * Automatically cleans up previous instance if exists
   */
  createInterface(
    options: readline.ReadLineOptions
  ): readline.Interface {
    // If interface exists, close it first
    if (this.rl) {
      this.cleanup()
    }

    // Store original raw mode state BEFORE any changes
    if (process.stdin.isTTY) {
      this.originalRawMode = (process.stdin as any).isRaw || false
    }

    this.rl = readline.createInterface(options)
    this.isInitialized = true
    return this.rl
  }

  /**
   * Register event listener with tracking
   * Prevents duplicate listeners
   */
  on(eventName: string, handler: Function): void {
    if (!this.rl) return

    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set())
    }
    this.eventListeners.get(eventName)!.add(handler)
    this.rl.on(eventName as any, handler as any)
  }

  /**
   * Remove specific event listener
   */
  removeListener(eventName: string, handler: Function): void {
    if (!this.rl) return
    this.rl.removeListener(eventName, handler as any)
    this.eventListeners.get(eventName)?.delete(handler)
  }

  /**
   * Remove all listeners for event
   */
  removeAllListeners(eventName?: string): void {
    if (!this.rl) return
    this.rl.removeAllListeners(eventName)
    if (eventName) {
      this.eventListeners.delete(eventName)
    } else {
      this.eventListeners.clear()
    }
  }

  /**
   * Cleanup and restore state
   * GUARANTEED to restore raw mode to original state
   */
  cleanup(): void {
    try {
      // Remove all event listeners
      if (this.rl) {
        this.removeAllListeners()
        this.rl.close()
        this.rl = null
      }

      // ALWAYS restore raw mode to original state
      if (process.stdin.isTTY) {
        try {
          (process.stdin as any).setRawMode(this.originalRawMode)
        } catch (e) {
          // Ignore errors in raw mode restoration
        }
      }
    } catch (error) {
      // Silent cleanup
    }
    this.isInitialized = false
  }

  /**
   * Set prompt with ANSI stripping
   * Critical for fixing invisible text after arrow keys
   */
  setPrompt(prompt: string): void {
    if (!this.rl) return

    const safePrompt = AnsiStripper.safePrompt(prompt)
    this.rl.setPrompt(safePrompt)
  }

  /**
   * Get current readline interface
   */
  getInterface(): readline.Interface | null {
    return this.rl
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.rl !== null
  }

  /**
   * Ensure cleanup on process exit
   */
  static ensureCleanup(): void {
    const manager = ReadlineManager.getInstance()

    process.on('exit', () => manager.cleanup())
    process.on('SIGINT', () => {
      manager.cleanup()
      process.exit(0)
    })
    process.on('SIGTERM', () => {
      manager.cleanup()
      process.exit(0)
    })
  }
}

// Auto-cleanup on import
ReadlineManager.ensureCleanup()

export const readlineManager = ReadlineManager.getInstance()
