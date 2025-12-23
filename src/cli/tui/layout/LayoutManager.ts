/**
 * Layout Manager
 * Manages panel layout and positioning for TUI
 */

import { eventBus } from '../core/EventBus'
import { tuiState, TUILayout } from '../core/TUIState'
import { BaseElement } from '../elements/base/BaseElement'

export interface PanelLayout {
  id: string
  element: BaseElement
  x: number
  y: number
  width: number
  height: number
  weight?: number
  minWidth?: number
  minHeight?: number
  resizeHandle?: boolean
  pinned?: boolean
}

export interface LayoutConfig {
  id: string
  mode: TUILayout['mode']
  panels: PanelLayout[]
  gaps?: number
  borderWidth?: number
  padding?: number
}

export class LayoutManager {
  private layouts = new Map<string, LayoutConfig>()
  private currentLayout: LayoutConfig | null = null
  private rootElement: any = null

  constructor() {
    this.setupEventHandlers()
    this.registerDefaultLayouts()
  }

  private setupEventHandlers(): void {
    eventBus.on('tui:layout:changed', (layout: TUILayout) => {
      this.onLayoutChanged(layout)
    })

    eventBus.on('tui:panel:added', (panelId: string) => {
      this.onPanelAdded(panelId)
    })

    eventBus.on('tui:panel:removed', (panelId: string) => {
      this.onPanelRemoved(panelId)
    })

    eventBus.on('tui:size:changed', (size: any) => {
      this.onSizeChanged(size)
    })

    eventBus.on('tui:panel:split', (data: any) => {
      this.splitPanel(data.panelId)
    })
  }

  private registerDefaultLayouts(): void {
    // Single panel layout
    this.layouts.set('single', {
      id: 'single',
      mode: 'single',
      panels: [],
      gaps: 1,
      borderWidth: 1,
      padding: 1
    })

    // Dual panel layout
    this.layouts.set('dual', {
      id: 'dual',
      mode: 'dual',
      panels: [],
      gaps: 1,
      borderWidth: 1,
      padding: 1
    })

    // Triple panel layout
    this.layouts.set('triple', {
      id: 'triple',
      mode: 'triple',
      panels: [],
      gaps: 1,
      borderWidth: 1,
      padding: 1
    })

    // Quad panel layout
    this.layouts.set('quad', {
      id: 'quad',
      mode: 'quad',
      panels: [],
      gaps: 1,
      borderWidth: 1,
      padding: 1
    })
  }

  /**
   * Set root element for layout
   */
  setRootElement(element: any): void {
    this.rootElement = element
  }

  /**
   * Apply layout by ID
   */
  applyLayout(layoutId: string): void {
    const layout = this.layouts.get(layoutId)
    if (!layout) {
      console.warn(`Layout ${layoutId} not found`)
      return
    }

    this.currentLayout = { ...layout, panels: [...layout.panels] }
    this.calculateLayout()
    this.renderLayout()
    this.updateState()
  }

  /**
   * Add panel to current layout
   */
  addPanel(panel: PanelLayout): void {
    if (!this.currentLayout) {
      this.applyLayout('single')
    }

    if (!this.currentLayout) return

    // Check if panel already exists
    const existingIndex = this.currentLayout.panels.findIndex(p => p.id === panel.id)
    if (existingIndex > -1) {
      this.currentLayout.panels[existingIndex] = panel
    } else {
      this.currentLayout.panels.push(panel)
    }

    this.calculateLayout()
    this.renderLayout()
    this.updateState()
  }

  /**
   * Remove panel from current layout
   */
  removePanel(panelId: string): void {
    if (!this.currentLayout) return

    const index = this.currentLayout.panels.findIndex(p => p.id === panelId)
    if (index > -1) {
      this.currentLayout.panels.splice(index, 1)
      this.calculateLayout()
      this.renderLayout()
      this.updateState()
    }
  }

  /**
   * Resize panel
   */
  resizePanel(panelId: string, width: number, height: number): void {
    if (!this.currentLayout) return

    const panel = this.currentLayout.panels.find(p => p.id === panelId)
    if (!panel) return

    panel.width = Math.max(panel.minWidth || 0, width)
    panel.height = Math.max(panel.minHeight || 0, height)

    this.calculateLayout()
    this.renderLayout()
  }

  /**
   * Split panel
   */
  splitPanel(panelId: string, direction: 'horizontal' | 'vertical' = 'vertical'): void {
    if (!this.currentLayout) return

    const panel = this.currentLayout.panels.find(p => p.id === panelId)
    if (!panel) return

    // Create new panel
    const newPanelId = `${panelId}-split-${Date.now()}`
    const newPanel: PanelLayout = {
      id: newPanelId,
      element: panel.element, // TODO: Create new element or clone
      x: panel.x + (direction === 'vertical' ? panel.width / 2 : 0),
      y: panel.y + (direction === 'horizontal' ? panel.height / 2 : 0),
      width: direction === 'vertical' ? panel.width / 2 : panel.width,
      height: direction === 'horizontal' ? panel.height / 2 : panel.height,
      weight: panel.weight,
      minWidth: panel.minWidth,
      minHeight: panel.minHeight
    }

    // Resize original panel
    if (direction === 'vertical') {
      panel.width = panel.width / 2
    } else {
      panel.height = panel.height / 2
    }

    // Add new panel
    this.currentLayout.panels.push(newPanel)

    this.calculateLayout()
    this.renderLayout()
    this.updateState()

    // Focus new panel
    eventBus.emit('tui:panel:focus', { panelId: newPanelId })
  }

  /**
   * Merge panels
   */
  mergePanels(panelId1: string, panelId2: string): void {
    if (!this.currentLayout) return

    const panel1 = this.currentLayout.panels.find(p => p.id === panelId1)
    const panel2 = this.currentLayout.panels.find(p => p.id === panelId2)

    if (!panel1 || !panel2) return

    // TODO: Implement panel merging logic
    // For now, just remove the second panel
    this.removePanel(panelId2)
  }

  /**
   * Auto-layout based on visible panels
   */
  autoLayout(panels: BaseElement[]): LayoutConfig {
    const visiblePanels = panels.filter(p => p.isElementVisible())
    const count = visiblePanels.length

    let layoutId = 'single'
    if (count === 2) layoutId = 'dual'
    else if (count === 3) layoutId = 'triple'
    else if (count >= 4) layoutId = 'quad'

    this.applyLayout(layoutId)

    // Add panels to layout
    visiblePanels.forEach((panel, index) => {
      const panelLayout: PanelLayout = {
        id: panel.getId(),
        element: panel,
        x: 0, y: 0, width: 0, height: 0,
        weight: 1
      }
      this.addPanel(panelLayout)
    })

    return this.currentLayout!
  }

  /**
   * Calculate layout positions
   */
  private calculateLayout(): void {
    if (!this.currentLayout || !this.rootElement) return

    const state = tuiState.getState()
    const { width: screenWidth, height: screenHeight } = state.size
    const { padding = 1, gaps = 1 } = this.currentLayout

    const panels = this.currentLayout.panels.filter(p => !p.pinned)
    const pinnedPanels = this.currentLayout.panels.filter(p => p.pinned)

    // Calculate available space
    let availableWidth = screenWidth - (padding * 2) - (gaps * (panels.length - 1))
    let availableHeight = screenHeight - (padding * 2) - (gaps * (panels.length - 1))

    // Handle pinned panels first (they don't take up layout space)
    // TODO: Position pinned panels separately

    if (panels.length === 0) return

    // Calculate layout based on mode
    switch (this.currentLayout.mode) {
      case 'single':
        panels.forEach(panel => {
          panel.x = padding
          panel.y = padding
          panel.width = availableWidth
          panel.height = availableHeight
        })
        break

      case 'dual':
        if (panels.length >= 2) {
          const halfWidth = (availableWidth - gaps) / 2
          panels[0].x = padding
          panels[0].y = padding
          panels[0].width = halfWidth
          panels[0].height = availableHeight

          panels[1].x = padding + halfWidth + gaps
          panels[1].y = padding
          panels[1].width = halfWidth
          panels[1].height = availableHeight
        }
        break

      case 'triple':
        if (panels.length >= 3) {
          const thirdWidth = (availableWidth - gaps * 2) / 3
          panels.forEach((panel, index) => {
            panel.x = padding + (thirdWidth + gaps) * index
            panel.y = padding
            panel.width = thirdWidth
            panel.height = availableHeight
          })
        }
        break

      case 'quad':
        if (panels.length >= 4) {
          const halfWidth = (availableWidth - gaps) / 2
          const halfHeight = (availableHeight - gaps) / 2

          // Top row
          panels[0].x = padding
          panels[0].y = padding
          panels[0].width = halfWidth
          panels[0].height = halfHeight

          panels[1].x = padding + halfWidth + gaps
          panels[1].y = padding
          panels[1].width = halfWidth
          panels[1].height = halfHeight

          // Bottom row
          if (panels[2]) {
            panels[2].x = padding
            panels[2].y = padding + halfHeight + gaps
            panels[2].width = halfWidth
            panels[2].height = halfHeight
          }

          if (panels[3]) {
            panels[3].x = padding + halfWidth + gaps
            panels[3].y = padding + halfHeight + gaps
            panels[3].width = halfWidth
            panels[3].height = halfHeight
          }
        }
        break

      case 'custom':
        // TODO: Implement custom layout logic
        break
    }
  }

  /**
   * Render layout to screen
   */
  private renderLayout(): void {
    if (!this.currentLayout) return

    this.currentLayout.panels.forEach(panel => {
      const element = panel.element.getElement()
      if (element) {
        element.width = panel.width
        element.height = panel.height
        // TODO: Set position if OpenTUI supports it
      }
    })
  }

  /**
   * Update state with current layout
   */
  private updateState(): void {
    if (!this.currentLayout) return

    tuiState.updateLayout(
      this.currentLayout.mode,
      this.currentLayout.panels[0]?.id || null
    )

    // Update panel list in state
    const panelIds = this.currentLayout.panels.map(p => p.id)
    panelIds.forEach(id => tuiState.addPanel(id))
  }

  /**
   * Handle layout change event
   */
  private onLayoutChanged(layout: TUILayout): void {
    if (this.currentLayout?.id === layout.mode) return

    this.applyLayout(layout.mode)
  }

  /**
   * Handle panel added event
   */
  private onPanelAdded(panelId: string): void {
    const panel = tuiState.getPanel(panelId)
    if (panel) {
      const panelLayout: PanelLayout = {
        id: panelId,
        element: panel,
        x: 0, y: 0, width: 0, height: 0,
        weight: 1
      }
      this.addPanel(panelLayout)
    }
  }

  /**
   * Handle panel removed event
   */
  private onPanelRemoved(panelId: string): void {
    this.removePanel(panelId)
  }

  /**
   * Handle size change event
   */
  private onSizeChanged(size: any): void {
    this.calculateLayout()
    this.renderLayout()
  }

  /**
   * Get current layout
   */
  getCurrentLayout(): LayoutConfig | null {
    return this.currentLayout
  }

  /**
   * Get layout by ID
   */
  getLayout(id: string): LayoutConfig | undefined {
    return this.layouts.get(id)
  }

  /**
   * Register new layout
   */
  registerLayout(layout: LayoutConfig): void {
    this.layouts.set(layout.id, layout)
  }

  /**
   * Unregister layout
   */
  unregisterLayout(id: string): void {
    this.layouts.delete(id)
  }
}

// Global layout manager instance
export const layoutManager = new LayoutManager()
