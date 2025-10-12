"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamProtocol = void 0;
exports.createStreamRenderer = createStreamRenderer;
exports.useStreamRenderer = useStreamRenderer;
exports.createTextStreamer = createTextStreamer;
exports.createAIStreamer = createAIStreamer;
exports.createDebugStreamer = createDebugStreamer;
const events_1 = require("events");
const index_1 = require("./index");
function createStreamRenderer(options = {}) {
    const streamtty = new index_1.Streamtty(options);
    const eventEmitter = new events_1.EventEmitter();
    let isDestroyed = false;
    const renderer = {
        append: (chunk) => {
            if (isDestroyed)
                return;
            try {
                streamtty.stream(chunk);
                eventEmitter.emit('chunk', chunk);
                eventEmitter.emit('append', chunk);
            }
            catch (error) {
                eventEmitter.emit('error', error);
            }
        },
        appendStructured: async (event) => {
            if (isDestroyed)
                return;
            try {
                await streamtty.streamEvent(event);
                eventEmitter.emit('event', event);
                eventEmitter.emit('structured', event);
            }
            catch (error) {
                eventEmitter.emit('error', error);
            }
        },
        complete: () => {
            if (isDestroyed)
                return;
            eventEmitter.emit('complete');
            eventEmitter.emit('finish');
        },
        error: (err) => {
            eventEmitter.emit('error', err);
        },
        destroy: () => {
            if (isDestroyed)
                return;
            isDestroyed = true;
            streamtty.destroy();
            eventEmitter.removeAllListeners();
            eventEmitter.emit('destroy');
        },
        on: (event, handler) => {
            eventEmitter.on(event, handler);
        },
        off: (event, handler) => {
            eventEmitter.off(event, handler);
        },
        emit: (event, ...args) => {
            eventEmitter.emit(event, ...args);
        },
        isActive: () => !isDestroyed,
        getContent: () => {
            if (isDestroyed)
                return '';
            return streamtty.getContent();
        },
        clear: () => {
            if (isDestroyed)
                return;
            streamtty.clear();
            eventEmitter.emit('clear');
        },
        streamEvents: async (events) => {
            if (isDestroyed)
                return;
            try {
                await streamtty.streamEvents(events);
                eventEmitter.emit('eventsComplete');
            }
            catch (error) {
                eventEmitter.emit('error', error);
            }
        },
        handleAISDKStream: async function* (stream) {
            if (isDestroyed)
                return;
            try {
                for await (const _ of streamtty.handleAISDKStream(stream)) {
                    yield;
                }
            }
            catch (error) {
                eventEmitter.emit('error', error);
            }
        },
        updateOptions: (newOptions) => {
            if (isDestroyed)
                return;
            streamtty.updateAIOptions(newOptions);
            eventEmitter.emit('optionsUpdated', newOptions);
        },
        getOptions: () => {
            return {
                ...streamtty.getAIOptions(),
                screen: streamtty.getScreen(),
                parseIncompleteMarkdown: streamtty.getAIOptions().parseIncompleteMarkdown,
                syntaxHighlight: streamtty.getAIOptions().syntaxHighlight,
                autoScroll: true,
                styles: {},
                formatToolCalls: streamtty.getAIOptions().formatToolCalls,
                showThinking: streamtty.getAIOptions().showThinking,
                maxToolResultLength: streamtty.getAIOptions().maxToolResultLength,
                renderTimestamps: streamtty.getAIOptions().renderTimestamps
            };
        }
    };
    return renderer;
}
function useStreamRenderer(options = {}) {
    let renderer = null;
    let isActive = false;
    const createRenderer = () => {
        if (renderer)
            return;
        renderer = createStreamRenderer({
            screen: options.screen
        });
        renderer.on('destroy', () => {
            isActive = false;
            renderer = null;
        });
        isActive = true;
    };
    const destroy = () => {
        if (renderer) {
            renderer.destroy();
        }
        renderer = null;
        isActive = false;
    };
    const append = (chunk) => {
        if (!renderer)
            createRenderer();
        renderer?.append(chunk);
    };
    const appendStructured = async (event) => {
        if (!renderer)
            createRenderer();
        await renderer?.appendStructured(event);
    };
    const complete = () => {
        if (!renderer)
            createRenderer();
        renderer?.complete();
    };
    const error = (err) => {
        if (!renderer)
            createRenderer();
        renderer?.error(err);
    };
    if (options.autoDestroy !== false) {
        process.on('exit', destroy);
        process.on('SIGINT', destroy);
        process.on('SIGTERM', destroy);
    }
    return {
        renderer,
        isActive,
        destroy,
        append,
        appendStructured,
        complete,
        error
    };
}
function createTextStreamer(options = {}) {
    const renderer = createStreamRenderer(options);
    const originalAppend = renderer.append;
    renderer.append = (chunk) => {
        const formattedChunk = chunk.replace(/\n/g, '\n\n');
        originalAppend(formattedChunk);
    };
    return renderer;
}
function createAIStreamer(options = {}) {
    const aiOptions = {
        formatToolCalls: true,
        showThinking: true,
        maxToolResultLength: 200,
        renderTimestamps: false,
        ...options
    };
    return createStreamRenderer(aiOptions);
}
function createDebugStreamer(options = {}) {
    const debugOptions = {
        renderTimestamps: true,
        formatToolCalls: true,
        showThinking: true,
        ...options
    };
    return createStreamRenderer(debugOptions);
}
var stream_protocol_1 = require("./stream-protocol");
Object.defineProperty(exports, "StreamProtocol", { enumerable: true, get: function () { return stream_protocol_1.StreamProtocol; } });
