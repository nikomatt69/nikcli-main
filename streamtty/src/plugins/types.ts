import { ParsedToken, RenderContext } from '../types';

/**
 * Plugin type matching Streamdown's remark/rehype pattern
 */
export type PluginType = 'remark' | 'rehype';

/**
 * Plugin hook phases
 */
export type HookPhase = 'pre-parse' | 'post-parse' | 'pre-render' | 'post-render';

/**
 * Base plugin interface
 */
export interface TTYPlugin {
    name: string;
    type: PluginType;
    enabled?: boolean;
    priority?: number; // Lower numbers run first
}

/**
 * Remark plugin - processes markdown before parsing
 */
export interface RemarkPlugin extends TTYPlugin {
    type: 'remark';
    process(markdown: string, context: PluginContext): string | Promise<string>;
}

/**
 * Rehype plugin - processes tokens after parsing
 */
export interface RehypePlugin extends TTYPlugin {
    type: 'rehype';
    process(tokens: ParsedToken[], context: PluginContext): ParsedToken[] | Promise<ParsedToken[]>;
}

/**
 * Plugin context passed to processors
 */
export interface PluginContext {
    renderContext: RenderContext;
    metadata: Map<string, any>;
    options: PluginOptions;
}

/**
 * Plugin configuration options
 */
export interface PluginOptions {
    [key: string]: any;
}

/**
 * Pluggable list matching remark/rehype pattern
 */
export type TTYPluggableList = Array<TTYPluggable>;

export type TTYPluggable =
    | TTYPlugin
    | [TTYPlugin, PluginOptions]
    | string; // Plugin name for built-in plugins

/**
 * Hook function type
 */
export type HookFunction = (
    data: any,
    context: PluginContext
) => any | Promise<any>;

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
    plugin: TTYPlugin;
    options: PluginOptions;
    hooks: Map<HookPhase, HookFunction[]>;
}

/**
 * Plugin execution result
 */
export interface PluginResult<T> {
    data: T;
    errors?: Error[];
    warnings?: string[];
}

