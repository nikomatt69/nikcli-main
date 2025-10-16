/**
 * Tests for StreamManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StreamManager } from '../core/stream-manager'
import type { StreamConfig } from '../types'

describe('StreamManager', () => {
  let streamManager: StreamManager

  beforeEach(() => {
    streamManager = new StreamManager({
      enableRealTimeUpdates: true,
      tokenTrackingEnabled: true,
      maxStreamDuration: 300000,
      bufferSize: 1000,
      enableBackgroundAgents: true,
      enableProgressTracking: true,
    })
  })

  describe('Stream Lifecycle', () => {
    it('should start stream successfully', async () => {
      await expect(streamManager.startStream()).resolves.not.toThrow()
      expect(streamManager['isStreaming']).toBe(true)
    })

    it('should stop stream successfully', () => {
      streamManager.stopStream()
      expect(streamManager['isStreaming']).toBe(false)
    })

    it('should not start stream if already running', async () => {
      await streamManager.startStream()
      const consoleSpy = vi.spyOn(console, 'warn')
      
      await streamManager.startStream()
      expect(consoleSpy).toHaveBeenCalledWith('Stream is already running')
    })

    it('should not stop stream if not running', () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      
      streamManager.stopStream()
      expect(consoleSpy).toHaveBeenCalledWith('Stream is not running')
    })
  })

  describe('Message Handling', () => {
    beforeEach(async () => {
      await streamManager.startStream()
    })

    it('should send message successfully', async () => {
      await expect(streamManager.sendMessage('Test message')).resolves.not.toThrow()
    })

    it('should throw error when sending message without stream', async () => {
      streamManager.stopStream()
      await expect(streamManager.sendMessage('Test message')).rejects.toThrow(
        'Stream is not running'
      )
    })

    it('should emit stream events', (done) => {
      streamManager.addEventListener('streamEvent', (event) => {
        expect(event.type).toBe('text_delta')
        expect(event.content).toBe('Test message')
        done()
      })

      streamManager.sendMessage('Test message')
    })
  })

  describe('Event Management', () => {
    beforeEach(async () => {
      await streamManager.startStream()
    })

    it('should get events', () => {
      const events = streamManager.getEvents()
      expect(Array.isArray(events)).toBe(true)
    })

    it('should get events by type', () => {
      streamManager.emitStreamEvent('text_delta', 'Test message')
      streamManager.emitStreamEvent('error', 'Test error')

      const textEvents = streamManager.getEventsByType('text_delta')
      const errorEvents = streamManager.getEventsByType('error')

      expect(textEvents).toHaveLength(1)
      expect(errorEvents).toHaveLength(1)
      expect(textEvents[0].content).toBe('Test message')
      expect(errorEvents[0].content).toBe('Test error')
    })

    it('should get events by agent', () => {
      streamManager.emitStreamEvent('text_delta', 'Test message', {}, 'agent-1')
      streamManager.emitStreamEvent('text_delta', 'Another message', {}, 'agent-2')

      const agent1Events = streamManager.getEventsByAgent('agent-1')
      const agent2Events = streamManager.getEventsByAgent('agent-2')

      expect(agent1Events).toHaveLength(1)
      expect(agent2Events).toHaveLength(1)
    })

    it('should clear events', () => {
      streamManager.emitStreamEvent('text_delta', 'Test message')
      expect(streamManager.getEvents()).toHaveLength(1)

      streamManager.clearEvents()
      expect(streamManager.getEvents()).toHaveLength(0)
    })
  })

  describe('Simulation Methods', () => {
    beforeEach(async () => {
      await streamManager.startStream()
    })

    it('should simulate thinking', async () => {
      const startTime = Date.now()
      await streamManager.simulateThinking(1000)
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(1000)
    })

    it('should simulate tool call', async () => {
      const startTime = Date.now()
      await streamManager.simulateToolCall('test-tool', { arg: 'value' })
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(500)
    })
  })

  describe('Statistics', () => {
    beforeEach(async () => {
      await streamManager.startStream()
    })

    it('should return correct statistics', () => {
      const stats = streamManager.getStats()
      expect(stats).toHaveProperty('isStreaming')
      expect(stats).toHaveProperty('totalEvents')
      expect(stats).toHaveProperty('bufferSize')
      expect(stats).toHaveProperty('duration')
      expect(stats).toHaveProperty('eventsByType')
      expect(stats.isStreaming).toBe(true)
    })
  })

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableRealTimeUpdates: false,
        bufferSize: 500,
      }

      streamManager.updateConfig(newConfig)
      expect(streamManager['config'].enableRealTimeUpdates).toBe(false)
      expect(streamManager['config'].bufferSize).toBe(500)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup successfully', async () => {
      await streamManager.startStream()
      await expect(streamManager.cleanup()).resolves.not.toThrow()
    })
  })
})