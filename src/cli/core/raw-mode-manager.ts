/**
 * Raw Mode State Machine
 * Guarantees safe raw mode transitions with proper restoration
 * Critical for fixing terminal state issues after arrow keys and crashes
 */

export class RawModeManager {
  private static instance: RawModeManager
  private originalMode = false
  private rawModeStack: boolean[] = []
  private isInitialized = false

  private constructor() {
    if (process.stdin.isTTY) {
      this.originalMode = (process.stdin as any).isRaw || false
      this.isInitialized = true
    }
  }

  static getInstance(): RawModeManager {
    if (!RawModeManager.instance) {
      RawModeManager.instance = new RawModeManager()
    }
    return RawModeManager.instance
  }

  /**
   * Push raw mode state ON/OFF
   * Returns: previous state (useful for tracking)
   */
  pushRawMode(enabled: boolean): boolean {
    if (!this.isInitialized) return false

    const currentState = (process.stdin as any).isRaw || false
    this.rawModeStack.push(currentState)

    try {
      (process.stdin as any).setRawMode(enabled)
      return currentState
    } catch (error) {
      this.rawModeStack.pop()
      return currentState
    }
  }

  /**
   * Pop raw mode to previous state
   * Guaranteed restoration even on error
   */
  popRawMode(): void {
    if (!this.isInitialized) return

    const previousState = this.rawModeStack.pop()
    if (previousState === undefined) {
      // Stack empty, restore to original
      this.restoreOriginal()
      return
    }

    try {
      (process.stdin as any).setRawMode(previousState)
    } catch (error) {
      // Force restoration on error
      this.restoreOriginal()
    }
  }

  /**
   * Restore to original state (on error or cleanup)
   */
  private restoreOriginal(): void {
    if (!this.isInitialized) return

    try {
      (process.stdin as any).setRawMode(this.originalMode)
      this.rawModeStack = []
    } catch (error) {
      // Ignore - best effort
    }
  }

  /**
   * Scope-based raw mode (try-finally pattern)
   * Guarantees restoration regardless of exceptions
   */
  static withRawMode<T>(callback: () => T, enabled = true): T {
    const manager = RawModeManager.getInstance()
    manager.pushRawMode(enabled)
    try {
      return callback()
    } finally {
      manager.popRawMode()
    }
  }

  /**
   * Get current raw mode state
   */
  getState(): boolean {
    if (!this.isInitialized) return false
    return (process.stdin as any).isRaw || false
  }

  /**
   * Force restoration to original (emergency restore)
   */
  forceRestoreOriginal(): void {
    this.restoreOriginal()
  }

  /**
   * Cleanup on shutdown
   */
  static ensureCleanup(): void {
    const manager = RawModeManager.getInstance()

    process.on('exit', () => manager.restoreOriginal())
    process.on('SIGINT', () => {
      manager.restoreOriginal()
      process.exit(0)
    })
  }
}

RawModeManager.ensureCleanup()
export const rawModeManager = RawModeManager.getInstance()
