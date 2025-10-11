/**
 * Stream Protocol Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  StreamProtocol, 
  StreamEvent, 
  StreamEventType,
  StreamEventOptions 
} from '../../src/stream-protocol';

describe('StreamProtocol', () => {
  describe('validateEvent', () => {
    it('should validate valid events', () => {
      const validEvents: StreamEvent[] = [
        { type: 'text_delta', content: 'Hello world' },
        { type: 'tool_call', toolName: 'read_file', toolArgs: { path: 'test.txt' } },
        { type: 'tool_result', toolResult: 'File content' },
        { type: 'thinking', content: 'Let me think...' },
        { type: 'reasoning', content: 'Based on analysis...' },
        { type: 'status', content: 'Processing...' },
        { type: 'error', content: 'Something went wrong' },
        { type: 'start' },
        { type: 'complete' }
      ];

      for (const event of validEvents) {
        expect(StreamProtocol.validateEvent(event)).toBe(true);
      }
    });

    it('should reject invalid events', () => {
      const invalidEvents = [
        null,
        undefined,
        {},
        { type: 'invalid_type' },
        { type: 'tool_call' }, // Missing toolName and toolArgs
        { type: 'tool_call', toolName: 'test' }, // Missing toolArgs
        { type: 'tool_call', toolArgs: {} }, // Missing toolName
        { type: 'tool_result' }, // Missing toolResult
        { type: 'text_delta' }, // Missing content
        { type: 'thinking' }, // Missing content
        { type: 'reasoning' }, // Missing content
        { type: 'status' }, // Missing content
        { type: 'error' } // Missing content
      ];

      for (const event of invalidEvents) {
        expect(StreamProtocol.validateEvent(event)).toBe(false);
      }
    });

    it('should validate tool_call events correctly', () => {
      expect(StreamProtocol.validateEvent({
        type: 'tool_call',
        toolName: 'read_file',
        toolArgs: { path: 'test.txt' }
      })).toBe(true);

      expect(StreamProtocol.validateEvent({
        type: 'tool_call',
        toolName: 'read_file',
        toolArgs: null
      })).toBe(false);

      expect(StreamProtocol.validateEvent({
        type: 'tool_call',
        toolName: '',
        toolArgs: {}
      })).toBe(false);
    });
  });

  describe('transformEvent', () => {
    it('should add timestamp to events', () => {
      const event: StreamEvent = { type: 'text_delta', content: 'Hello' };
      const transformed = StreamProtocol.transformEvent(event);
      
      expect(transformed.metadata).toBeDefined();
      expect(transformed.metadata?.timestamp).toBeTypeOf('number');
      expect(transformed.metadata?.timestamp).toBeGreaterThan(0);
    });

    it('should preserve existing metadata', () => {
      const event: StreamEvent = { 
        type: 'text_delta', 
        content: 'Hello',
        metadata: { custom: 'value' }
      };
      const transformed = StreamProtocol.transformEvent(event);
      
      expect(transformed.metadata?.custom).toBe('value');
      expect(transformed.metadata?.timestamp).toBeDefined();
    });
  });

  describe('createTextDelta', () => {
    it('should create valid text delta events', () => {
      const event = StreamProtocol.createTextDelta('Hello world');
      
      expect(event.type).toBe('text_delta');
      expect(event.content).toBe('Hello world');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });

    it('should include custom metadata', () => {
      const event = StreamProtocol.createTextDelta('Hello', { agentId: 'test' });
      
      expect(event.metadata?.agentId).toBe('test');
      expect(event.metadata?.timestamp).toBeDefined();
    });
  });

  describe('createToolCall', () => {
    it('should create valid tool call events', () => {
      const event = StreamProtocol.createToolCall('read_file', { path: 'test.txt' });
      
      expect(event.type).toBe('tool_call');
      expect(event.toolName).toBe('read_file');
      expect(event.toolArgs).toEqual({ path: 'test.txt' });
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });
  });

  describe('createToolResult', () => {
    it('should create valid tool result events', () => {
      const event = StreamProtocol.createToolResult('File content');
      
      expect(event.type).toBe('tool_result');
      expect(event.toolResult).toBe('File content');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });

    it('should handle complex tool results', () => {
      const complexResult = { success: true, data: [1, 2, 3] };
      const event = StreamProtocol.createToolResult(complexResult);
      
      expect(event.toolResult).toEqual(complexResult);
    });
  });

  describe('createThinking', () => {
    it('should create valid thinking events', () => {
      const event = StreamProtocol.createThinking('Let me think about this...');
      
      expect(event.type).toBe('thinking');
      expect(event.content).toBe('Let me think about this...');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });
  });

  describe('createReasoning', () => {
    it('should create valid reasoning events', () => {
      const event = StreamProtocol.createReasoning('Based on the analysis...');
      
      expect(event.type).toBe('reasoning');
      expect(event.content).toBe('Based on the analysis...');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });
  });

  describe('createStatus', () => {
    it('should create valid status events', () => {
      const event = StreamProtocol.createStatus('Processing...', 'running');
      
      expect(event.type).toBe('status');
      expect(event.content).toBe('Processing...');
      expect(event.metadata?.status).toBe('running');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });
  });

  describe('createError', () => {
    it('should create valid error events', () => {
      const error = new Error('Test error');
      const event = StreamProtocol.createError('Something went wrong', error);
      
      expect(event.type).toBe('error');
      expect(event.content).toBe('Something went wrong');
      expect(event.metadata?.error).toBe(error);
      expect(event.metadata?.code).toBe('Error');
      expect(event.metadata?.timestamp).toBeTypeOf('number');
    });
  });

  describe('shouldRenderEvent', () => {
    it('should render events by default', () => {
      const event: StreamEvent = { type: 'text_delta', content: 'Hello' };
      expect(StreamProtocol.shouldRenderEvent(event)).toBe(true);
    });

    it('should respect showThinking option', () => {
      const event: StreamEvent = { type: 'thinking', content: 'Thinking...' };
      
      expect(StreamProtocol.shouldRenderEvent(event, { showThinking: true })).toBe(true);
      expect(StreamProtocol.shouldRenderEvent(event, { showThinking: false })).toBe(false);
    });

    it('should respect showThinking for reasoning events', () => {
      const event: StreamEvent = { type: 'reasoning', content: 'Reasoning...' };
      
      expect(StreamProtocol.shouldRenderEvent(event, { showThinking: true })).toBe(true);
      expect(StreamProtocol.shouldRenderEvent(event, { showThinking: false })).toBe(false);
    });
  });

  describe('getEventPriority', () => {
    it('should return correct priorities', () => {
      expect(StreamProtocol.getEventPriority({ type: 'error' })).toBe(0);
      expect(StreamProtocol.getEventPriority({ type: 'start' })).toBe(1);
      expect(StreamProtocol.getEventPriority({ type: 'complete' })).toBe(1);
      expect(StreamProtocol.getEventPriority({ type: 'status' })).toBe(2);
      expect(StreamProtocol.getEventPriority({ type: 'tool_call' })).toBe(3);
      expect(StreamProtocol.getEventPriority({ type: 'tool_result' })).toBe(3);
      expect(StreamProtocol.getEventPriority({ type: 'thinking' })).toBe(4);
      expect(StreamProtocol.getEventPriority({ type: 'text_delta' })).toBe(5);
    });

    it('should handle unknown event types', () => {
      const unknownEvent = { type: 'unknown' as StreamEventType };
      expect(StreamProtocol.getEventPriority(unknownEvent)).toBe(10);
    });
  });
});
