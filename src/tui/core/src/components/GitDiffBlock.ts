import blessed, { type Widgets } from 'blessed'
import { resolveBlessedColor } from '../lib/utils'
import type { BaseProps, Component } from './BaseComponent'

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified'
  oldLineNumber?: number
  newLineNumber?: number
  content: string
  originalContent?: string // For modified lines
}

export interface DiffData {
  fileName?: string
  language?: string
  oldContent: string
  newContent: string
  lines: DiffLine[]
  stats: {
    additions: number
    deletions: number
    modifications: number
  }
}

export interface GitDiffBlockProps extends BaseProps {
  // Diff Data
  diffData?: DiffData
  oldContent?: string
  newContent?: string
  fileName?: string
  language?: string

  // Layout Options
  layout?: 'split' | 'unified'
  showLineNumbers?: boolean
  contextLines?: number

  // Visual Options
  diffTheme?: 'dark' | 'light'
  syntaxHighlight?: boolean
  showStats?: boolean

  // Interactive
  collapsible?: boolean
  onExpand?: () => void
  onCollapse?: () => void
}

export class GitDiffBlock implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement
  theme: any
  destroy: () => void

  private props: GitDiffBlockProps
  private diffData: DiffData | null = null
  private leftPanel?: Widgets.BoxElement
  private rightPanel?: Widgets.BoxElement
  private headerBox?: Widgets.BoxElement
  private isCollapsed: boolean = false

  // Required Component interface methods
  setVariant(_variant: any): void {
    // Not applicable for GitDiffBlock
  }

  setSize(_size: any): void {
    // Not applicable for GitDiffBlock
  }

  setState(_state: any): void {
    // Not applicable for GitDiffBlock
  }

  getConfig(): any {
    return this.props
  }

  update(): void {
    this.render()
  }

  constructor(props: GitDiffBlockProps) {
    this.props = {
      layout: 'split',
      showLineNumbers: true,
      contextLines: 3,
      diffTheme: 'dark',
      syntaxHighlight: false,
      showStats: true,
      collapsible: false,
      ...props,
    }

    // Create main container
    this.el = blessed.box({
      parent: props.parent,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      focusable: props.focusable ?? true,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      scrollable: props.scrollable ?? true,
      border:
        props.borderStyle && props.borderStyle !== 'none'
          ? {
              type: 'line',
              fg: resolveBlessedColor(this.getThemeColor('border'), {}) as unknown as number,
            }
          : undefined,
      style: {
        bg: props.bg || this.getThemeColor('background'),
        fg: props.fg || this.getThemeColor('foreground'),
      },
    })

    // Generate diff data if content provided
    if (props.oldContent && props.newContent) {
      this.diffData = this.generateDiffData(props.oldContent, props.newContent, props.fileName, props.language)
    } else if (props.diffData) {
      this.diffData = props.diffData
    }

    this.createLayout()
    this.setupKeyHandlers()

    this.destroy = () => {
      // Cleanup if needed
    }

    // Render initial content
    if (this.diffData) {
      this.render()
    }
  }

  private createLayout(): void {
    if (this.props.showStats && this.diffData) {
      this.createHeader()
    }

    if (this.props.layout === 'split') {
      this.createSplitLayout()
    } else {
      this.createUnifiedLayout()
    }
  }

  private createHeader(): void {
    if (!this.diffData) return

    const headerHeight = this.props.showStats ? 3 : 1

    this.headerBox = blessed.box({
      parent: this.el,
      top: 0,
      left: 0,
      right: 0,
      height: headerHeight,
      border: {
        type: 'line',
        fg: resolveBlessedColor(this.getThemeColor('border'), {}) as unknown as number,
      },
      style: {
        bg: this.getThemeColor('headerBg'),
        fg: this.getThemeColor('header'),
      },
    })

    const fileName = this.diffData.fileName || 'Untitled'
    const stats = this.diffData.stats

    let headerContent = `{center}{bold}${fileName}{/bold}{/center}`

    if (this.props.showStats) {
      const additionsText = `{green-fg}+${stats.additions}{/green-fg}`
      const deletionsText = `{red-fg}-${stats.deletions}{/red-fg}`
      const modificationsText = stats.modifications > 0 ? `{yellow-fg}~${stats.modifications}{/yellow-fg}` : ''

      headerContent += `\n{center}${additionsText} ${deletionsText} ${modificationsText}{/center}`
    }

    this.headerBox.setContent(headerContent)
  }

  private createSplitLayout(): void {
    const headerOffset = this.props.showStats && this.diffData ? 3 : 0
    const panelTop = headerOffset

    // Left panel (original content)
    this.leftPanel = blessed.box({
      parent: this.el,
      label: ' Original ',
      top: panelTop,
      left: 0,
      width: '50%',
      bottom: 0,
      border: {
        type: 'line',
        fg: resolveBlessedColor(this.getThemeColor('removed'), {}) as unknown as number,
      },
      scrollable: true,
      keys: true,
      mouse: true,
      style: {
        bg: this.getThemeColor('removedBg'),
        fg: this.getThemeColor('foreground'),
      },
    })

    // Right panel (new content)
    this.rightPanel = blessed.box({
      parent: this.el,
      label: ' Modified ',
      top: panelTop,
      left: '50%',
      right: 0,
      bottom: 0,
      border: {
        type: 'line',
        fg: resolveBlessedColor(this.getThemeColor('added'), {}) as unknown as number,
      },
      scrollable: true,
      keys: true,
      mouse: true,
      style: {
        bg: this.getThemeColor('addedBg'),
        fg: this.getThemeColor('foreground'),
      },
    })

    // Synchronize scrolling
    this.leftPanel.on('scroll', () => {
      if (this.rightPanel && this.leftPanel) {
        this.rightPanel.scrollTo(this.leftPanel.getScrollPerc())
      }
    })

    this.rightPanel.on('scroll', () => {
      if (this.leftPanel && this.rightPanel) {
        this.leftPanel.scrollTo(this.rightPanel.getScrollPerc())
      }
    })
  }

  private createUnifiedLayout(): void {
    const headerOffset = this.props.showStats && this.diffData ? 3 : 0

    this.leftPanel = blessed.box({
      parent: this.el,
      label: ' Diff ',
      top: headerOffset,
      left: 0,
      right: 0,
      bottom: 0,
      border: {
        type: 'line',
        fg: resolveBlessedColor(this.getThemeColor('border'), {}) as unknown as number,
      },
      scrollable: true,
      keys: true,
      mouse: true,
      style: {
        bg: this.getThemeColor('background'),
        fg: this.getThemeColor('foreground'),
      },
    })
  }

  private setupKeyHandlers(): void {
    // Navigation keys
    this.el.key(['left', 'h'], () => {
      if (this.props.layout === 'split' && this.leftPanel) {
        this.leftPanel.focus()
      }
    })

    this.el.key(['right', 'l'], () => {
      if (this.props.layout === 'split' && this.rightPanel) {
        this.rightPanel.focus()
      }
    })

    // Toggle layout
    this.el.key(['s'], () => {
      this.props.layout = this.props.layout === 'split' ? 'unified' : 'split'
      this.recreateLayout()
    })

    // Collapse/expand
    if (this.props.collapsible) {
      this.el.key(['c'], () => {
        this.toggleCollapse()
      })
    }
  }

  private recreateLayout(): void {
    // Clear existing panels
    if (this.leftPanel) {
      this.leftPanel.destroy()
      this.leftPanel = undefined
    }
    if (this.rightPanel) {
      this.rightPanel.destroy()
      this.rightPanel = undefined
    }

    this.createLayout()
    this.render()
    this.el.screen?.render()
  }

  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed

    if (this.isCollapsed) {
      this.el.height = 3 // Just header
      this.props.onCollapse?.()
    } else {
      this.el.height = this.props.height || '30%'
      this.props.onExpand?.()
    }

    this.el.screen?.render()
  }

  private generateDiffData(oldContent: string, newContent: string, fileName?: string, language?: string): DiffData {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // Simple line-by-line diff algorithm
    const lines: DiffLine[] = []
    const maxLines = Math.max(oldLines.length, newLines.length)

    let additions = 0
    let deletions = 0
    let modifications = 0

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]

      if (oldLine === undefined) {
        // Added line
        lines.push({
          type: 'added',
          newLineNumber: i + 1,
          content: newLine,
        })
        additions++
      } else if (newLine === undefined) {
        // Removed line
        lines.push({
          type: 'removed',
          oldLineNumber: i + 1,
          content: oldLine,
        })
        deletions++
      } else if (oldLine === newLine) {
        // Unchanged line
        lines.push({
          type: 'unchanged',
          oldLineNumber: i + 1,
          newLineNumber: i + 1,
          content: oldLine,
        })
      } else {
        // Modified line
        lines.push({
          type: 'modified',
          oldLineNumber: i + 1,
          newLineNumber: i + 1,
          content: newLine,
          originalContent: oldLine,
        })
        modifications++
      }
    }

    return {
      fileName,
      language,
      oldContent,
      newContent,
      lines,
      stats: { additions, deletions, modifications },
    }
  }

  private render(): void {
    if (!this.diffData) return

    if (this.props.layout === 'split') {
      this.renderSplitView()
    } else {
      this.renderUnifiedView()
    }
  }

  private renderSplitView(): void {
    if (!this.diffData || !this.leftPanel || !this.rightPanel) return

    const leftLines: string[] = []
    const rightLines: string[] = []

    this.diffData.lines.forEach((line, _index) => {
      const lineNumStr = this.props.showLineNumbers ? `${(line.oldLineNumber || '').toString().padStart(4)} ` : ''

      const rightLineNumStr = this.props.showLineNumbers ? `${(line.newLineNumber || '').toString().padStart(4)} ` : ''

      switch (line.type) {
        case 'unchanged':
          leftLines.push(`${lineNumStr}${line.content}`)
          rightLines.push(`${rightLineNumStr}${line.content}`)
          break
        case 'removed':
          leftLines.push(`{red-bg}${lineNumStr}- ${line.content}{/red-bg}`)
          rightLines.push('')
          break
        case 'added':
          leftLines.push('')
          rightLines.push(`{green-bg}${rightLineNumStr}+ ${line.content}{/green-bg}`)
          break
        case 'modified':
          leftLines.push(`{red-bg}${lineNumStr}- ${line.originalContent}{/red-bg}`)
          rightLines.push(`{green-bg}${rightLineNumStr}+ ${line.content}{/green-bg}`)
          break
      }
    })

    this.leftPanel.setContent(leftLines.join('\n'))
    this.rightPanel.setContent(rightLines.join('\n'))
  }

  private renderUnifiedView(): void {
    if (!this.diffData || !this.leftPanel) return

    const lines: string[] = []

    this.diffData.lines.forEach((line) => {
      const lineNumStr = this.props.showLineNumbers
        ? `${(line.oldLineNumber || line.newLineNumber || '').toString().padStart(4)} `
        : ''

      switch (line.type) {
        case 'unchanged':
          lines.push(`${lineNumStr} ${line.content}`)
          break
        case 'removed':
          lines.push(`{red-fg}${lineNumStr}- ${line.content}{/red-fg}`)
          break
        case 'added':
          lines.push(`{green-fg}${lineNumStr}+ ${line.content}{/green-fg}`)
          break
        case 'modified':
          if (line.originalContent) {
            lines.push(`{red-fg}${lineNumStr}- ${line.originalContent}{/red-fg}`)
          }
          lines.push(`{green-fg}${lineNumStr}+ ${line.content}{/green-fg}`)
          break
      }
    })

    this.leftPanel.setContent(lines.join('\n'))
  }

  private getThemeColor(colorType: string): string {
    const themes = {
      dark: {
        background: '#0f172a',
        foreground: '#f8fafc',
        border: '#374151',
        header: '#60a5fa',
        headerBg: '#1e293b',
        added: '#10b981',
        addedBg: '#064e3b',
        removed: '#ef4444',
        removedBg: '#7f1d1d',
      },
      light: {
        background: '#ffffff',
        foreground: '#1f2937',
        border: '#d1d5db',
        header: '#2563eb',
        headerBg: '#f3f4f6',
        added: '#059669',
        addedBg: '#d1fae5',
        removed: '#dc2626',
        removedBg: '#fee2e2',
      },
    }

    const theme = themes[this.props.diffTheme || 'dark']
    return theme[colorType as keyof typeof theme] || theme.foreground
  }

  // Public methods
  public setDiff(oldContent: string, newContent: string, fileName?: string, language?: string): void {
    this.diffData = this.generateDiffData(oldContent, newContent, fileName, language)

    // Recreate header if needed
    if (this.headerBox) {
      this.headerBox.destroy()
      this.headerBox = undefined
    }

    if (this.props.showStats) {
      this.createHeader()
    }

    this.render()
    this.el.screen?.render()
  }

  public setDiffData(diffData: DiffData): void {
    this.diffData = diffData
    this.render()
    this.el.screen?.render()
  }

  public getDiffData(): DiffData | null {
    return this.diffData
  }

  public toggleLayout(): void {
    this.props.layout = this.props.layout === 'split' ? 'unified' : 'split'
    this.recreateLayout()
  }

  public focus(): void {
    this.el.focus()
  }
}

export default GitDiffBlock
