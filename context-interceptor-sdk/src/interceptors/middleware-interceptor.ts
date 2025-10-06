import { QueryEngine } from '../query/engine';
import { PatternEvaluator } from '../query/evaluator';
import { Logger } from '../utils/logger';

export interface MiddlewareConfig {
    queryEngine: QueryEngine;
    evaluator: PatternEvaluator;
    logger: Logger;
    conversationId?: string;
    systemPrompt?: string;
    enableAutoContext?: boolean;
}

export function createContextMiddleware(config: MiddlewareConfig) {
    const { queryEngine, evaluator, logger, conversationId, systemPrompt, enableAutoContext = true } = config;

    return {
        wrapGenerate: async ({ doGenerate, params }: any) => {
            if (!enableAutoContext) {
                return doGenerate();
            }

            try {
                logger.debug('Middleware intercepting generate call');

                const messages = params.prompt?.messages || [];

                if (messages.length === 0) {
                    return doGenerate();
                }

                const lastMessage = messages[messages.length - 1];
                if (!lastMessage || lastMessage.role !== 'user') {
                    return doGenerate();
                }

                const userQuery = typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : lastMessage.content[0]?.text || '';

                logger.debug('Enriching generate with context', {
                    userQuery: userQuery.substring(0, 100)
                });

                const searchResults = await queryEngine.search(userQuery, {
                    topK: 5,
                    includeHistory: true,
                    conversationId
                });

                const history = conversationId
                    ? await queryEngine.getConversationHistory(conversationId, 5)
                    : [];

                const contextPattern = evaluator.buildContextPattern(
                    searchResults,
                    history,
                    userQuery,
                    systemPrompt
                );

                const contextMessage = {
                    role: 'system' as const,
                    content: contextPattern.formattedContext
                };

                const enrichedMessages = [
                    contextMessage,
                    ...messages.filter((m: any) => m.role !== 'system')
                ];

                const enrichedParams = {
                    ...params,
                    prompt: {
                        ...params.prompt,
                        messages: enrichedMessages
                    }
                };

                logger.debug('Generate enriched with context', {
                    originalMessages: messages.length,
                    enrichedMessages: enrichedMessages.length,
                    contextTokens: contextPattern.totalTokens
                });

                return doGenerate(enrichedParams);
            } catch (error) {
                logger.error('Failed to enrich generate', {
                    error: error instanceof Error ? error.message : String(error)
                });

                return doGenerate();
            }
        },

        wrapStream: async ({ doStream, params }: any) => {
            if (!enableAutoContext) {
                return doStream();
            }

            try {
                logger.debug('Middleware intercepting stream call');

                const messages = params.prompt?.messages || [];

                if (messages.length === 0) {
                    return doStream();
                }

                const lastMessage = messages[messages.length - 1];
                if (!lastMessage || lastMessage.role !== 'user') {
                    return doStream();
                }

                const userQuery = typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : lastMessage.content[0]?.text || '';

                logger.debug('Enriching stream with context', {
                    userQuery: userQuery.substring(0, 100)
                });

                const searchResults = await queryEngine.search(userQuery, {
                    topK: 5,
                    includeHistory: true,
                    conversationId
                });

                const history = conversationId
                    ? await queryEngine.getConversationHistory(conversationId, 5)
                    : [];

                const contextPattern = evaluator.buildContextPattern(
                    searchResults,
                    history,
                    userQuery,
                    systemPrompt
                );

                const contextMessage = {
                    role: 'system' as const,
                    content: contextPattern.formattedContext
                };

                const enrichedMessages = [
                    contextMessage,
                    ...messages.filter((m: any) => m.role !== 'system')
                ];

                const enrichedParams = {
                    ...params,
                    prompt: {
                        ...params.prompt,
                        messages: enrichedMessages
                    }
                };

                logger.debug('Stream enriched with context', {
                    originalMessages: messages.length,
                    enrichedMessages: enrichedMessages.length,
                    contextTokens: contextPattern.totalTokens
                });

                return doStream(enrichedParams);
            } catch (error) {
                logger.error('Failed to enrich stream', {
                    error: error instanceof Error ? error.message : String(error)
                });

                return doStream();
            }
        }
    };
}

