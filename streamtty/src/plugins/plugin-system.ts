import { ParsedToken, RenderContext } from '../types';
import {
    TTYPlugin,
    RemarkPlugin,
    RehypePlugin,
    PluginContext,
    PluginOptions,
    TTYPluggableList,
    TTYPluggable,
    HookPhase,
    HookFunction,
    PluginRegistryEntry,
    PluginResult,
} from './types';

/**
 * Plugin system manager
 * Handles plugin registration, loading, and execution
 */
export class PluginSystem {
    private remarkPlugins: Map<string, PluginRegistryEntry> = new Map();
    private rehypePlugins: Map<string, PluginRegistryEntry> = new Map();
    private builtInPlugins: Map<string, TTYPlugin> = new Map();
    private hooks: Map<HookPhase, HookFunction[]> = new Map();

    constructor() {
        this.initializeHooks();
    }

    /**
     * Initialize hook maps
     */
    private initializeHooks(): void {
        this.hooks.set('pre-parse', []);
        this.hooks.set('post-parse', []);
        this.hooks.set('pre-render', []);
        this.hooks.set('post-render', []);
    }

    /**
     * Register a built-in plugin
     */
    registerBuiltIn(plugin: TTYPlugin): void {
        this.builtInPlugins.set(plugin.name, plugin);
    }

    /**
     * Load plugins from pluggable list
     */
    loadPlugins(
        remarkPlugins?: TTYPluggableList,
        rehypePlugins?: TTYPluggableList
    ): void {
        if (remarkPlugins) {
            for (const pluggable of remarkPlugins) {
                this.loadPlugin(pluggable, 'remark');
            }
        }

        if (rehypePlugins) {
            for (const pluggable of rehypePlugins) {
                this.loadPlugin(pluggable, 'rehype');
            }
        }
    }

    /**
     * Load a single plugin
     */
    private loadPlugin(pluggable: TTYPluggable, expectedType: 'remark' | 'rehype'): void {
        let plugin: TTYPlugin;
        let options: PluginOptions = {};

        if (typeof pluggable === 'string') {
            // Built-in plugin by name
            const builtIn = this.builtInPlugins.get(pluggable);
            if (!builtIn) {
                console.warn(`Built-in plugin '${pluggable}' not found`);
                return;
            }
            plugin = builtIn;
        } else if (Array.isArray(pluggable)) {
            // [plugin, options]
            [plugin, options] = pluggable;
        } else {
            // Direct plugin object
            plugin = pluggable;
        }

        // Validate plugin type
        if (plugin.type !== expectedType) {
            console.warn(
                `Plugin '${plugin.name}' is type '${plugin.type}' but expected '${expectedType}'`
            );
            return;
        }

        // Check if enabled
        if (plugin.enabled === false) {
            return;
        }

        // Register plugin
        const entry: PluginRegistryEntry = {
            plugin,
            options,
            hooks: new Map(),
        };

        if (plugin.type === 'remark') {
            this.remarkPlugins.set(plugin.name, entry);
        } else {
            this.rehypePlugins.set(plugin.name, entry);
        }
    }

    /**
     * Process markdown through remark plugins (pre-parse)
     */
    async processRemark(
        markdown: string,
        context: RenderContext
    ): Promise<PluginResult<string>> {
        let result = markdown;
        const errors: Error[] = [];
        const warnings: string[] = [];

        const pluginContext: PluginContext = {
            renderContext: context,
            metadata: new Map(),
            options: {},
        };

        // Sort by priority
        const sorted = this.getSortedPlugins(this.remarkPlugins);

        for (const [name, entry] of sorted) {
            try {
                const remarkPlugin = entry.plugin as RemarkPlugin;
                pluginContext.options = entry.options;
                result = await remarkPlugin.process(result, pluginContext);
            } catch (error) {
                errors.push(error as Error);
                warnings.push(`Remark plugin '${name}' failed: ${(error as Error).message}`);
            }
        }

        return { data: result, errors, warnings };
    }

    /**
     * Process tokens through rehype plugins (post-parse)
     */
    async processRehype(
        tokens: ParsedToken[],
        context: RenderContext
    ): Promise<PluginResult<ParsedToken[]>> {
        let result = tokens;
        const errors: Error[] = [];
        const warnings: string[] = [];

        const pluginContext: PluginContext = {
            renderContext: context,
            metadata: new Map(),
            options: {},
        };

        // Sort by priority
        const sorted = this.getSortedPlugins(this.rehypePlugins);

        for (const [name, entry] of sorted) {
            try {
                const rehypePlugin = entry.plugin as RehypePlugin;
                pluginContext.options = entry.options;
                result = await rehypePlugin.process(result, pluginContext);
            } catch (error) {
                errors.push(error as Error);
                warnings.push(`Rehype plugin '${name}' failed: ${(error as Error).message}`);
            }
        }

        return { data: result, errors, warnings };
    }

    /**
     * Get plugins sorted by priority
     */
    private getSortedPlugins(
        plugins: Map<string, PluginRegistryEntry>
    ): Array<[string, PluginRegistryEntry]> {
        return Array.from(plugins.entries()).sort((a, b) => {
            const priorityA = a[1].plugin.priority ?? 100;
            const priorityB = b[1].plugin.priority ?? 100;
            return priorityA - priorityB;
        });
    }

    /**
     * Register a hook
     */
    registerHook(phase: HookPhase, hook: HookFunction): void {
        const hooks = this.hooks.get(phase) || [];
        hooks.push(hook);
        this.hooks.set(phase, hooks);
    }

    /**
     * Execute hooks for a phase
     */
    async executeHooks(phase: HookPhase, data: any, context: PluginContext): Promise<any> {
        const hooks = this.hooks.get(phase) || [];
        let result = data;

        for (const hook of hooks) {
            try {
                result = await hook(result, context);
            } catch (error) {
                console.warn(`Hook execution failed in phase '${phase}':`, error);
            }
        }

        return result;
    }

    /**
     * Clear all plugins
     */
    clear(): void {
        this.remarkPlugins.clear();
        this.rehypePlugins.clear();
        this.initializeHooks();
    }

    /**
     * Get registered plugin count
     */
    getPluginCount(): { remark: number; rehype: number } {
        return {
            remark: this.remarkPlugins.size,
            rehype: this.rehypePlugins.size,
        };
    }
}

/**
 * Singleton plugin system instance
 */
export const pluginSystem = new PluginSystem();

