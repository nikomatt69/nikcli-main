/**
 * Diff Panel
 * Displays file diffs in a TUI panel
 */

import { eventBus } from '../../core/EventBus'
import { PanelElement, type PanelElementConfig } from '../specialized/PanelElement'

export interface DiffPanelConfig extends PanelElementConfig {
  panelType: 'diff-panel'
  oldContent?: string
  newContent?: string
  filename?: string
}

export class DiffPanel extends PanelElement {
  private oldContent: string = ''
  private newContent: string = ''
  private filename: string = ''

  constructor(config: DiffPanelConfig, eventBus: any, theme: any) {
    super({ ...config, type: 'panel' }, eventBus, theme)

    this.oldContent = config.oldContent || ''
    this.newContent = config.newContent || ''
    this.filename = config.filename || ''
  }

  protected onMount(): void {
    super.onMount()

    // Listen to diff events
    eventBus.on('diff:update', (data: any) => {
      if (data.filename === this.filename) {
        this.updateDiff(data.oldContent, data.newContent)
      }
    })

    // Initial render
    this.renderDiff(this.oldContent, this.newContent)
  }

  /**
   * Update diff content
   */
  updateDiff(oldContent: string, newContent: string): void {
    this.oldContent = oldContent
    this.newContent = newContent
    this.renderDiff(oldContent, newContent)
  }

  /**
   * Load diff from file
   */
  async loadDiff(filename: string, oldContent: string, newContent: string): Promise<void> {
    this.filename = filename
    this.updateTitle(`Diff: ${filename}`)
    this.updateDiff(oldContent, newContent)
  }

  protected onUpdate(data: any): void {
    if (data.type === 'diff') {
      this.updateDiff(data.oldContent, data.newContent)
    } else {
      super.onUpdate(data)
    }
  }

  protected onInput(key: string): boolean {
    switch (key) {
      case 'tab':
        // Toggle between old and new content view
        this.toggleDiffView()
        return true

      case 'r':
        // Refresh diff
        this.refreshDiff()
        return true

      case 's':
        // Save diff
        this.saveDiff()
        return true
    }

    return super.onInput(key)
  }

  /**
   * Toggle between old/new/both view
   */
  private toggleDiffView(): void {
    // TODO: Implement view toggle
    eventBus.emit('tui:panel:action', {
      panelId: (this.config as DiffPanelConfig).panelId,
      action: 'toggle-view',
    })
  }

  /**
   * Refresh diff
   */
  private refreshDiff(): void {
    eventBus.emit('tui:panel:action', {
      panelId: (this.config as DiffPanelConfig).panelId,
      action: 'refresh',
    })
  }

  /**
   * Save diff to file
   */
  private saveDiff(): void {
    eventBus.emit('tui:panel:action', {
      panelId: (this.config as DiffPanelConfig).panelId,
      action: 'save',
    })
  }

  /**
   * Get diff statistics
   */
  getDiffStats(): { additions: number; deletions: number; changes: number } {
    // Simple diff stats calculation
    const additions = (this.newContent.match(/^\+/gm) || []).length
    const deletions = (this.newContent.match(/^-/gm) || []).length
    const changes = additions + deletions

    return { additions, deletions, changes }
  }
}
