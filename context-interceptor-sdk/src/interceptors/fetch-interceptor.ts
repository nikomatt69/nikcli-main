import { QueryEngine } from '../query/engine';
import { PatternEvaluator } from '../query/evaluator';
import { Logger } from '../utils/logger';

export interface FetchInterceptorConfig {
    queryEngine: QueryEngine;
    evaluator: PatternEvaluator;
    logger: Logger;
    conversationId?: string;
    systemPrompt?: string;
    enableAutoContext?: boolean;
}

export function createFetchInterceptor(config: FetchInterceptorConfig): typeof fetch {
    const { queryEngine, evaluator, logger, conversationId, systemPrompt, enableAutoContext = true } = config;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const originalFetch = globalThis.fetch;

        if (!enableAutoContext || !init?.method || init.method.toUpperCase() !== 'POST') {
            return originalFetch(input, init);
        }

        if (!url.includes('/chat/completions') && !url.includes('/v1/chat')) {
            return originalFetch(input, init);
        }

        try {
            logger.debug('Intercepting chat completion request', { url });

            const body = init.body ? JSON.parse(init.body as string) : {};
            const messages = body.messages || [];

            if (messages.length === 0) {
                return originalFetch(input, init);
            }

            const lastMessage = messages[messages.length - 1];
            if (!lastMessage || lastMessage.role !== 'user') {
                return originalFetch(input, init);
            }

            const userQuery = lastMessage.content;

            logger.debug('Enriching request with context', {
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
                role: 'system',
                content: contextPattern.formattedContext
            };

            const enrichedMessages = [
                contextMessage,
                ...messages.filter((m: any) => m.role !== 'system')
            ];

            const modifiedBody = {
                ...body,
                messages: enrichedMessages
            };

            const modifiedInit = {
                ...init,
                body: JSON.stringify(modifiedBody)
            };

            logger.debug('Request enriched with context', {
                originalMessages: messages.length,
                enrichedMessages: enrichedMessages.length,
                contextTokens: contextPattern.totalTokens
            });

            const response = await originalFetch(input, modifiedInit);

            if (conversationId && response.ok) {
                const clonedResponse = response.clone();

                clonedResponse.json().then(data => {
                    if (data.choices && data.choices[0]?.message) {
                        const assistantMessage = data.choices[0].message.content;
                        queryEngine.getConversationHistory(conversationId, 0).then(() => {
                            // History is managed automatically
                        }).catch(err => {
                            logger.warn('Failed to save conversation', { error: err.message });
                        });
                    }
                }).catch(() => {
                    // Ignore parsing errors
                });
            }

            return response;
        } catch (error) {
            logger.error('Failed to intercept request', {
                error: error instanceof Error ? error.message : String(error)
            });

            return originalFetch(input, init);
        }
    };
}

