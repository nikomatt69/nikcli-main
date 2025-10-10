/**
 * Terminal Output Manager
 * Sistema centralizzato per tracciare e gestire l'altezza degli output nel terminale
 * Previene overlap tra componenti, live updates, toolchains e prompt area
 */

export interface OutputEntry {
  id: string
  componentName: string
  startLine: number
  heightLines: number
  timestamp: Date
  persistent: boolean // se false, può essere auto-cleared quando scade
  expiryMs?: number // tempo di vita in millisecondi
}

export interface OutputReservation {
  id: string
  componentName: string
  estimatedLines: number
  reserved: boolean
}

export class TerminalOutputManager {
  private outputs: Map<string, OutputEntry> = new Map()
  private currentLine: number = 0
  private terminalHeight: number = 0
  private promptHeight: number = 3 // altezza default del prompt area
  private reservedHeight: number = 0 // spazio riservato ma non ancora confermato

  constructor() {
    this.updateTerminalDimensions()
    // Aggiorna dimensioni quando il terminale viene ridimensionato
    process.stdout.on('resize', () => {
      this.updateTerminalDimensions()
    })
  }

  /**
   * Aggiorna le dimensioni del terminale
   */
  private updateTerminalDimensions(): void {
    this.terminalHeight = process.stdout.rows || 24
  }

  /**
   * Riserva spazio per un output prima di stamparlo
   * Restituisce un ID di prenotazione
   */
  reserveSpace(componentName: string, estimatedLines: number): string {
    const id = `${componentName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    // Verifica se c'è spazio disponibile
    const availableSpace = this.getAvailableHeight()

    if (estimatedLines > availableSpace) {
      // Auto-clear expired outputs per fare spazio
      this.clearExpiredOutputs()

      // Se ancora non c'è spazio, comprimi o scroll
      const newAvailableSpace = this.getAvailableHeight()
      if (estimatedLines > newAvailableSpace) {
        this.makeSpace(estimatedLines - newAvailableSpace)
      }
    }

    this.reservedHeight += estimatedLines

    return id
  }

  /**
   * Conferma che l'output è stato stampato con l'altezza effettiva
   */
  confirmOutput(
    id: string,
    componentName: string,
    actualLines: number,
    options: {
      persistent?: boolean
      expiryMs?: number
    } = {}
  ): void {
    const entry: OutputEntry = {
      id,
      componentName,
      startLine: this.currentLine,
      heightLines: actualLines,
      timestamp: new Date(),
      persistent: options.persistent ?? false,
      expiryMs: options.expiryMs ?? 30000, // default 30 secondi
    }

    this.outputs.set(id, entry)
    this.currentLine += actualLines

    // Riduci lo spazio riservato
    const reservation = this.reservedHeight
    const diff = Math.abs(actualLines - reservation)
    if (diff > 0 && reservation > 0) {
      this.reservedHeight = Math.max(0, this.reservedHeight - actualLines)
    }
  }

  /**
   * Cancella un output specifico
   */
  clearOutput(id: string): void {
    const output = this.outputs.get(id)
    if (output) {
      this.currentLine = Math.max(0, this.currentLine - output.heightLines)
      this.outputs.delete(id)
    }
  }

  /**
   * Cancella tutti gli output scaduti (non persistenti e oltre expiryMs)
   */
  clearExpiredOutputs(): number {
    const now = Date.now()
    let clearedLines = 0

    for (const [id, output] of this.outputs.entries()) {
      if (!output.persistent && output.expiryMs) {
        const age = now - output.timestamp.getTime()
        if (age > output.expiryMs) {
          clearedLines += output.heightLines
          this.outputs.delete(id)
        }
      }
    }

    if (clearedLines > 0) {
      this.currentLine = Math.max(0, this.currentLine - clearedLines)
    }

    return clearedLines
  }

  /**
   * Cancella tutti gli output di un componente specifico
   */
  clearComponentOutputs(componentName: string): number {
    let clearedLines = 0

    for (const [id, output] of this.outputs.entries()) {
      if (output.componentName === componentName) {
        clearedLines += output.heightLines
        this.outputs.delete(id)
      }
    }

    if (clearedLines > 0) {
      this.currentLine = Math.max(0, this.currentLine - clearedLines)
    }

    return clearedLines
  }

  /**
   * Libera spazio eliminando gli output più vecchi non persistenti
   */
  private makeSpace(linesNeeded: number): void {
    // Ordina output per timestamp (più vecchi first)
    const sortedOutputs = Array.from(this.outputs.entries())
      .filter(([_, output]) => !output.persistent)
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())

    let freedLines = 0
    const toDelete: string[] = []

    for (const [id, output] of sortedOutputs) {
      if (freedLines >= linesNeeded) break
      toDelete.push(id)
      freedLines += output.heightLines
    }

    // Elimina gli output selezionati
    for (const id of toDelete) {
      this.outputs.delete(id)
    }

    if (freedLines > 0) {
      this.currentLine = Math.max(0, this.currentLine - freedLines)
    }
  }

  /**
   * Calcola l'altezza disponibile per nuovi output
   */
  getAvailableHeight(): number {
    const usedHeight = this.currentLine + this.promptHeight + this.reservedHeight
    return Math.max(0, this.terminalHeight - usedHeight)
  }

  /**
   * Calcola l'altezza rimanente considerando il prompt
   */
  getRemainingHeight(): number {
    return Math.max(0, this.terminalHeight - this.currentLine - this.promptHeight)
  }

  /**
   * Ottieni la posizione corretta per il prompt (riga del terminale)
   */
  getPromptPosition(): number {
    // Il prompt dovrebbe essere sempre alla fine, dopo tutti gli output
    const position = this.terminalHeight - this.promptHeight
    return Math.max(1, position)
  }

  /**
   * Imposta l'altezza del prompt area
   */
  setPromptHeight(lines: number): void {
    this.promptHeight = lines
  }

  /**
   * Ottieni statistiche sugli output correnti
   */
  getStats(): {
    totalOutputs: number
    totalLines: number
    persistentOutputs: number
    temporaryOutputs: number
    availableHeight: number
    promptPosition: number
  } {
    let persistentCount = 0
    let temporaryCount = 0

    for (const output of this.outputs.values()) {
      if (output.persistent) {
        persistentCount++
      } else {
        temporaryCount++
      }
    }

    return {
      totalOutputs: this.outputs.size,
      totalLines: this.currentLine,
      persistentOutputs: persistentCount,
      temporaryOutputs: temporaryCount,
      availableHeight: this.getAvailableHeight(),
      promptPosition: this.getPromptPosition(),
    }
  }

  /**
   * Calcola il numero di righe occupate da un testo
   */
  static calculateLines(text: string, terminalWidth?: number): number {
    const width = terminalWidth || process.stdout.columns || 120
    const lines = text.split('\n')
    let totalLines = 0

    for (const line of lines) {
      // Rimuovi i codici ANSI per calcolare la lunghezza effettiva
      const strippedLine = line.replace(/\x1B\[[0-9;]*m/g, '')
      const lineLength = strippedLine.length

      if (lineLength === 0) {
        totalLines += 1
      } else {
        // Calcola quante righe occupa considerando il wrapping
        totalLines += Math.ceil(lineLength / width)
      }
    }

    return totalLines
  }

  /**
   * Reset completo del manager (utile per test o reinizializzazione)
   */
  reset(): void {
    this.outputs.clear()
    this.currentLine = 0
    this.reservedHeight = 0
    this.updateTerminalDimensions()
  }

  /**
   * Debug: stampa lo stato corrente
   */
  debug(): void {
    console.log('=== Terminal Output Manager Debug ===')
    console.log(`Terminal Height: ${this.terminalHeight}`)
    console.log(`Current Line: ${this.currentLine}`)
    console.log(`Prompt Height: ${this.promptHeight}`)
    console.log(`Reserved Height: ${this.reservedHeight}`)
    console.log(`Available Height: ${this.getAvailableHeight()}`)
    console.log(`Prompt Position: ${this.getPromptPosition()}`)
    console.log('\nOutputs:')
    for (const [id, output] of this.outputs.entries()) {
      console.log(`  ${id}:`)
      console.log(`    Component: ${output.componentName}`)
      console.log(`    Lines: ${output.heightLines}`)
      console.log(`    Start Line: ${output.startLine}`)
      console.log(`    Persistent: ${output.persistent}`)
      console.log(`    Age: ${Date.now() - output.timestamp.getTime()}ms`)
    }
    console.log('=====================================')
  }
}

// Singleton instance
export const terminalOutputManager = new TerminalOutputManager()
