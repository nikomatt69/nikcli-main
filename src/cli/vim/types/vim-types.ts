export enum VimMode {
  NORMAL = 'normal',
  INSERT = 'insert',
  VISUAL = 'visual',
  VISUAL_LINE = 'visual-line',
  COMMAND = 'command',
  REPLACE = 'replace',
}

export interface CursorPosition {
  line: number
  column: number
}

export interface VimRegister {
  content: string
  type: 'char' | 'line' | 'block'
}

export interface VimCommand {
  name: string
  execute: (args: string[]) => Promise<CommandResult>
  description: string
  aliases?: string[]
}

export interface CommandResult {
  success: boolean
  message?: string
  error?: string
}

export interface VimState {
  mode: VimMode
  buffer: string[]
  cursor: CursorPosition
  registers: Map<string, VimRegister>
  history: string[]
  lastCommand: string | null
  isRecording: boolean
  macroRegister: string | null
}

export interface KeyBinding {
  key: string
  mode: VimMode | VimMode[]
  action: string | ((state: VimState) => Promise<boolean>)
  description: string
}

export interface VimMotion {
  type: 'char' | 'word' | 'line' | 'paragraph' | 'search'
  direction: 'forward' | 'backward' | 'up' | 'down'
  count?: number
}

export interface VimOperation {
  type: 'delete' | 'yank' | 'change' | 'indent' | 'format'
  motion?: VimMotion
  register?: string
  count?: number
}

export interface VimSearchState {
  pattern: string
  direction: 'forward' | 'backward'
  matches: CursorPosition[]
  currentMatch: number
}
