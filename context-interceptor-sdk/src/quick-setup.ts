/**
 * Quick Setup - Ultra-simple integration
 * Just 1-2 lines of code to add context to any OpenAI/AI SDK app
 */

import ContextInterceptor from './index';
import type { InterceptorConfig, FilesystemDocSourceOptions, WorkspaceDocProvider } from './types';
import { FilesystemDocSource } from './indexer/sources/filesystem-source';
import { WorkspaceDocSource } from './indexer/sources/workspace-source';

export interface QuickSetupOptions {
    /** Your OpenAI API key */
    openaiApiKey: string;
    /** Upstash Vector URL */
    upstashVectorUrl: string;
    /** Upstash Vector Token */
    upstashVectorToken: string;
    /** Upstash Redis URL */
    upstashRedisUrl: string;
    /** Upstash Redis Token */
    upstashRedisToken: string;
    /** Optional: Conversation ID (default: 'default') */
    conversationId?: string;
    /** Optional: System prompt */
    systemPrompt?: string;
}

let globalInterceptor: ContextInterceptor | null = null;

/**
 * Initialize once, use everywhere
 */
export function initContextInterceptor(options: QuickSetupOptions): void {
    if (globalInterceptor) {
        return; // Already initialized
    }

    globalInterceptor = new ContextInterceptor({
        openaiApiKey: options.openaiApiKey,
        upstashVectorUrl: options.upstashVectorUrl,
        upstashVectorToken: options.upstashVectorToken,
        upstashRedisUrl: options.upstashRedisUrl,
        upstashRedisToken: options.upstashRedisToken,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        enableLogging: true,
    });
}

/**
 * Get OpenAI-compatible fetch function with auto-context
 * 
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { getOpenAIFetch } from '@context-interceptor/sdk';
 * 
 * const openai = new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   fetch: getOpenAIFetch() // <- Just this one line!
 * });
 * ```
 */
export function getOpenAIFetch(options?: {
    conversationId?: string;
    systemPrompt?: string;
}): typeof fetch {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }

    return globalInterceptor.createOpenAIFetchInterceptor(
        options?.conversationId,
        options?.systemPrompt
    );
}

/**
 * Get AI SDK middleware with auto-context
 * 
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * import { streamText } from 'ai';
 * import { getAISDKMiddleware } from '@context-interceptor/sdk';
 * 
 * const result = await streamText({
 *   model: openai('gpt-4o'),
 *   messages,
 *   experimental_providerMetadata: getAISDKMiddleware() // <- Just this one line!
 * });
 * ```
 */
export function getAISDKMiddleware(options?: {
    conversationId?: string;
    systemPrompt?: string;
}): { middleware: any } {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }

    const middleware = globalInterceptor.createAISDKMiddleware(
        options?.conversationId,
        options?.systemPrompt
    );

    return { middleware };
}

/**
 * Index documents for context
 * 
 * @example
 * ```typescript
 * import { indexDocs } from '@context-interceptor/sdk';
 * 
 * await indexDocs([
 *   { id: 'doc1', content: 'Your documentation...' }
 * ]);
 * ```
 */
export async function indexDocs(
    docs: Array<{ id?: string; content: string; metadata?: Record<string, any> }>
): Promise<void> {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }

    await globalInterceptor.indexDocuments(docs);
}

/**
 * Index documents from filesystem globs
 */
export async function indexFromGlob(
    globs: string | string[],
    opts?: Omit<FilesystemDocSourceOptions, 'globs'>
): Promise<void> {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }
    const src = new FilesystemDocSource({ globs: Array.isArray(globs) ? globs : [globs], ...opts });
    await globalInterceptor.indexFromSources([src]);
}

/**
 * Index documents from a workspace provider (e.g., Claude/VSCode/MCP)
 */
export async function indexFromWorkspace(provider: WorkspaceDocProvider): Promise<void> {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }
    const src = new WorkspaceDocSource(provider);
    await globalInterceptor.indexFromSources([src]);
}

/**
 * Get interceptor instance for advanced usage
 */
export function getInterceptor(): ContextInterceptor {
    if (!globalInterceptor) {
        throw new Error('Call initContextInterceptor() first!');
    }

    return globalInterceptor;
}
