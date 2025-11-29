/**
 * Input Queue Manager
 * Gestisce la coda dei messaggi di input quando il sistema sta processando
 */

import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface QueuedInput {
  id: string
  input: string
  timestamp: Date
  priority: 'high' | 'normal' | 'low'
  source: 'user' | 'system' | 'agent'
}

export interface QueueStatus {
  isProcessing: boolean
  queueLength: number
  pendingInputs: QueuedInput[]
  lastProcessed?: Date
}

export class InputQueue {
  private static instance: InputQueue
  private queue: QueuedInput[] = []
  private isProcessing: boolean = false
  private processingPromise: Promise<void> | null = null
  private maxQueueSize: number = 50
  private processingTimeout: number = 300000 // 5 minuti
  private bypassEnabled: boolean = false // Bypass per approval prompts

  static getInstance(): InputQueue {
    if (!InputQueue.instance) {
      InputQueue.instance = new InputQueue()
    }
    return InputQueue.instance
  }

  /**
   * Aggiungi input alla coda
   */
  enqueue(
    input: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    source: 'user' | 'system' | 'agent' = 'user'
  ): string {
    const queuedInput: QueuedInput = {
      id: `input-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      input,
      timestamp: new Date(),
      priority,
      source,
    }

    // Se la coda è piena, rimuovi l'input più vecchio con priorità più bassa
    if (this.queue.length >= this.maxQueueSize) {
      this.removeOldestLowPriority()
    }

    // Inserisci in base alla priorità
    if (priority === 'high') {
      this.queue.unshift(queuedInput)
    } else if (priority === 'low') {
      this.queue.push(queuedInput)
    } else {
      // Inserisci dopo gli high priority
      const highPriorityCount = this.queue.filter((q) => q.priority === 'high').length
      this.queue.splice(highPriorityCount, 0, queuedInput)
    }

    advancedUI.logInfo(
      `📥 Input queued: ${input.substring(0, 30)}${input.length > 30 ? '...' : ''} (${this.queue.length} in queue)`
    )

    return queuedInput.id
  }

  /**
   * Processa il prossimo input dalla coda
   */
  async processNext(processor: (input: string) => Promise<void>): Promise<QueuedInput | null> {
    if (this.queue.length === 0) {
      return null
    }

    if (this.isProcessing) {
      return null // Già in processing
    }

    this.isProcessing = true
    const nextInput = this.queue.shift()!

    try {
      advancedUI.logInfo(
        `⚡︎ Processing queued input: ${nextInput.input.substring(0, 30)}${nextInput.input.length > 30 ? '...' : ''}`
      )

      // Timeout per evitare blocchi
      this.processingPromise = Promise.race([
        processor(nextInput.input),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Processing timeout')), this.processingTimeout)),
      ]) as Promise<void>

      await this.processingPromise

      advancedUI.logSuccess(
        `✓ Queued input processed: ${nextInput.input.substring(0, 30)}${nextInput.input.length > 30 ? '...' : ''}`
      )

      return nextInput
    } catch (error: any) {
      advancedUI.logError(`✖ Failed to process queued input: ${error.message}`)

      // Rimetti l'input in coda se è un errore temporaneo
      if (error.message.includes('timeout') || error.message.includes('network')) {
        this.queue.unshift(nextInput)
        advancedUI.logWarning(`⚡︎ Re-queued input due to temporary error`)
      }

      return nextInput
    } finally {
      this.isProcessing = false
      this.processingPromise = null
    }
  }

  /**
   * Processa tutti gli input in coda
   */
  async processAll(processor: (input: string) => Promise<void>): Promise<number> {
    let processedCount = 0

    while (this.queue.length > 0) {
      const result = await this.processNext(processor)
      if (result) {
        processedCount++
      } else {
        break // Nessun input da processare o già in processing
      }
    }

    return processedCount
  }

  /**
   * Rimuovi input dalla coda per ID
   */
  removeById(id: string): boolean {
    const index = this.queue.findIndex((q) => q.id === id)
    if (index !== -1) {
      this.queue.splice(index, 1)
      advancedUI.logInfo(`🗑️ Removed input from queue: ${id}`)
      return true
    }
    return false
  }

  /**
   * Rimuovi input dalla coda per contenuto
   */
  removeByContent(content: string): number {
    const initialLength = this.queue.length
    this.queue = this.queue.filter((q) => q.input !== content)
    const removed = initialLength - this.queue.length

    if (removed > 0) {
      advancedUI.logInfo(`🗑️ Removed ${removed} inputs from queue matching: ${content.substring(0, 30)}...`)
    }

    return removed
  }

  /**
   * Svuota la coda
   */
  clear(): number {
    const count = this.queue.length
    this.queue = []
    advancedUI.logInfo(`🗑️ Cleared ${count} inputs from queue`)
    return count
  }

  /**
   * Ottieni stato della coda
   */
  getStatus(): QueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      pendingInputs: [...this.queue],
      lastProcessed: this.isProcessing ? undefined : new Date(),
    }
  }

  /**
   * Ottieni input in coda per priorità
   */
  getByPriority(priority: 'high' | 'normal' | 'low'): QueuedInput[] {
    return this.queue.filter((q) => q.priority === priority)
  }

  /**
   * Ottieni input in coda per sorgente
   */
  getBySource(source: 'user' | 'system' | 'agent'): QueuedInput[] {
    return this.queue.filter((q) => q.source === source)
  }

  /**
   * Rimuovi input più vecchi con priorità più bassa
   */
  private removeOldestLowPriority(): void {
    const lowPriorityIndex = this.queue.findIndex((q) => q.priority === 'low')
    if (lowPriorityIndex !== -1) {
      const removed = this.queue.splice(lowPriorityIndex, 1)[0]
      advancedUI.logWarning(`🗑️ Removed oldest low-priority input: ${removed.input.substring(0, 30)}...`)
    }
  }

  /**
   * Imposta dimensione massima della coda
   */
  setMaxQueueSize(size: number): void {
    this.maxQueueSize = Math.max(1, size)

    // Rimuovi input in eccesso se necessario
    while (this.queue.length > this.maxQueueSize) {
      this.removeOldestLowPriority()
    }
  }

  /**
   * Imposta timeout di processing
   */
  setProcessingTimeout(timeout: number): void {
    this.processingTimeout = timeout
  }

  /**
   * Interrompi processing corrente
   */
  interrupt(): boolean {
    if (this.isProcessing && this.processingPromise) {
      // Non possiamo realmente interrompere una Promise, ma possiamo segnalare
      advancedUI.logWarning(`⚠️ Interrupting current queue processing`)
      this.isProcessing = false
      return true
    }
    return false
  }

  /**
   * Mostra statistiche della coda
   */
  showStats(): void {
    const status = this.getStatus()
    const highPriority = this.getByPriority('high').length
    const normalPriority = this.getByPriority('normal').length
    const lowPriority = this.getByPriority('low').length

    console.log(chalk.cyan('\n📊 Input Queue Statistics:'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(`Status: ${status.isProcessing ? chalk.yellow('Processing') : chalk.green('Idle')}`)
    console.log(`Queue Length: ${chalk.blue(status.queueLength)}`)
    console.log(`High Priority: ${chalk.red(highPriority)}`)
    console.log(`Normal Priority: ${chalk.yellow(normalPriority)}`)
    console.log(`Low Priority: ${chalk.green(lowPriority)}`)

    if (status.pendingInputs.length > 0) {
      console.log(chalk.cyan('\n📋 Pending Inputs:'))
      status.pendingInputs.slice(0, 5).forEach((input, index) => {
        const timeAgo = this.getTimeAgo(input.timestamp)
        console.log(
          `${index + 1}. ${chalk.gray(timeAgo)} ${input.input.substring(0, 40)}${input.input.length > 40 ? '...' : ''}`
        )
      })

      if (status.pendingInputs.length > 5) {
        console.log(chalk.gray(`   ... and ${status.pendingInputs.length - 5} more`))
      }
    }

    console.log(chalk.gray('─'.repeat(40)))
  }

  /**
   * Abilita bypass per approval prompts
   */
  enableBypass(): void {
    this.bypassEnabled = true
    advancedUI.logInfo(`🔓 Input queue bypass enabled for approvals`)
  }

  /**
   * Disabilita bypass per approval prompts
   */
  disableBypass(): void {
    this.bypassEnabled = false
    advancedUI.logInfo(`🔒 Input queue bypass disabled`)

    // Ensure prompt rendering dopo disable per evitare race conditions
    setTimeout(() => {
      try {
        const nik = (global as any).__nikCLI
        if (nik?.renderPromptAfterOutput) {
          nik.renderPromptAfterOutput()
        }
      } catch {
        // Ignore errors - just try to restore prompt
      }
    }, 100)
  }

  /**
   * Verifica se il bypass è abilitato
   */
  isBypassEnabled(): boolean {
    return this.bypassEnabled
  }

  /**
   * Force cleanup completo in caso di interruzioni o errori
   */
  forceCleanup(): void {
    this.bypassEnabled = false
    this.isProcessing = false
    this.processingPromise = null

    // Clear any pending inputs che potrebbero causare loop
    this.queue = []

    advancedUI.logInfo(`🧹 Input queue force cleanup completed`)

    // Immediate prompt restoration
    setTimeout(() => {
      try {
        const nik = (global as any).__nikCLI
        if (nik?.renderPromptAfterOutput) {
          nik.renderPromptAfterOutput()
        }
        if (nik?.rl?.prompt) {
          nik.rl.prompt()
        }
      } catch {
        // Ignore errors
      }
    }, 50)
  }

  /** Dispose input queue resources and reset state */
  dispose(): void {
    this.bypassEnabled = false
    this.isProcessing = false
    this.processingPromise = null
    this.queue = []
  }

  /**
   * Determina se l'input deve essere messo in coda o bypassato
   */
  shouldQueue(input: string): boolean {
    // Se il bypass è abilitato, non mettere in coda
    if (this.bypassEnabled) {
      return false
    }

    // Input di approvazione semplici dovrebbero essere bypassati
    const trimmed = input.trim().toLowerCase()
    const approvalInputs = ['y', 'n', 'yes', 'no', 'si', 'no', '1', '2', '0']
    if (approvalInputs.includes(trimmed)) {
      return false
    }

    return true
  }

  /**
   * Calcola tempo trascorso
   */
  private getTimeAgo(timestamp: Date): string {
    const now = new Date()
    const diff = now.getTime() - timestamp.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ago`
    } else if (minutes > 0) {
      return `${minutes}m ago`
    } else {
      return `${seconds}s ago`
    }
  }
}

// Export singleton instance
export const inputQueue = InputQueue.getInstance()
