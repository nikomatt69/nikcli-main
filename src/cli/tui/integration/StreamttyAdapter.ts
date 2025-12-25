/**
 * StreamttyAdapter
 * Bridges existing StreamttyService with OpenTUI elements
 */

import { type EventBus, eventBus } from '../core/EventBus'
import { tuiState } from '../core/TUIState'
import { type ElementManager, elementManager } from '../elements/base/ElementManager'
import { StreamElement } from '../elements/specialized/StreamElement'

// Mock StreamttyService types (will be replaced with actual imports)
export interface ChunkType {
  type: 'text' | 'error' | 'success' | 'info' | 'data'
}

export interface StreamEvent {
  type: string
  content?: string
  error?: string
  data?: any
  tool?: string
}

export interface StreamttyService {
  streamChunk(chunk: string, type: ChunkType): Promise<void>
  streamAISDKEvent(event: StreamEvent): Promise<void>
}

// Mock streamttyService (will be replaced with actual import)
const streamttyService: StreamttyService = {
  async streamChunk(chunk: string, type: ChunkType): Promise<void> {
    eventBus.emit('streamtty:chunk', { chunk, type })
  },

  async streamAISDKEvent(event: StreamEvent): Promise<void> {
    eventBus.emit('streamtty:ai-event', event)
  },
}

export class StreamttyAdapter {
  private streamElements = new Map<string, StreamElement>()
  private defaultStreamElement: StreamElement | null = null

  constructor(
    private elementManager: ElementManager,
    private eventBus: EventBus
  ) {
    this.setupIntegration()
  }

  private setupIntegration(): void {
    // Create default stream element
    this.createDefaultStreamElement()

    // Listen to existing streamtty events and forward to OpenTUI
    this.eventBus.on('streamtty:batch', (data: any) => {
      this.handleBatch(data)
    })

    this.eventBus.on('streamtty:progress', (data: any) => {
      this.handleProgress(data)
    })

    this.eventBus.on('streamtty:complete', (data: any) => {
      this.handleComplete(data)
    })

    this.eventBus.on('streamtty:error', (data: any) => {
      this.handleError(data)
    })
  }

  /**
   * Create default stream element
   */
  private createDefaultStreamElement(): void {
    const streamElement = new StreamElement(
      {
        id: 'main-stream',
        type: 'stream',
        source: 'streamtty',
        title: 'Output',
        width: '100%',
        height: '100%',
        autoScroll: true,
        preserveHistory: true,
        maxLines: 1000,
      },
      this.eventBus,
      tuiState.getState().theme
    )

    this.elementManager.registerElement(streamElement)
    this.defaultStreamElement = streamElement
    this.streamElements.set('main-stream', streamElement)
  }

  /**
   * Create named stream element
   */
  createStreamElement(id: string, source: 'streamtty' | 'ai' | 'tool' | 'log', title?: string): StreamElement {
    const streamElement = new StreamElement(
      {
        id,
        type: 'stream',
        source,
        title: title || `${source} output`,
        width: '100%',
        height: '100%',
        autoScroll: true,
        preserveHistory: true,
        maxLines: 1000,
      },
      this.eventBus,
      tuiState.getState().theme
    )

    this.elementManager.registerElement(streamElement)
    this.streamElements.set(id, streamElement)

    return streamElement
  }

  /**
   * Get stream element by ID
   */
  getStreamElement(id: string): StreamElement | undefined {
    return this.streamElements.get(id)
  }

  /**
   * Get default stream element
   */
  getDefaultStreamElement(): StreamElement | null {
    return this.defaultStreamElement
  }

  /**
   * Connect existing StreamttyService
   */
  connect(): void {
    // Wrap original methods to emit events
    const originalStreamChunk = streamttyService.streamChunk.bind(streamttyService)
    streamttyService.streamChunk = async (chunk: string, type: ChunkType) => {
      this.eventBus.emit('streamtty:chunk', { chunk, type })
      return originalStreamChunk(chunk, type)
    }

    const originalStreamAISDKEvent = streamttyService.streamAISDKEvent.bind(streamttyService)
    streamttyService.streamAISDKEvent = async (event: StreamEvent) => {
      this.eventBus.emit('streamtty:ai-event', event)
      return originalStreamAISDKEvent(event)
    }
  }

  /**
   * Handle batch streaming
   */
  private handleBatch(data: any): void {
    const { chunks, source = 'main-stream' } = data

    const streamElement = this.streamElements.get(source)
    if (streamElement && Array.isArray(chunks)) {
      chunks.forEach((chunk: any) => {
        streamElement.streamChunk(chunk.content, chunk.type)
      })
    }
  }

  /**
   * Handle progress updates
   */
  private handleProgress(data: any): void {
    const { progress, source = 'main-stream' } = data

    const streamElement = this.streamElements.get(source)
    if (streamElement) {
      streamElement.streamChunk(`Progress: ${progress}%`, 'info')
    }
  }

  /**
   * Handle completion
   */
  private handleComplete(data: any): void {
    const { source = 'main-stream', duration, stats } = data

    const streamElement = this.streamElements.get(source)
    if (streamElement) {
      let message = 'Completed'
      if (duration) {
        message += ` in ${duration}ms`
      }
      if (stats) {
        message += ` - ${JSON.stringify(stats)}`
      }
      streamElement.streamChunk(message, 'success')
    }
  }

  /**
   * Handle errors
   */
  private handleError(data: any): void {
    const { error, source = 'main-stream' } = data

    const streamElement = this.streamElements.get(source)
    if (streamElement) {
      streamElement.streamChunk(`Error: ${error}`, 'error')
    }
  }

  /**
   * Stream to specific element
   */
  streamToElement(
    elementId: string,
    content: string,
    type: 'text' | 'error' | 'success' | 'info' | 'data' = 'text'
  ): void {
    const element = this.streamElements.get(elementId)
    if (element) {
      element.streamChunk(content, type)
    }
  }

  /**
   * Stream to default element
   */
  stream(content: string, type: 'text' | 'error' | 'success' | 'info' | 'data' = 'text'): void {
    if (this.defaultStreamElement) {
      this.defaultStreamElement.streamChunk(content, type)
    }
  }

  /**
   * Clear stream
   */
  clearStream(elementId?: string): void {
    if (elementId) {
      const element = this.streamElements.get(elementId)
      if (element) {
        element.clear()
      }
    } else if (this.defaultStreamElement) {
      this.defaultStreamElement.clear()
    }
  }

  /**
   * Remove stream element
   */
  removeStreamElement(id: string): void {
    const element = this.streamElements.get(id)
    if (element) {
      this.elementManager.unregisterElement(id)
      this.streamElements.delete(id)

      if (this.defaultStreamElement?.getId() === id) {
        this.defaultStreamElement = null
      }
    }
  }

  /**
   * Get all stream elements
   */
  getStreamElements(): Map<string, StreamElement> {
    return new Map(this.streamElements)
  }

  /**
   * Update stream element config
   */
  updateStreamConfig(
    id: string,
    config: Partial<{
      autoScroll: boolean
      preserveHistory: boolean
      maxLines: number
      batchSize: number
      batchTimeout: number
    }>
  ): void {
    const element = this.streamElements.get(id)
    if (element) {
      element.update({ type: 'config', ...config })
    }
  }

  /**
   * Get StreamttyService instance
   */
  getStreamttyService(): StreamttyService {
    return streamttyService
  }
}

// Global adapter instance
export const streamttyAdapter = new StreamttyAdapter(elementManager, eventBus)
