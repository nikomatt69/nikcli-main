import { EventEmitter } from 'node:events'

interface PromptState {
  lines: string[]
  visible: boolean
  position: { row: number; col: number }
}

export class FixedPromptManager extends EventEmitter {
  private static instance: FixedPromptManager

  private terminalHeight: number = 0
  private terminalWidth: number = 0
  private promptHeight: number = 6 // Base height
  private scrollRegionStart: number = 1
  private scrollRegionEnd: number = 0
  private isActive: boolean = false
  private currentPrompt: PromptState | null = null

  private constructor() {
    super()
    this.updateTerminalSize()
    this.setupResizeHandler()
  }

  static getInstance(): FixedPromptManager {
    if (!FixedPromptManager.instance) {
      FixedPromptManager.instance = new FixedPromptManager()
    }
    return FixedPromptManager.instance
  }

  /**
   * Inizializza fixed prompt mode
   */
  initialize(promptHeight?: number): void {
    if (this.isActive) return
    if (!process.stdout.isTTY) {
      console.warn('[FixedPrompt] Not a TTY, fixed prompt disabled')
      return
    }

    if (promptHeight) {
      this.promptHeight = promptHeight
    }

    this.isActive = true
    this.updateTerminalSize()
    this.setupScrollRegion()
    this.clearPromptArea()

    this.emit('initialized')
  }

  /**
   * Shutdown e ripristina stato normale
   */
  shutdown(): void {
    if (!this.isActive) return

    // Reset scrolling region a intero schermo
    process.stdout.write('\x1b[r')

    // Clear screen
    process.stdout.write('\x1b[2J')

    // Muovi cursor a inizio
    process.stdout.write('\x1b[H')

    this.isActive = false
    this.currentPrompt = null
    this.emit('shutdown')
  }

  /**
   * Configura scrolling region ANSI
   */
  private setupScrollRegion(): void {
    this.scrollRegionEnd = this.terminalHeight - this.promptHeight

    // Set scroll region (da riga 1 a scrollRegionEnd)
    const setRegion = `\x1b[${this.scrollRegionStart};${this.scrollRegionEnd}r`
    process.stdout.write(setRegion)

    // Muovi cursor a inizio scroll region
    process.stdout.write(`\x1b[${this.scrollRegionStart};1H`)
  }

  /**
   * Print text nella scroll region
   */
  printToScrollRegion(text: string): void {
    if (!this.isActive) {
      process.stdout.write(text)
      return
    }

    // Salva posizione cursor
    process.stdout.write('\x1b[s')

    // Muovi a fine scroll region
    process.stdout.write(`\x1b[${this.scrollRegionEnd};1H`)

    // Print text (scroll automatico se necessario)
    process.stdout.write(text)

    // Ripristina cursor
    process.stdout.write('\x1b[u')
  }

  /**
   * Aggiorna prompt area completa con righe custom
   */
  updatePromptArea(lines: string[], height: number): void {
    if (!this.isActive) return

    // Aggiorna altezza se cambiata
    if (height !== this.promptHeight) {
      this.updatePromptHeight(height)
    }

    const promptRow = this.scrollRegionEnd + 1

    // Salva cursor
    process.stdout.write('\x1b[s')

    // Muovi a prompt area
    process.stdout.write(`\x1b[${promptRow};1H`)

    // Clear prompt area
    for (let i = 0; i < this.promptHeight; i++) {
      process.stdout.write('\x1b[K') // Clear line
      if (i < this.promptHeight - 1) {
        process.stdout.write('\n')
      }
    }

    // Torna a inizio prompt area
    process.stdout.write(`\x1b[${promptRow};1H`)

    // Scrivi tutte le righe
    for (let i = 0; i < lines.length && i < this.promptHeight; i++) {
      process.stdout.write(lines[i])
      if (i < lines.length - 1) {
        process.stdout.write('\n')
      }
    }

    // Ripristina cursor
    process.stdout.write('\x1b[u')

    this.currentPrompt = {
      lines,
      visible: true,
      position: { row: promptRow, col: 1 },
    }
  }

  /**
   * Aggiorna singolo prompt (backward compatibility)
   */
  updatePrompt(promptText: string): void {
    if (!this.isActive) return

    const lines = promptText.split('\n')
    this.updatePromptArea(lines, Math.max(this.promptHeight, lines.length))
  }

  /**
   * Aggiorna altezza prompt dinamicamente
   */
  updatePromptHeight(newHeight: number): void {
    if (!this.isActive) return
    if (newHeight === this.promptHeight) return

    this.promptHeight = newHeight
    this.updateTerminalSize()
    this.setupScrollRegion()

    // Ridisegna prompt corrente se esiste
    if (this.currentPrompt) {
      this.updatePromptArea(this.currentPrompt.lines, newHeight)
    }
  }

  /**
   * Clear prompt area
   */
  clearPromptArea(): void {
    if (!this.isActive) return

    const promptRow = this.scrollRegionEnd + 1

    process.stdout.write('\x1b[s')
    process.stdout.write(`\x1b[${promptRow};1H`)

    for (let i = 0; i < this.promptHeight; i++) {
      process.stdout.write('\x1b[K')
      if (i < this.promptHeight - 1) {
        process.stdout.write('\n')
      }
    }

    process.stdout.write('\x1b[u')
  }

  /**
   * Clear scroll region
   */
  clearScrollRegion(): void {
    if (!this.isActive) return

    // Salva cursor
    process.stdout.write('\x1b[s')

    // Muovi a inizio scroll region
    process.stdout.write(`\x1b[${this.scrollRegionStart};1H`)

    // Clear da cursor a fine scroll region
    process.stdout.write('\x1b[J')

    // Ripristina cursor
    process.stdout.write('\x1b[u')
  }

  /**
   * Ottieni altezza scroll region
   */
  getScrollRegionHeight(): number {
    return this.scrollRegionEnd - this.scrollRegionStart + 1
  }

  /**
   * Ottieni posizione prompt
   */
  getPromptPosition(): number {
    return this.scrollRegionEnd + 1
  }

  /**
   * Check se abilitato
   */
  isEnabled(): boolean {
    return this.isActive
  }

  /**
   * Update terminal size
   */
  private updateTerminalSize(): void {
    this.terminalHeight = process.stdout.rows || 24
    this.terminalWidth = process.stdout.columns || 80
    this.scrollRegionEnd = this.terminalHeight - this.promptHeight
  }

  /**
   * Setup resize handler
   */
  private setupResizeHandler(): void {
    process.stdout.on('resize', () => {
      if (!this.isActive) return

      this.updateTerminalSize()
      this.setupScrollRegion()

      // Ridisegna prompt
      if (this.currentPrompt?.lines) {
        this.updatePromptArea(this.currentPrompt.lines, this.promptHeight)
      }

      this.emit('resize', {
        height: this.terminalHeight,
        width: this.terminalWidth,
      })
    })
  }
}

// Singleton export
export const fixedPromptManager = FixedPromptManager.getInstance()
