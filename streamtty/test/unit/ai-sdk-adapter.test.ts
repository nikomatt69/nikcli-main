/**
 * AI SDK Adapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AISDKStreamAdapter, AISDKStreamAdapterOptions } from '../../src/ai-sdk-adapter';
import { StreamEvent } from '../../src/types/stream-events';
import { 
  createMockTextDeltaEvent,
  createMockToolCallEvent,
  createMockToolResultEvent,
  createMockThinkingEvent,
  createMockReasoningEvent,
  createMockStatusEvent,
  createMockErrorEvent,
  createMockAIStream,
  createStreamFromEvents
} from '../mocks/ai-streams';

describe('AISDKStreamAdapter', () => {
  let mockRenderer: { stream: ReturnType<typeof vi.fn> };
  let adapter: AISDKStreamAdapter;

  beforeEach(() => {
    mockRenderer = { stream: vi.fn() };
    adapter = new AISDKStreamAdapter(mockRenderer);
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const options = adapter.getOptions();
      
      expect(options.parseIncompleteMarkdown).toBe(true);
      expect(options.syntaxHighlight).toBe(true);
      expect(options.formatToolCalls).toBe(true);
      expect(options.showThinking).toBe(true);
      expect(options.maxToolResultLength).toBe(200);
      expect(options.renderTimestamps).toBe(false);
    });

    it('should accept custom options', () => {
      const customOptions: AISDKStreamAdapterOptions = {
        formatToolCalls: false,
        showThinking: false,
        maxToolResultLength: 500,
        renderTimestamps: true
      };
      
      const customAdapter = new AISDKStreamAdapter(mockRenderer, customOptions);
      const options = customAdapter.getOptions();
      
      expect(options.formatToolCalls).toBe(false);
      expect(options.showThinking).toBe(false);
      expect(options.maxToolResultLength).toBe(500);
      expect(options.renderTimestamps).toBe(true);
    });
  });

  describe('processEvent', () => {
    it('should process text_delta events', async () => {
      const event = createMockTextDeltaEvent('Hello world');
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith('Hello world');
    });

    it('should process tool_call events', async () => {
      const event = createMockToolCallEvent('read_file', { path: 'test.txt' });
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('🔧 **read_file**')
      );
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('```json')
      );
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('"path": "test.txt"')
      );
    });

    it('should process tool_result events', async () => {
      const event = createMockToolResultEvent('File content');
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('✓ **Result**: File content')
      );
    });

    it('should process thinking events', async () => {
      const event = createMockThinkingEvent('Let me think...');
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('> 💭 *Let me think...*')
      );
    });

    it('should process reasoning events', async () => {
      const event = createMockReasoningEvent('Based on analysis...');
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('> ⚡ *Based on analysis...*')
      );
    });

    it('should process status events', async () => {
      const event = createMockStatusEvent('Processing...', 'running');
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('🔄 **Processing...**')
      );
    });

    it('should process error events', async () => {
      const error = new Error('Test error');
      const event = createMockErrorEvent('Something went wrong', error);
      
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).toHaveBeenCalledWith(
        expect.stringContaining('❌ **Error** (Error): Something went wrong')
      );
    });

    it('should handle invalid events gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await adapter.processEvent({} as StreamEvent);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid stream event:', 
        expect.any(Object)
      );
      expect(mockRenderer.stream).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should respect showThinking option', async () => {
      adapter.updateOptions({ showThinking: false });
      
      const event = createMockThinkingEvent('Let me think...');
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).not.toHaveBeenCalled();
    });

    it('should respect formatToolCalls option', async () => {
      adapter.updateOptions({ formatToolCalls: false });
      
      const event = createMockToolCallEvent('read_file', { path: 'test.txt' });
      await adapter.processEvent(event);
      
      expect(mockRenderer.stream).not.toHaveBeenCalled();
    });
  });

  describe('handleAISDKStream', () => {
    it('should handle a complete AI stream', async () => {
      const stream = createMockAIStream();
      const events: StreamEvent[] = [];
      
      for await (const _ of adapter.handleAISDKStream(stream)) {
        events.push({} as StreamEvent); // Count iterations
      }
      
      expect(events.length).toBeGreaterThan(0);
      expect(mockRenderer.stream).toHaveBeenCalled();
    });

    it('should handle empty stream', async () => {
      const stream = createStreamFromEvents([]);
      const events: StreamEvent[] = [];
      
      for await (const _ of adapter.handleAISDKStream(stream)) {
        events.push({} as StreamEvent);
      }
      
      expect(events.length).toBe(0);
      expect(mockRenderer.stream).not.toHaveBeenCalled();
    });
  });

  describe('tool result formatting', () => {
    it('should truncate long tool results', async () => {
      const longResult = 'A'.repeat(300);
      const event = createMockToolResultEvent(longResult);
      
      await adapter.processEvent(event);
      
      const call = mockRenderer.stream.mock.calls[0][0];
      expect(call).toContain('✓ **Result**:');
      expect(call).toContain('...');
      expect(call.length).toBeLessThan(300);
    });

    it('should format object tool results as JSON', async () => {
      const objectResult = { success: true, data: [1, 2, 3] };
      const event = createMockToolResultEvent(objectResult);
      
      await adapter.processEvent(event);
      
      const call = mockRenderer.stream.mock.calls[0][0];
      expect(call).toContain('"success": true');
      expect(call).toContain('"data": [1, 2, 3]');
    });

    it('should handle null tool results', async () => {
      const event = createMockToolResultEvent(null);
      
      await adapter.processEvent(event);
      
      const call = mockRenderer.stream.mock.calls[0][0];
      expect(call).toContain('✓ **Result**: null');
    });
  });

  describe('tool icon mapping', () => {
    it('should use correct icons for known tools', async () => {
      const testCases = [
        { toolName: 'read_file', expectedIcon: '📖' },
        { toolName: 'write_file', expectedIcon: '✏️' },
        { toolName: 'search', expectedIcon: '🔍' },
        { toolName: 'run_command', expectedIcon: '⚡' },
        { toolName: 'web_search', expectedIcon: '🌐' },
        { toolName: 'unknown_tool', expectedIcon: '🔧' }
      ];

      for (const { toolName, expectedIcon } of testCases) {
        mockRenderer.stream.mockClear();
        
        const event = createMockToolCallEvent(toolName, {});
        await adapter.processEvent(event);
        
        const call = mockRenderer.stream.mock.calls[0][0];
        expect(call).toContain(expectedIcon);
      }
    });
  });

  describe('status icon mapping', () => {
    it('should use correct icons for status types', async () => {
      const testCases = [
        { status: 'pending', expectedIcon: '⏳' },
        { status: 'running', expectedIcon: '🔄' },
        { status: 'completed', expectedIcon: '✅' },
        { status: 'failed', expectedIcon: '❌' },
        { status: 'info', expectedIcon: 'ℹ️' },
        { status: 'unknown', expectedIcon: 'ℹ️' }
      ];

      for (const { status, expectedIcon } of testCases) {
        mockRenderer.stream.mockClear();
        
        const event = createMockStatusEvent('Test status', status);
        await adapter.processEvent(event);
        
        const call = mockRenderer.stream.mock.calls[0][0];
        expect(call).toContain(expectedIcon);
      }
    });
  });

  describe('timestamp rendering', () => {
    it('should include timestamps when enabled', async () => {
      adapter.updateOptions({ renderTimestamps: true });
      
      const event = createMockTextDeltaEvent('Hello world');
      await adapter.processEvent(event);
      
      const call = mockRenderer.stream.mock.calls[0][0];
      expect(call).toMatch(/\[\d{1,2}:\d{2}:\d{2}\]/);
    });

    it('should not include timestamps when disabled', async () => {
      adapter.updateOptions({ renderTimestamps: false });
      
      const event = createMockTextDeltaEvent('Hello world');
      await adapter.processEvent(event);
      
      const call = mockRenderer.stream.mock.calls[0][0];
      expect(call).not.toMatch(/\[\d{1,2}:\d{2}:\d{2}\]/);
      expect(call).toBe('Hello world');
    });
  });

  describe('options management', () => {
    it('should update options correctly', () => {
      adapter.updateOptions({ 
        maxToolResultLength: 100,
        showThinking: false 
      });
      
      const options = adapter.getOptions();
      expect(options.maxToolResultLength).toBe(100);
      expect(options.showThinking).toBe(false);
    });

    it('should preserve existing options when updating', () => {
      const initialOptions = adapter.getOptions();
      
      adapter.updateOptions({ maxToolResultLength: 100 });
      
      const updatedOptions = adapter.getOptions();
      expect(updatedOptions.formatToolCalls).toBe(initialOptions.formatToolCalls);
      expect(updatedOptions.maxToolResultLength).toBe(100);
    });
  });
});
