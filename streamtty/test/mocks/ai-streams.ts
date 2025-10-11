/**
 * AI SDK Stream Mocks for Testing
 */

import { StreamEvent, StreamEventType } from '../../src/types/stream-events';

export const createMockStreamEvent = (
  type: StreamEventType,
  overrides: Partial<StreamEvent> = {}
): StreamEvent => ({
  type,
  timestamp: Date.now(),
  ...overrides
});

export const createMockTextDeltaEvent = (content: string): StreamEvent => 
  createMockStreamEvent('text_delta', { content });

export const createMockToolCallEvent = (toolName: string, toolArgs: Record<string, any>): StreamEvent =>
  createMockStreamEvent('tool_call', { toolName, toolArgs });

export const createMockToolResultEvent = (toolResult: any): StreamEvent =>
  createMockStreamEvent('tool_result', { toolResult });

export const createMockThinkingEvent = (content: string): StreamEvent =>
  createMockStreamEvent('thinking', { content });

export const createMockReasoningEvent = (content: string): StreamEvent =>
  createMockStreamEvent('reasoning', { content });

export const createMockStatusEvent = (content: string, status?: string): StreamEvent =>
  createMockStreamEvent('status', { 
    content, 
    metadata: { status } 
  });

export const createMockErrorEvent = (content: string, error?: Error): StreamEvent =>
  createMockStreamEvent('error', { 
    content, 
    metadata: { error } 
  });

/**
 * Create a mock AI stream with various event types
 */
export async function* createMockAIStream(): AsyncGenerator<StreamEvent> {
  yield createMockStreamEvent('start');
  
  yield createMockThinkingEvent('Let me analyze this request...');
  
  yield createMockTextDeltaEvent('I need to read the file first.\n\n');
  
  yield createMockToolCallEvent('read_file', { path: 'test.txt' });
  
  yield createMockToolResultEvent('File content here...');
  
  yield createMockTextDeltaEvent('Now I can process the content.\n\n');
  
  yield createMockReasoningEvent('The content suggests we need to...');
  
  yield createMockToolCallEvent('write_file', { path: 'output.txt', content: 'Processed content' });
  
  yield createMockToolResultEvent({ success: true, bytesWritten: 18 });
  
  yield createMockTextDeltaEvent('Task completed successfully!');
  
  yield createMockStreamEvent('complete');
}

/**
 * Create a mock stream with errors
 */
export async function* createMockErrorStream(): AsyncGenerator<StreamEvent> {
  yield createMockStreamEvent('start');
  
  yield createMockTextDeltaEvent('Starting operation...\n\n');
  
  yield createMockToolCallEvent('read_file', { path: 'nonexistent.txt' });
  
  yield createMockErrorEvent('File not found', new Error('ENOENT: no such file or directory'));
  
  yield createMockStreamEvent('complete');
}

/**
 * Create a mock stream with performance issues
 */
export async function* createMockSlowStream(): AsyncGenerator<StreamEvent> {
  yield createMockStreamEvent('start');
  
  // Simulate slow thinking
  yield createMockThinkingEvent('This is a very long thinking process that takes time...');
  
  // Simulate large text delta
  yield createMockTextDeltaEvent('A'.repeat(10000));
  
  // Simulate tool call with large args
  yield createMockToolCallEvent('process_data', { 
    data: Array(1000).fill(0).map((_, i) => ({ id: i, value: Math.random() }))
  });
  
  // Simulate large tool result
  yield createMockToolResultEvent({
    processed: Array(1000).fill(0).map((_, i) => ({ id: i, result: Math.random() * 100 }))
  });
  
  yield createMockStreamEvent('complete');
}

/**
 * Helper to create a stream from an array of events
 */
export async function* createStreamFromEvents(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

/**
 * Helper to collect all events from a stream
 */
export async function collectStreamEvents(stream: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  
  for await (const event of stream) {
    events.push(event);
  }
  
  return events;
}

/**
 * Mock stream that throws an error
 */
export async function* createMockFailingStream(): AsyncGenerator<StreamEvent> {
  yield createMockStreamEvent('start');
  yield createMockTextDeltaEvent('Starting...\n\n');
  throw new Error('Stream failed');
}

/**
 * Mock stream with custom event timing
 */
export async function* createMockTimedStream(delayMs: number = 10): AsyncGenerator<StreamEvent> {
  yield createMockStreamEvent('start');
  
  yield createMockTextDeltaEvent('First chunk\n');
  await new Promise(resolve => setTimeout(resolve, delayMs));
  
  yield createMockTextDeltaEvent('Second chunk\n');
  await new Promise(resolve => setTimeout(resolve, delayMs));
  
  yield createMockTextDeltaEvent('Final chunk');
  
  yield createMockStreamEvent('complete');
}
