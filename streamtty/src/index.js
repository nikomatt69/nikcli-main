"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamProtocol = exports.AISDKStreamAdapter = exports.BlessedRenderer = exports.StreamingMarkdownParser = exports.Streamtty = void 0;
const blessed_1 = __importDefault(require("blessed"));
const streaming_parser_1 = require("./parser/streaming-parser");
const blessed_renderer_1 = require("./renderer/blessed-renderer");
const ai_sdk_adapter_1 = require("./ai-sdk-adapter");
class Streamtty {
    constructor(options = {}) {
        this.updateInterval = null;
        this.pendingUpdate = false;
        const screen = options.screen || this.createDefaultScreen();
        const container = this.createContainer(screen);
        const defaultOptions = {
            parseIncompleteMarkdown: options.parseIncompleteMarkdown ?? true,
            styles: options.styles || {},
            syntaxHighlight: options.syntaxHighlight ?? true,
            showLineNumbers: options.showLineNumbers ?? false,
            maxWidth: options.maxWidth ?? 120,
            gfm: options.gfm ?? true,
            screen,
            autoScroll: options.autoScroll ?? true,
        };
        const buffer = {
            content: '',
            tokens: [],
            lastUpdate: Date.now(),
        };
        this.context = {
            screen,
            container,
            options: defaultOptions,
            buffer,
        };
        this.parser = new streaming_parser_1.StreamingMarkdownParser(defaultOptions.parseIncompleteMarkdown);
        this.renderer = new blessed_renderer_1.BlessedRenderer(this.context);
        this.aiAdapter = new ai_sdk_adapter_1.AISDKStreamAdapter(this, {
            parseIncompleteMarkdown: defaultOptions.parseIncompleteMarkdown,
            syntaxHighlight: defaultOptions.syntaxHighlight,
            formatToolCalls: true,
            showThinking: true,
            maxToolResultLength: 200,
            renderTimestamps: false
        });
        this.setupKeyBindings();
    }
    createDefaultScreen() {
        const screen = blessed_1.default.screen({
            smartCSR: true,
            title: 'Streamtty - AI Markdown Streaming',
            fullUnicode: true,
        });
        screen.key(['escape', 'q', 'C-c'], () => {
            return process.exit(0);
        });
        return screen;
    }
    createContainer(screen) {
        return blessed_1.default.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: '█',
                style: {
                    fg: 'blue',
                },
            },
            keys: true,
            vi: true,
            mouse: true,
            tags: true,
        });
    }
    setupKeyBindings() {
        const { screen, container } = this.context;
        container.key(['up', 'k'], () => {
            container.scroll(-1);
            screen.render();
        });
        container.key(['down', 'j'], () => {
            container.scroll(1);
            screen.render();
        });
        container.key(['pageup'], () => {
            container.scroll(-container.height);
            screen.render();
        });
        container.key(['pagedown'], () => {
            container.scroll(container.height);
            screen.render();
        });
        container.key(['home', 'g'], () => {
            container.setScrollPerc(0);
            screen.render();
        });
        container.key(['end', 'G'], () => {
            container.setScrollPerc(100);
            screen.render();
        });
        container.focus();
    }
    stream(chunk) {
        this.context.buffer.content += chunk;
        this.context.buffer.lastUpdate = Date.now();
        const tokens = this.parser.addChunk(chunk);
        this.context.buffer.tokens = tokens;
        this.scheduleRender();
    }
    setContent(markdown) {
        this.clear();
        this.stream(markdown);
        this.render();
    }
    scheduleRender() {
        if (this.pendingUpdate)
            return;
        this.pendingUpdate = true;
        setImmediate(() => {
            this.render();
            this.pendingUpdate = false;
        });
    }
    render() {
        this.renderer.render(this.context.buffer.tokens);
    }
    clear() {
        this.parser.clear();
        this.context.buffer.content = '';
        this.context.buffer.tokens = [];
        this.context.container.children.forEach(child => child.destroy());
        this.context.screen.render();
    }
    startAutoRender(intervalMs = 50) {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.updateInterval = setInterval(() => {
            if (this.context.buffer.tokens.length > 0) {
                this.render();
            }
        }, intervalMs);
    }
    stopAutoRender() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    getScreen() {
        return this.context.screen;
    }
    getContainer() {
        return this.context.container;
    }
    getContent() {
        return this.context.buffer.content;
    }
    async streamEvent(event) {
        await this.aiAdapter.processEvent(event);
    }
    async streamEvents(events) {
        for await (const event of events) {
            await this.streamEvent(event);
        }
    }
    async *handleAISDKStream(stream) {
        for await (const _ of this.aiAdapter.handleAISDKStream(stream)) {
            yield;
        }
    }
    updateAIOptions(options) {
        this.aiAdapter.updateOptions(options);
    }
    getAIOptions() {
        return this.aiAdapter.getOptions();
    }
    destroy() {
        this.stopAutoRender();
        this.clear();
        this.context.screen.destroy();
    }
}
exports.Streamtty = Streamtty;
__exportStar(require("./types"), exports);
__exportStar(require("./types/stream-events"), exports);
var streaming_parser_2 = require("./parser/streaming-parser");
Object.defineProperty(exports, "StreamingMarkdownParser", { enumerable: true, get: function () { return streaming_parser_2.StreamingMarkdownParser; } });
var blessed_renderer_2 = require("./renderer/blessed-renderer");
Object.defineProperty(exports, "BlessedRenderer", { enumerable: true, get: function () { return blessed_renderer_2.BlessedRenderer; } });
var ai_sdk_adapter_2 = require("./ai-sdk-adapter");
Object.defineProperty(exports, "AISDKStreamAdapter", { enumerable: true, get: function () { return ai_sdk_adapter_2.AISDKStreamAdapter; } });
var stream_protocol_1 = require("./stream-protocol");
Object.defineProperty(exports, "StreamProtocol", { enumerable: true, get: function () { return stream_protocol_1.StreamProtocol; } });
__exportStar(require("./streamdown-compat"), exports);
__exportStar(require("./errors"), exports);
__exportStar(require("./events"), exports);
__exportStar(require("./performance"), exports);
__exportStar(require("./utils/syntax-highlighter"), exports);
__exportStar(require("./utils/blessed-syntax-highlighter"), exports);
__exportStar(require("./utils/formatting"), exports);
