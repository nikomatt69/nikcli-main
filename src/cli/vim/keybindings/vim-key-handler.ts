import { EventEmitter } from 'node:events'
import { VimState, VimMode, KeyBinding, CursorPosition, VimMotion } from '../types/vim-types'
import { VimModeConfig } from '../vim-mode-manager'

export class VimKeyHandler extends EventEmitter {
  private state: VimState
  private config: VimModeConfig
  private keyBindings: Map<string, KeyBinding> = new Map()
  private pendingKeys: string = ''
  private countBuffer: string = ''

  constructor(state: VimState, config: VimModeConfig) {
    super()
    this.state = state
    this.config = config
    this.initializeDefaultKeybindings()
  }

  async initialize(): Promise<void> {
    this.loadCustomKeybindings()
  }

  async handleKey(key: string): Promise<boolean> {
    const currentMode = this.state.mode

    if (this.isDigit(key) && currentMode === VimMode.NORMAL && this.pendingKeys === '') {
      this.countBuffer += key
      return true
    }

    if (key === 'Escape') {
      this.cancelPendingOperations()
      this.setMode(VimMode.NORMAL)
      return true
    }

    const fullKey = this.pendingKeys + key
    const binding = this.findKeyBinding(fullKey, currentMode)

    if (binding) {
      this.pendingKeys = ''
      const count = this.getCount()
      this.countBuffer = ''

      if (typeof binding.action === 'string') {
        return await this.executeNamedAction(binding.action, count)
      } else {
        return await binding.action(this.state)
      }
    }

    const partialMatch = this.hasPartialMatch(fullKey, currentMode)
    if (partialMatch) {
      this.pendingKeys = fullKey
      return true
    }

    if (currentMode === VimMode.INSERT) {
      return this.handleInsertMode(key)
    }

    if (currentMode === VimMode.COMMAND) {
      return this.handleCommandMode(key)
    }

    this.pendingKeys = ''
    this.countBuffer = ''
    return false
  }

  private initializeDefaultKeybindings(): void {
    const bindings: KeyBinding[] = [
      // Mode switching
      { key: 'i', mode: VimMode.NORMAL, action: 'enterInsertMode', description: 'Enter insert mode' },
      { key: 'I', mode: VimMode.NORMAL, action: 'enterInsertModeBeginning', description: 'Insert at line beginning' },
      { key: 'a', mode: VimMode.NORMAL, action: 'enterInsertModeAfter', description: 'Insert after cursor' },
      { key: 'A', mode: VimMode.NORMAL, action: 'enterInsertModeEnd', description: 'Insert at line end' },
      { key: 'v', mode: VimMode.NORMAL, action: 'enterVisualMode', description: 'Enter visual mode' },
      { key: 'V', mode: VimMode.NORMAL, action: 'enterVisualLineMode', description: 'Enter visual line mode' },
      { key: ':', mode: VimMode.NORMAL, action: 'enterCommandMode', description: 'Enter command mode' },

      // Movement
      { key: 'h', mode: VimMode.NORMAL, action: 'moveLeft', description: 'Move left' },
      { key: 'j', mode: VimMode.NORMAL, action: 'moveDown', description: 'Move down' },
      { key: 'k', mode: VimMode.NORMAL, action: 'moveUp', description: 'Move up' },
      { key: 'l', mode: VimMode.NORMAL, action: 'moveRight', description: 'Move right' },
      { key: 'w', mode: VimMode.NORMAL, action: 'moveWordForward', description: 'Move word forward' },
      { key: 'b', mode: VimMode.NORMAL, action: 'moveWordBackward', description: 'Move word backward' },
      { key: '0', mode: VimMode.NORMAL, action: 'moveLineBeginning', description: 'Move to line beginning' },
      { key: '$', mode: VimMode.NORMAL, action: 'moveLineEnd', description: 'Move to line end' },
      { key: 'gg', mode: VimMode.NORMAL, action: 'moveFileBeginning', description: 'Move to file beginning' },
      { key: 'G', mode: VimMode.NORMAL, action: 'moveFileEnd', description: 'Move to file end' },

      // Editing
      { key: 'x', mode: VimMode.NORMAL, action: 'deleteChar', description: 'Delete character' },
      { key: 'dd', mode: VimMode.NORMAL, action: 'deleteLine', description: 'Delete line' },
      { key: 'yy', mode: VimMode.NORMAL, action: 'yankLine', description: 'Yank line' },
      { key: 'p', mode: VimMode.NORMAL, action: 'pasteAfter', description: 'Paste after cursor' },
      { key: 'P', mode: VimMode.NORMAL, action: 'pasteBefore', description: 'Paste before cursor' },
      { key: 'u', mode: VimMode.NORMAL, action: 'undo', description: 'Undo' },
      { key: 'o', mode: VimMode.NORMAL, action: 'openLineBelow', description: 'Open line below' },
      { key: 'O', mode: VimMode.NORMAL, action: 'openLineAbove', description: 'Open line above' },

      // AI Integration
      { key: '<C-a>', mode: VimMode.NORMAL, action: 'aiAssist', description: 'AI assistance' },
      { key: '<C-g>', mode: VimMode.NORMAL, action: 'aiGenerate', description: 'AI generate' },
      { key: '<C-r>', mode: VimMode.NORMAL, action: 'aiRefactor', description: 'AI refactor' }
    ]

    bindings.forEach(binding => {
      this.keyBindings.set(`${binding.mode}:${binding.key}`, binding)
    })
  }

  private loadCustomKeybindings(): void {
    Object.entries(this.config.customKeybindings).forEach(([key, action]) => {
      const binding: KeyBinding = {
        key,
        mode: VimMode.NORMAL,
        action,
        description: `Custom: ${action}`
      }
      this.keyBindings.set(`${VimMode.NORMAL}:${key}`, binding)
    })
  }

  private findKeyBinding(key: string, mode: VimMode): KeyBinding | null {
    const modeKey = `${mode}:${key}`
    return this.keyBindings.get(modeKey) || null
  }

  private hasPartialMatch(key: string, mode: VimMode): boolean {
    const prefix = `${mode}:${key}`
    for (const bindingKey of this.keyBindings.keys()) {
      if (bindingKey.startsWith(prefix) && bindingKey.length > prefix.length) {
        return true
      }
    }
    return false
  }

  private async executeNamedAction(action: string, count: number = 1): Promise<boolean> {
    try {
      switch (action) {
        case 'enterInsertMode':
          this.setMode(VimMode.INSERT)
          break
        case 'enterInsertModeAfter':
          this.moveCursor(0, 1)
          this.setMode(VimMode.INSERT)
          break
        case 'enterInsertModeBeginning':
          this.moveCursor(0, -this.state.cursor.column)
          this.setMode(VimMode.INSERT)
          break
        case 'enterInsertModeEnd':
          const lineLength = this.getCurrentLine().length
          this.moveCursor(0, lineLength - this.state.cursor.column)
          this.setMode(VimMode.INSERT)
          break
        case 'enterVisualMode':
          this.setMode(VimMode.VISUAL)
          break
        case 'enterVisualLineMode':
          this.setMode(VimMode.VISUAL_LINE)
          break
        case 'enterCommandMode':
          this.setMode(VimMode.COMMAND)
          break
        case 'moveLeft':
          this.moveCursor(0, -count)
          break
        case 'moveRight':
          this.moveCursor(0, count)
          break
        case 'moveUp':
          this.moveCursor(-count, 0)
          break
        case 'moveDown':
          this.moveCursor(count, 0)
          break
        case 'moveWordForward':
          this.moveByWord(count, true)
          break
        case 'moveWordBackward':
          this.moveByWord(count, false)
          break
        case 'moveLineBeginning':
          this.moveCursor(0, -this.state.cursor.column)
          break
        case 'moveLineEnd':
          const line = this.getCurrentLine()
          this.moveCursor(0, line.length - this.state.cursor.column - 1)
          break
        case 'moveFileBeginning':
          this.setCursorPosition({ line: 0, column: 0 })
          break
        case 'moveFileEnd':
          this.setCursorPosition({ line: this.state.buffer.length - 1, column: 0 })
          break
        case 'deleteChar':
          this.deleteCharacter(count)
          break
        case 'deleteLine':
          this.deleteLine(count)
          break
        case 'yankLine':
          this.yankLine(count)
          break
        case 'pasteAfter':
          this.paste(true, count)
          break
        case 'pasteBefore':
          this.paste(false, count)
          break
        case 'openLineBelow':
          this.openLine(true)
          break
        case 'openLineAbove':
          this.openLine(false)
          break
        case 'aiAssist':
          this.emit('aiRequest', 'assist')
          break
        case 'aiGenerate':
          this.emit('aiRequest', 'generate')
          break
        case 'aiRefactor':
          this.emit('aiRequest', 'refactor')
          break
        default:
          return false
      }
      return true
    } catch (error) {
      return false
    }
  }

  private handleInsertMode(key: string): boolean {
    if (key === 'Enter') {
      this.insertNewLine()
      return true
    }

    if (key === 'Backspace') {
      this.backspace()
      return true
    }

    if (key.length === 1) {
      this.insertCharacter(key)
      return true
    }

    return false
  }

  private handleCommandMode(key: string): boolean {
    if (key === 'Enter') {
      this.emit('commandSubmit')
      this.setMode(VimMode.NORMAL)
      return true
    }

    if (key === 'Backspace') {
      this.emit('commandBackspace')
      return true
    }

    if (key.length === 1) {
      this.emit('commandInput', key)
      return true
    }

    return false
  }

  private moveCursor(lineOffset: number, columnOffset: number): void {
    const newLine = Math.max(0, Math.min(this.state.buffer.length - 1, this.state.cursor.line + lineOffset))
    const lineLength = this.state.buffer[newLine]?.length || 0
    const newColumn = Math.max(0, Math.min(lineLength - 1, this.state.cursor.column + columnOffset))

    this.setCursorPosition({ line: newLine, column: Math.max(0, newColumn) })
  }

  private setCursorPosition(position: CursorPosition): void {
    this.state.cursor = position
    this.emit('cursorMove', position)
  }

  private setMode(mode: VimMode): void {
    this.emit('modeChange', mode)
  }

  private getCurrentLine(): string {
    return this.state.buffer[this.state.cursor.line] || ''
  }

  private insertCharacter(char: string): void {
    const line = this.getCurrentLine()
    const newLine = line.slice(0, this.state.cursor.column) + char + line.slice(this.state.cursor.column)
    this.state.buffer[this.state.cursor.line] = newLine
    this.moveCursor(0, 1)
    this.emit('bufferChange')
  }

  private insertNewLine(): void {
    const line = this.getCurrentLine()
    const beforeCursor = line.slice(0, this.state.cursor.column)
    const afterCursor = line.slice(this.state.cursor.column)

    this.state.buffer[this.state.cursor.line] = beforeCursor
    this.state.buffer.splice(this.state.cursor.line + 1, 0, afterCursor)
    this.setCursorPosition({ line: this.state.cursor.line + 1, column: 0 })
    this.emit('bufferChange')
  }

  private backspace(): void {
    if (this.state.cursor.column > 0) {
      const line = this.getCurrentLine()
      const newLine = line.slice(0, this.state.cursor.column - 1) + line.slice(this.state.cursor.column)
      this.state.buffer[this.state.cursor.line] = newLine
      this.moveCursor(0, -1)
    } else if (this.state.cursor.line > 0) {
      const currentLine = this.getCurrentLine()
      const prevLine = this.state.buffer[this.state.cursor.line - 1]
      this.state.buffer[this.state.cursor.line - 1] = prevLine + currentLine
      this.state.buffer.splice(this.state.cursor.line, 1)
      this.setCursorPosition({ line: this.state.cursor.line - 1, column: prevLine.length })
    }
    this.emit('bufferChange')
  }

  private deleteCharacter(count: number): void {
    for (let i = 0; i < count; i++) {
      const line = this.getCurrentLine()
      if (this.state.cursor.column < line.length) {
        const newLine = line.slice(0, this.state.cursor.column) + line.slice(this.state.cursor.column + 1)
        this.state.buffer[this.state.cursor.line] = newLine
      }
    }
    this.emit('bufferChange')
  }

  private deleteLine(count: number): void {
    const startLine = this.state.cursor.line
    const endLine = Math.min(this.state.buffer.length - 1, startLine + count - 1)
    const deletedLines = this.state.buffer.splice(startLine, endLine - startLine + 1)

    this.state.registers.set('"', {
      content: deletedLines.join('\n'),
      type: 'line'
    })

    if (this.state.buffer.length === 0) {
      this.state.buffer.push('')
    }

    this.setCursorPosition({
      line: Math.min(startLine, this.state.buffer.length - 1),
      column: 0
    })
    this.emit('bufferChange')
  }

  private yankLine(count: number): void {
    const startLine = this.state.cursor.line
    const endLine = Math.min(this.state.buffer.length - 1, startLine + count - 1)
    const yankedLines = this.state.buffer.slice(startLine, endLine + 1)

    this.state.registers.set('"', {
      content: yankedLines.join('\n'),
      type: 'line'
    })
  }

  private paste(after: boolean, count: number): void {
    const register = this.state.registers.get('"')
    if (!register) return

    for (let i = 0; i < count; i++) {
      if (register.type === 'line') {
        const lines = register.content.split('\n')
        const insertIndex = after ? this.state.cursor.line + 1 : this.state.cursor.line
        this.state.buffer.splice(insertIndex, 0, ...lines)
        this.setCursorPosition({ line: insertIndex, column: 0 })
      } else {
        const line = this.getCurrentLine()
        const insertColumn = after ? this.state.cursor.column + 1 : this.state.cursor.column
        const newLine = line.slice(0, insertColumn) + register.content + line.slice(insertColumn)
        this.state.buffer[this.state.cursor.line] = newLine
        this.setCursorPosition({ line: this.state.cursor.line, column: insertColumn + register.content.length })
      }
    }
    this.emit('bufferChange')
  }

  private openLine(below: boolean): void {
    const insertIndex = below ? this.state.cursor.line + 1 : this.state.cursor.line
    this.state.buffer.splice(insertIndex, 0, '')
    this.setCursorPosition({ line: insertIndex, column: 0 })
    this.setMode(VimMode.INSERT)
    this.emit('bufferChange')
  }

  private moveByWord(count: number, forward: boolean): void {
    let { line, column } = this.state.cursor

    for (let i = 0; i < count; i++) {
      const currentLine = this.state.buffer[line] || ''

      if (forward) {
        while (column < currentLine.length && !/\w/.test(currentLine[column])) {
          column++
        }
        while (column < currentLine.length && /\w/.test(currentLine[column])) {
          column++
        }
        if (column >= currentLine.length && line < this.state.buffer.length - 1) {
          line++
          column = 0
        }
      } else {
        if (column === 0 && line > 0) {
          line--
          column = (this.state.buffer[line] || '').length
        }
        while (column > 0 && !/\w/.test(currentLine[column - 1])) {
          column--
        }
        while (column > 0 && /\w/.test(currentLine[column - 1])) {
          column--
        }
      }
    }

    this.setCursorPosition({ line, column })
  }

  private getCount(): number {
    return this.countBuffer ? parseInt(this.countBuffer, 10) : 1
  }

  private isDigit(key: string): boolean {
    return /^\d$/.test(key)
  }

  private cancelPendingOperations(): void {
    this.pendingKeys = ''
    this.countBuffer = ''
  }

  updateConfig(config: VimModeConfig): void {
    this.config = config
    this.keyBindings.clear()
    this.initializeDefaultKeybindings()
    this.loadCustomKeybindings()
  }
}