"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AISDKStreamAdapter = void 0;
const stream_protocol_1 = require("./stream-protocol");
class AISDKStreamAdapter {
    constructor(renderer, options = {}) {
        this.renderer = renderer;
        this.options = {
            parseIncompleteMarkdown: true,
            syntaxHighlight: true,
            formatToolCalls: true,
            showThinking: true,
            maxToolResultLength: 200,
            renderTimestamps: false,
            ...options
        };
    }
    async *handleAISDKStream(stream) {
        for await (const event of stream) {
            await this.processEvent(event);
            yield;
        }
    }
    async processEvent(event) {
        if (!stream_protocol_1.StreamProtocol.validateEvent(event)) {
            console.warn('Invalid stream event:', event);
            return;
        }
        if (!stream_protocol_1.StreamProtocol.shouldRenderEvent(event, this.options)) {
            return;
        }
        const transformedEvent = stream_protocol_1.StreamProtocol.transformEvent(event);
        await this.renderEvent(transformedEvent);
    }
    async renderEvent(event) {
        switch (event.type) {
            case 'text_delta':
                await this.renderTextDelta(event);
                break;
            case 'tool_call':
                await this.renderToolCall(event);
                break;
            case 'tool_result':
                await this.renderToolResult(event);
                break;
            case 'thinking':
            case 'reasoning':
                await this.renderThinking(event);
                break;
            case 'status':
            case 'step':
                await this.renderStatus(event);
                break;
            case 'error':
                await this.renderError(event);
                break;
            case 'start':
                await this.renderStart(event);
                break;
            case 'complete':
                await this.renderComplete(event);
                break;
        }
    }
    async renderTextDelta(event) {
        if (event.content) {
            this.renderer.stream(event.content);
        }
    }
    async renderToolCall(event) {
        if (!this.options.formatToolCalls) {
            return;
        }
        const formatted = this.formatToolCall(event);
        this.renderer.stream(formatted);
    }
    formatToolCall(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        const toolIcon = this.getToolIcon(event.toolName);
        const formattedArgs = this.formatToolArgs(event.toolArgs);
        return `\n\n${timestamp}${toolIcon} **${event.toolName}**\n\`\`\`json\n${formattedArgs}\n\`\`\`\n\n`;
    }
    async renderToolResult(event) {
        const formatted = this.formatToolResult(event);
        this.renderer.stream(formatted);
    }
    formatToolResult(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        const resultPreview = this.formatToolResultContent(event.toolResult);
        const truncated = this.truncateContent(resultPreview, this.options.maxToolResultLength);
        return `\n${timestamp}✓ **Result**: ${truncated}\n\n`;
    }
    formatToolResultContent(result) {
        if (typeof result === 'string') {
            return result;
        }
        if (typeof result === 'object' && result !== null) {
            try {
                return JSON.stringify(result, null, 2);
            }
            catch {
                return String(result);
            }
        }
        return String(result);
    }
    truncateContent(content, maxLength) {
        if (content.length <= maxLength) {
            return content;
        }
        return content.slice(0, maxLength) + '...';
    }
    async renderThinking(event) {
        if (!this.options.showThinking || !event.content) {
            return;
        }
        const formatted = this.formatThinking(event);
        this.renderer.stream(formatted);
    }
    formatThinking(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        const icon = event.type === 'reasoning' ? '⚡' : '💭';
        return `\n${timestamp}> ${icon} *${event.content}*\n\n`;
    }
    async renderStatus(event) {
        const formatted = this.formatStatus(event);
        this.renderer.stream(formatted);
    }
    formatStatus(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        const status = event.metadata?.status || 'info';
        const icon = this.getStatusIcon(status);
        return `\n${timestamp}${icon} **${event.content}**\n\n`;
    }
    async renderError(event) {
        const formatted = this.formatError(event);
        this.renderer.stream(formatted);
    }
    formatError(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        const code = event.metadata?.code ? ` (${event.metadata.code})` : '';
        return `\n${timestamp}❌ **Error**${code}: ${event.content}\n\n`;
    }
    async renderStart(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        this.renderer.stream(`\n${timestamp}🚀 **Starting**...\n\n`);
    }
    async renderComplete(event) {
        const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
            ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
            : '';
        this.renderer.stream(`\n${timestamp}✅ **Complete**\n\n`);
    }
    getToolIcon(toolName) {
        const iconMap = {
            'read_file': '📖',
            'write_file': '✏️',
            'edit_file': '🔧',
            'search': '🔍',
            'run_command': '⚡',
            'web_search': '🌐',
            'create_file': '📄',
            'delete_file': '🗑️',
            'list_files': '📁',
            'grep': '🔎',
            'git': '🌿',
            'npm': '📦',
            'docker': '🐳',
            'default': '🔧'
        };
        if (iconMap[toolName]) {
            return iconMap[toolName];
        }
        for (const [key, icon] of Object.entries(iconMap)) {
            if (toolName.includes(key)) {
                return icon;
            }
        }
        return iconMap.default;
    }
    getStatusIcon(status) {
        const iconMap = {
            'pending': '⏳',
            'running': '🔄',
            'completed': '✅',
            'failed': '❌',
            'info': 'ℹ️',
            'warning': '⚠️',
            'success': '✅',
            'error': '❌'
        };
        return iconMap[status] || iconMap.info;
    }
    formatToolArgs(args) {
        try {
            return JSON.stringify(args, null, 2);
        }
        catch {
            return String(args);
        }
    }
    updateOptions(options) {
        this.options = { ...this.options, ...options };
    }
    getOptions() {
        return { ...this.options };
    }
}
exports.AISDKStreamAdapter = AISDKStreamAdapter;
