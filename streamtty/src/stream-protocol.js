"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamProtocol = void 0;
class StreamProtocol {
    static validateEvent(event) {
        if (!event || typeof event !== 'object') {
            return false;
        }
        if (!this.VALID_EVENT_TYPES.has(event.type)) {
            return false;
        }
        switch (event.type) {
            case 'tool_call':
                return this.validateToolCallEvent(event);
            case 'tool_result':
                return this.validateToolResultEvent(event);
            case 'text_delta':
                return this.validateTextDeltaEvent(event);
            case 'thinking':
            case 'reasoning':
                return this.validateThinkingEvent(event);
            case 'status':
            case 'step':
                return this.validateStatusEvent(event);
            case 'error':
                return this.validateErrorEvent(event);
            default:
                return true;
        }
    }
    static validateToolCallEvent(event) {
        return typeof event.toolName === 'string' &&
            typeof event.toolArgs === 'object' &&
            event.toolArgs !== null;
    }
    static validateToolResultEvent(event) {
        return event.toolResult !== undefined;
    }
    static validateTextDeltaEvent(event) {
        return typeof event.content === 'string';
    }
    static validateThinkingEvent(event) {
        return typeof event.content === 'string';
    }
    static validateStatusEvent(event) {
        return typeof event.content === 'string' &&
            (!event.metadata || typeof event.metadata === 'object');
    }
    static validateErrorEvent(event) {
        return typeof event.content === 'string';
    }
    static transformEvent(event) {
        const transformed = {
            ...event,
            metadata: {
                timestamp: Date.now(),
                ...event.metadata
            }
        };
        return transformed;
    }
    static createTextDelta(content, metadata) {
        return {
            type: 'text_delta',
            content,
            metadata: {
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    static createToolCall(toolName, toolArgs, metadata) {
        return {
            type: 'tool_call',
            toolName,
            toolArgs,
            metadata: {
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    static createToolResult(toolResult, metadata) {
        return {
            type: 'tool_result',
            toolResult,
            metadata: {
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    static createThinking(content, metadata) {
        return {
            type: 'thinking',
            content,
            metadata: {
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    static createReasoning(content, metadata) {
        return {
            type: 'reasoning',
            content,
            metadata: {
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    static createStatus(content, status, metadata) {
        return {
            type: 'status',
            content,
            metadata: {
                timestamp: Date.now(),
                status,
                ...metadata
            }
        };
    }
    static createError(content, error, metadata) {
        return {
            type: 'error',
            content,
            metadata: {
                timestamp: Date.now(),
                error,
                code: error?.name || 'UNKNOWN_ERROR',
                ...metadata
            }
        };
    }
    static shouldRenderEvent(event, options = {}) {
        switch (event.type) {
            case 'thinking':
            case 'reasoning':
                return options.showThinking !== false;
            default:
                return true;
        }
    }
    static getEventPriority(event) {
        const priorities = {
            'error': 0,
            'start': 1,
            'complete': 1,
            'status': 2,
            'step': 2,
            'tool_call': 3,
            'tool_result': 3,
            'thinking': 4,
            'reasoning': 4,
            'text_delta': 5
        };
        return priorities[event.type] || 10;
    }
}
exports.StreamProtocol = StreamProtocol;
StreamProtocol.VALID_EVENT_TYPES = new Set([
    'text_delta',
    'tool_call',
    'tool_result',
    'thinking',
    'start',
    'complete',
    'error',
    'reasoning',
    'step',
    'status'
]);
