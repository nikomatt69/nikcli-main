import { Redis } from '@upstash/redis';
import { ConversationMessage } from '../types';
import { Logger } from '../utils/logger';
import { validateConversationId } from '../utils/validation';

export class RedisStore {
    private client: Redis;
    private logger: Logger;
    private keyPrefix: string = 'context-interceptor:';

    constructor(url: string, token: string, logger: Logger) {
        this.client = new Redis({
            url,
            token
        });
        this.logger = logger;
    }

    private getConversationKey(conversationId: string): string {
        return `${this.keyPrefix}conversation:${conversationId}`;
    }

    async saveMessage(conversationId: string, role: ConversationMessage['role'], content: string): Promise<void> {
        validateConversationId(conversationId);

        try {
            const message: ConversationMessage = {
                role,
                content,
                timestamp: new Date()
            };

            const key = this.getConversationKey(conversationId);

            this.logger.debug('Saving message to conversation', {
                conversationId,
                role,
                contentLength: content.length
            });

            await this.client.lpush(key, JSON.stringify(message));

            this.logger.debug('Message saved successfully', { conversationId, role });
        } catch (error) {
            this.logger.error('Failed to save message', {
                conversationId,
                role,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to save message: ${error}`);
        }
    }

    async getHistory(conversationId: string, limit: number = 10): Promise<ConversationMessage[]> {
        validateConversationId(conversationId);

        try {
            const key = this.getConversationKey(conversationId);

            this.logger.debug('Retrieving conversation history', {
                conversationId,
                limit
            });

            const messages = await this.client.lrange(key, 0, limit - 1);

            if (!messages || messages.length === 0) {
                this.logger.debug('No conversation history found', { conversationId });
                return [];
            }

            const parsed = messages
                .map((msg: string) => {
                    try {
                        const parsed = JSON.parse(msg);
                        return {
                            ...parsed,
                            timestamp: new Date(parsed.timestamp)
                        };
                    } catch {
                        this.logger.warn('Failed to parse message', { conversationId });
                        return null;
                    }
                })
                .filter((msg): msg is ConversationMessage => msg !== null)
                .reverse();

            this.logger.debug(`Retrieved ${parsed.length} messages from conversation`, {
                conversationId
            });

            return parsed;
        } catch (error) {
            this.logger.error('Failed to get conversation history', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to get history: ${error}`);
        }
    }

    async trimHistory(conversationId: string, maxMessages: number): Promise<void> {
        validateConversationId(conversationId);

        try {
            const key = this.getConversationKey(conversationId);

            this.logger.debug('Trimming conversation history', {
                conversationId,
                maxMessages
            });

            await this.client.ltrim(key, 0, maxMessages - 1);

            this.logger.debug('Conversation history trimmed', { conversationId });
        } catch (error) {
            this.logger.error('Failed to trim conversation history', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to trim history: ${error}`);
        }
    }

    async deleteConversation(conversationId: string): Promise<void> {
        validateConversationId(conversationId);

        try {
            const key = this.getConversationKey(conversationId);

            this.logger.debug('Deleting conversation', { conversationId });

            await this.client.del(key);

            this.logger.debug('Conversation deleted', { conversationId });
        } catch (error) {
            this.logger.error('Failed to delete conversation', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to delete conversation: ${error}`);
        }
    }

    async listConversations(): Promise<string[]> {
        try {
            this.logger.debug('Listing all conversations');

            const keys = await this.client.keys(`${this.keyPrefix}conversation:*`);

            const conversationIds = keys.map((key: string) =>
                key.replace(`${this.keyPrefix}conversation:`, '')
            );

            this.logger.debug(`Found ${conversationIds.length} conversations`);

            return conversationIds;
        } catch (error) {
            this.logger.error('Failed to list conversations', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to list conversations: ${error}`);
        }
    }

    async getConversationLength(conversationId: string): Promise<number> {
        validateConversationId(conversationId);

        try {
            const key = this.getConversationKey(conversationId);
            const length = await this.client.llen(key);
            return length;
        } catch (error) {
            this.logger.error('Failed to get conversation length', {
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to get conversation length: ${error}`);
        }
    }
}

export const createRedisStore = (url: string, token: string, logger: Logger): RedisStore => {
    return new RedisStore(url, token, logger);
};

