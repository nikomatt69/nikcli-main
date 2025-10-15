import { Widgets } from 'blessed';
import { TTYControlsConfig, KeyBindings } from '../types';

/**
 * Interactive key handler for StreamTTY
 * Manages keyboard controls for copying, exporting, and navigation
 */
export class KeyHandler {
    private config: Required<TTYControlsConfig>;
    private screen: Widgets.Screen;
    private container: Widgets.BoxElement;
    private handlers: Map<string, KeyHandlerFunction> = new Map();

    constructor(
        screen: Widgets.Screen,
        container: Widgets.BoxElement,
        config: TTYControlsConfig = {}
    ) {
        this.screen = screen;
        this.container = container;
        this.config = this.normalizeConfig(config);
        this.setupKeyBindings();
    }

    /**
     * Normalize configuration with defaults
     */
    private normalizeConfig(config: TTYControlsConfig): Required<TTYControlsConfig> {
        return {
            table: config.table ?? true,
            code: config.code ?? true,
            mermaid: config.mermaid ?? true,
            math: config.math ?? true,
            keys: {
                copy: config.keys?.copy || 'c',
                export: config.keys?.export || 'e',
                navigate: {
                    up: config.keys?.navigate?.up || 'up',
                    down: config.keys?.navigate?.down || 'down',
                    left: config.keys?.navigate?.left || 'left',
                    right: config.keys?.navigate?.right || 'right',
                },
            },
        };
    }

    /**
     * Setup key bindings
     */
    private setupKeyBindings(): void {
        // Copy key
        if ((this.config.code || this.config.math) && this.config.keys.copy) {
            this.registerKey(this.config.keys.copy, this.handleCopy.bind(this));
        }

        // Export key
        if (this.config.mermaid && this.config.keys.export) {
            this.registerKey(this.config.keys.export, this.handleExport.bind(this));
        }

        // Navigation keys (for tables)
        if (this.config.table && this.config.keys.navigate) {
            const nav = this.config.keys.navigate;
            if (nav.up) this.registerKey(nav.up, () => this.handleNavigate('up'));
            if (nav.down) this.registerKey(nav.down, () => this.handleNavigate('down'));
            if (nav.left) this.registerKey(nav.left, () => this.handleNavigate('left'));
            if (nav.right) this.registerKey(nav.right, () => this.handleNavigate('right'));
        }

        // Help key
        this.registerKey('?', this.showHelp.bind(this));
    }

    /**
     * Register a key handler
     */
    private registerKey(key: string, handler: KeyHandlerFunction): void {
        this.handlers.set(key, handler);
        this.container.key([key], () => {
            handler();
            this.screen.render();
        });
    }

    /**
     * Handle copy action
     */
    private handleCopy(): void {
        // Find focused element
        const focused = this.screen.focused;
        if (!focused) return;

        // Get content from focused element
        const content = this.getElementContent(focused);
        if (!content) return;

        // Store in clipboard metadata (for later retrieval)
        (this.screen as any).__clipboard = content;

        // Show notification
        this.showNotification(`Copied ${content.length} characters to clipboard`);
    }

    /**
     * Handle export action
     */
    private handleExport(): void {
        const focused = this.screen.focused;
        if (!focused) return;

        const content = this.getElementContent(focused);
        if (!content) return;

        // Store export request (to be handled by export manager)
        (this.screen as any).__exportRequest = {
            content,
            timestamp: Date.now(),
        };

        this.showNotification('Export request queued');
    }

    /**
     * Handle navigation
     */
    private handleNavigate(direction: 'up' | 'down' | 'left' | 'right'): void {
        const focused = this.screen.focused;
        if (!focused || !('scroll' in focused)) return;

        const scrollable = focused as any;

        switch (direction) {
            case 'up':
                scrollable.scroll?.(-1);
                break;
            case 'down':
                scrollable.scroll?.(1);
                break;
            case 'left':
                // Move focus to previous element
                this.screen.focusPrevious();
                break;
            case 'right':
                // Move focus to next element
                this.screen.focusNext();
                break;
        }
    }

    /**
     * Get content from element
     */
    private getElementContent(element: Widgets.Node): string | null {
        if ('getContent' in element && typeof element.getContent === 'function') {
            return element.getContent();
        }
        if ('content' in element && typeof element.content === 'string') {
            return element.content;
        }
        return null;
    }

    /**
     * Show notification message
     */
    private showNotification(message: string, duration: number = 2000): void {
        const notification = blessed.box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: message.length + 4,
            height: 3,
            content: ` ${message} `,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'green',
                },
                fg: 'green',
            },
            tags: true,
        });

        this.screen.render();

        setTimeout(() => {
            notification.destroy();
            this.screen.render();
        }, duration);
    }

    /**
     * Show help overlay
     */
    private showHelp(): void {
        const helpText = [
            '{bold}StreamTTY Controls{/bold}',
            '',
            `${this.config.keys.copy || 'c'} - Copy focused code/math block`,
            `${this.config.keys.export || 'e'} - Export focused diagram/table`,
            `${this.config.keys.navigate?.up || 'up'}/${this.config.keys.navigate?.down || 'down'} - Navigate up/down`,
            `${this.config.keys.navigate?.left || 'left'}/${this.config.keys.navigate?.right || 'right'} - Navigate left/right`,
            '? - Show this help',
            'ESC/q - Close help',
            '',
            '{dim}Press ESC to close{/dim}',
        ].join('\n');

        const helpBox = blessed.box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: '50%',
            height: '50%',
            content: helpText,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'blue',
                },
            },
            tags: true,
            keys: true,
            vi: true,
        });

        helpBox.key(['escape', 'q'], () => {
            helpBox.destroy();
            this.screen.render();
        });

        helpBox.focus();
        this.screen.render();
    }

    /**
     * Register custom handler
     */
    registerCustomHandler(key: string, handler: KeyHandlerFunction): void {
        this.registerKey(key, handler);
    }

    /**
     * Unregister handler
     */
    unregisterHandler(key: string): void {
        this.handlers.delete(key);
        // Note: blessed doesn't provide easy key unbinding
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<TTYControlsConfig>): void {
        this.config = this.normalizeConfig({ ...this.config, ...config });
        // Re-setup bindings
        this.setupKeyBindings();
    }

    /**
     * Get clipboard content (if any)
     */
    getClipboard(): string | null {
        return (this.screen as any).__clipboard || null;
    }

    /**
     * Get export request (if any)
     */
    getExportRequest(): ExportRequest | null {
        const request = (this.screen as any).__exportRequest;
        if (request) {
            delete (this.screen as any).__exportRequest;
        }
        return request || null;
    }
}

type KeyHandlerFunction = () => void;

interface ExportRequest {
    content: string;
    timestamp: number;
}

import blessed from 'blessed';

