"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEventBus = exports.EventUtils = exports.StreamttyLifecycle = exports.StreamttyEventBus = exports.StreamttyEventEmitter = void 0;
exports.setupEventErrorHandling = setupEventErrorHandling;
const events_1 = require("events");
class StreamttyEventEmitter extends events_1.EventEmitter {
    constructor(maxHistorySize = 100) {
        super();
        this.eventHistory = [];
        this.maxHistorySize = 100;
        this.filters = new Map();
        this.maxHistorySize = maxHistorySize;
        this.setMaxListeners(50);
    }
    emit(event, data) {
        const timestamp = Date.now();
        const eventData = {
            ...data,
            timestamp,
            source: this.constructor.name
        };
        if (this.shouldFilterEvent(event, eventData)) {
            return false;
        }
        this.addToHistory(event, eventData, timestamp);
        const result = super.emit(event, eventData);
        super.emit('*', event, eventData);
        return result;
    }
    on(event, handler, filter) {
        const wrappedHandler = (data) => {
            if (!filter || filter(data)) {
                handler(data);
            }
        };
        super.on(event, wrappedHandler);
        return this;
    }
    once(event, handler, filter) {
        const wrappedHandler = (data) => {
            if (!filter || filter(data)) {
                handler(data);
                this.off(event, wrappedHandler);
            }
        };
        super.once(event, wrappedHandler);
        return this;
    }
    addFilter(event, filter) {
        if (!this.filters.has(event)) {
            this.filters.set(event, []);
        }
        this.filters.get(event).push(filter);
        return this;
    }
    removeFilter(event, filter) {
        if (!this.filters.has(event)) {
            return this;
        }
        if (filter) {
            const filters = this.filters.get(event);
            const index = filters.indexOf(filter);
            if (index > -1) {
                filters.splice(index, 1);
            }
        }
        else {
            this.filters.delete(event);
        }
        return this;
    }
    getHistory(event, limit) {
        let history = this.eventHistory;
        if (event) {
            history = history.filter(item => item.type === event);
        }
        if (limit && limit > 0) {
            history = history.slice(-limit);
        }
        return history;
    }
    clearHistory() {
        this.eventHistory = [];
        return this;
    }
    getEventStats() {
        const stats = {};
        for (const event of this.eventHistory) {
            stats[event.type] = (stats[event.type] || 0) + 1;
        }
        return stats;
    }
    shouldFilterEvent(event, data) {
        const filters = this.filters.get(event);
        if (!filters) {
            return false;
        }
        return filters.some(filter => !filter(data));
    }
    addToHistory(event, data, timestamp) {
        this.eventHistory.push({ type: event, data, timestamp });
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }
}
exports.StreamttyEventEmitter = StreamttyEventEmitter;
class StreamttyEventBus extends StreamttyEventEmitter {
    constructor() {
        super(...arguments);
        this.components = new Map();
    }
    registerComponent(name, component) {
        this.components.set(name, component);
        if (typeof component.on === 'function') {
            const handler = (event, data) => {
                this.emit(`${name}:${event}`, data);
            };
            try {
                component.on('*', handler);
            }
            catch {
            }
        }
        return this;
    }
    unregisterComponent(name) {
        const component = this.components.get(name);
        if (component) {
            component.removeAllListeners();
            this.components.delete(name);
        }
        return this;
    }
    getComponent(name) {
        return this.components.get(name);
    }
    broadcast(event, data) {
        for (const component of this.components.values()) {
            component.emit(event, data);
        }
        return this;
    }
}
exports.StreamttyEventBus = StreamttyEventBus;
class StreamttyLifecycle {
    constructor(eventBus) {
        this.hooks = new Map();
        this.eventBus = eventBus;
    }
    on(event, handler) {
        if (!this.hooks.has(event)) {
            this.hooks.set(event, []);
        }
        this.hooks.get(event).push(handler);
        return this;
    }
    off(event, handler) {
        const hooks = this.hooks.get(event);
        if (hooks) {
            const index = hooks.indexOf(handler);
            if (index > -1) {
                hooks.splice(index, 1);
            }
        }
        return this;
    }
    async trigger(event, data) {
        const hooks = this.hooks.get(event);
        if (hooks) {
            for (const hook of hooks) {
                try {
                    await hook(data);
                }
                catch (error) {
                    this.eventBus.emit('streamtty:error', {
                        type: 'lifecycle_hook_error',
                        event,
                        error: error instanceof Error ? error : new Error(String(error))
                    });
                }
            }
        }
        this.eventBus.emit(event, data);
    }
    async triggerMultiple(events) {
        for (const { event, data } of events) {
            await this.trigger(event, data);
        }
    }
}
exports.StreamttyLifecycle = StreamttyLifecycle;
class EventUtils {
    static debounce(handler, delay) {
        let timeoutId;
        return (data) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => handler(data), delay);
        };
    }
    static throttle(handler, delay) {
        let lastCall = 0;
        return (data) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                handler(data);
            }
        };
    }
    static retry(handler, maxRetries = 3, delay = 1000) {
        return async (data) => {
            let attempts = 0;
            while (attempts < maxRetries) {
                try {
                    await handler(data);
                    return;
                }
                catch (error) {
                    attempts++;
                    if (attempts >= maxRetries) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempts - 1)));
                }
            }
        };
    }
    static conditional(condition, handler) {
        return (data) => {
            if (condition(data)) {
                handler(data);
            }
        };
    }
    static chain(...handlers) {
        return async (data) => {
            for (const handler of handlers) {
                await handler(data);
            }
        };
    }
}
exports.EventUtils = EventUtils;
exports.globalEventBus = new StreamttyEventBus();
function setupEventErrorHandling() {
    exports.globalEventBus.on('error', (error) => {
        console.error('Streamtty Event Error:', error);
    });
    exports.globalEventBus.on('*', (event, data) => {
        if (data?.error) {
            console.error(`Streamtty Event Error [${event}]:`, data.error);
        }
    });
}
