import { QueryEngine } from '../query/engine';
import { PatternEvaluator } from '../query/evaluator';
import { Logger } from '../utils/logger';
import { PatternGroupManager } from '../embedding/pattern-group-manager';
import { ContextEventSystem } from '../embedding/context-event-system';

export interface UnifiedInterceptorConfig {
    queryEngine: QueryEngine;
    evaluator: PatternEvaluator;
    groupManager: PatternGroupManager;
    eventSystem: ContextEventSystem;
    logger: Logger;
    conversationId?: string;
    systemPrompt?: string;
    enableAutoContext?: boolean;
}

/**
 * Universal OpenAI-compatible interceptor
 * Works with both openai SDK and @ai-sdk/openai
 */
export function createUnifiedOpenAIInterceptor(config: UnifiedInterceptorConfig): typeof fetch {
    const {
        queryEngine,
        evaluator,
        groupManager,
        eventSystem,
        logger,
        conversationId = 'default',
        systemPrompt,
        enableAutoContext = true,
    } = config;

    return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlString = url.toString();

        // Only intercept chat completions
        if (!urlString.includes('/chat/completions')) {
            return fetch(url, init);
        }

        if (!init?.body || !enableAutoContext) {
            return fetch(url, init);
        }

        try {
            const requestBody = JSON.parse(init.body.toString());
            const { messages } = requestBody;

            // Extract last user message
            const lastUserMessage = messages
                .slice()
                .reverse()
                .find((m: any) => m.role === 'user');

            if (!lastUserMessage) {
                return fetch(url, init);
            }

            const userQuery = typeof lastUserMessage.content === 'string'
                ? lastUserMessage.content
                : lastUserMessage.content[0]?.text || '';

            // Record event in background
            eventSystem.recordEvent({
                type: 'query',
                timestamp: new Date(),
                data: {
                    text: userQuery,
                    metadata: { model: requestBody.model },
                    conversationId,
                },
            });

            // Find best pattern group
            const bestGroup = await groupManager.findBestGroup(userQuery);

            let contextText = '';

            if (bestGroup) {
                // Use cached group patterns
                logger.debug('Using pattern group', {
                    groupId: bestGroup.id,
                    cacheKey: bestGroup.cacheKey,
                });

                contextText = bestGroup.patterns
                    .slice(0, 3)
                    .map((p) => p.text)
                    .join('\n\n');

                // Update usage in background
                groupManager.updateGroupUsage(bestGroup.id, userQuery).catch(() => { });
            } else {
                // Fallback to regular search
                const searchResults = await queryEngine.search(userQuery, {
                    conversationId,
                    topK: 3,
                });

                contextText = searchResults.map((r) => r.text).join('\n\n');
            }

            // Get conversation history
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

            // Inject context as system message
            const enhancedMessages = [
                {
                    role: 'system',
                    content: systemPrompt
                        ? `${systemPrompt}\n\n### Relevant Context:\n${contextPattern.relevantChunks.map((c) => c.text).join('\n')}`
                        : `### Relevant Context:\n${contextPattern.relevantChunks.map((c) => c.text).join('\n')}`,
                },
                ...messages.filter((m: any) => m.role !== 'system'),
            ];

            // Update request body
            const enhancedBody = {
                ...requestBody,
                messages: enhancedMessages,
            };

            // Make request
            const response = await fetch(url, {
                ...init,
                body: JSON.stringify(enhancedBody),
            });

            // Record response event in background
            if (response.ok) {
                response
                    .clone()
                    .json()
                    .then((data) => {
                        const assistantMessage = data.choices?.[0]?.message?.content;
                        if (assistantMessage) {
                            eventSystem.recordEvent({
                                type: 'response',
                                timestamp: new Date(),
                                data: {
                                    text: assistantMessage,
                                    metadata: { model: requestBody.model },
                                    conversationId,
                                },
                            });
                        }
                    })
                    .catch(() => { });
            }

            return response;
        } catch (error) {
            logger.error('Interception error', { error });
            return fetch(url, init);
        }
    };
}

