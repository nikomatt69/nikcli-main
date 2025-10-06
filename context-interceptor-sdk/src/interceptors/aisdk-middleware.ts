import type { Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware } from 'ai';
import { QueryEngine } from '../query/engine';
import { PatternEvaluator } from '../query/evaluator';
import { Logger } from '../utils/logger';
import { PatternGroupManager } from '../embedding/pattern-group-manager';
import { ContextEventSystem } from '../embedding/context-event-system';

export interface AISDKMiddlewareConfig {
    queryEngine: QueryEngine;
    evaluator: PatternEvaluator;
    groupManager: PatternGroupManager;
    eventSystem: ContextEventSystem;
    logger: Logger;
    conversationId?: string;
    systemPrompt?: string;
}

/**
 * AI SDK middleware for automatic context injection
 * Usage: experimental_telemetry: { isEnabled: true, functionId: 'chat', metadata: { middleware: contextMiddleware } }
 */
export function createAISDKMiddleware(config: AISDKMiddlewareConfig): LanguageModelV1Middleware {
    const {
        queryEngine,
        evaluator,
        groupManager,
        eventSystem,
        logger,
        conversationId = 'default',
        systemPrompt,
    } = config;

    return {
        wrapGenerate: async ({ doGenerate, params }) => {
            try {
                // Extract user prompt
                const lastMessage = params.prompt[params.prompt.length - 1];
                let userQuery = '';
                if (lastMessage.role === 'user') {
                    if (typeof lastMessage.content === 'string') {
                        userQuery = lastMessage.content;
                    } else if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
                        const firstPart = lastMessage.content[0];
                        if ('text' in firstPart) {
                            userQuery = firstPart.text;
                        }
                    }
                }

                if (!userQuery) {
                    return doGenerate();
                }

                // Record event
                eventSystem.recordEvent({
                    type: 'query',
                    timestamp: new Date(),
                    data: {
                        text: userQuery,
                        metadata: { provider: 'aisdk' },
                        conversationId,
                    },
                });

                // Find best pattern group
                const bestGroup = await groupManager.findBestGroup(userQuery);

                let contextText = '';

                if (bestGroup) {
                    logger.debug('AI SDK: Using pattern group', {
                        groupId: bestGroup.id,
                        cacheKey: bestGroup.cacheKey,
                    });

                    contextText = bestGroup.patterns
                        .slice(0, 3)
                        .map((p) => p.text)
                        .join('\n\n');

                    groupManager.updateGroupUsage(bestGroup.id, userQuery).catch(() => { });
                } else {
                    const searchResults = await queryEngine.search(userQuery, {
                        conversationId,
                        topK: 3,
                    });

                    contextText = searchResults.map((r) => r.text).join('\n\n');
                }

                // Get history
                const history = await queryEngine.getConversationHistory(conversationId, 5);

                // Build context
                const contextPattern = evaluator.buildContextPattern(
                    bestGroup?.patterns.map((p) => ({
                        id: p.metadata.id || 'pattern',
                        text: p.text,
                        score: p.frequency / 100,
                        metadata: p.metadata,
                    })) || [],
                    history,
                    userQuery
                );

                // Inject context
                const systemMessage = {
                    role: 'system' as const,
                    content: systemPrompt
                        ? `${systemPrompt}\n\n### Context:\n${contextPattern.relevantChunks.map((c) => c.text).join('\n')}`
                        : `### Context:\n${contextPattern.relevantChunks.map((c) => c.text).join('\n')}`,
                };

                const enhancedParams = {
                    ...params,
                    prompt: [systemMessage, ...params.prompt.filter((p) => p.role !== 'system')],
                };

                // Execute
                const result = await doGenerate();
                const enhancedResult = result as any;

                // Record response
                if (enhancedResult.text) {
                    eventSystem.recordEvent({
                        type: 'response',
                        timestamp: new Date(),
                        data: {
                            text: enhancedResult.text,
                            metadata: { provider: 'aisdk' },
                            conversationId,
                        },
                    });
                }

                return enhancedResult;
            } catch (error) {
                logger.error('AI SDK middleware error', { error });
                return doGenerate();
            }
        },

        wrapStream: async ({ doStream, params }) => {
            // Similar logic for streaming
            try {
                const lastMessage = params.prompt[params.prompt.length - 1];
                let userQuery = '';
                if (lastMessage.role === 'user') {
                    if (typeof lastMessage.content === 'string') {
                        userQuery = lastMessage.content;
                    } else if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
                        const firstPart = lastMessage.content[0];
                        if ('text' in firstPart) {
                            userQuery = firstPart.text;
                        }
                    }
                }

                if (!userQuery) {
                    return doStream();
                }

                // Find best pattern group (fast lookup)
                const bestGroup = await groupManager.findBestGroup(userQuery);

                if (bestGroup) {
                    const systemMessage = {
                        role: 'system' as const,
                        content: bestGroup.patterns
                            .slice(0, 2)
                            .map((p) => p.text)
                            .join('\n'),
                    };

                    const enhancedParams = {
                        ...params,
                        prompt: [systemMessage, ...params.prompt.filter((p) => p.role !== 'system')],
                    };

                    return doStream();
                }

                return doStream();
            } catch (error) {
                logger.error('AI SDK stream middleware error', { error });
                return doStream();
            }
        },
    };
}

