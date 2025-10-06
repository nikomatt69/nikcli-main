import { Logger } from '../../utils/logger';

export interface StreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: string;
            content?: string;
            tool_calls?: any[];
            function_call?: any;
        };
        finish_reason?: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class StreamingHandler {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Parse SSE stream line by line
     */
    parseStreamLine(line: string): StreamChunk | null {
        // SSE format: "data: {json}"
        if (!line.startsWith('data: ')) {
            return null;
        }

        const data = line.slice(6).trim();

        // Check for stream end
        if (data === '[DONE]') {
            this.logger.debug('Stream completed');
            return null;
        }

        try {
            return JSON.parse(data) as StreamChunk;
        } catch (error) {
            this.logger.warn('Failed to parse stream chunk', {
                line,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Process stream response
     */
    async* processStream(response: Response): AsyncGenerator<StreamChunk, void, unknown> {
        if (!response.body) {
            throw new Error('Response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    const chunk = this.parseStreamLine(line);
                    if (chunk) {
                        yield chunk;
                    }
                }
            }

            // Process any remaining data in buffer
            if (buffer.trim()) {
                const chunk = this.parseStreamLine(buffer);
                if (chunk) {
                    yield chunk;
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Accumulate stream chunks into complete response
     */
    async accumulateStream(stream: AsyncGenerator<StreamChunk>): Promise<{
        content: string;
        tool_calls?: any[];
        function_call?: any;
        usage?: any;
    }> {
        let content = '';
        let tool_calls: any[] | undefined;
        let function_call: any | undefined;
        let usage: any | undefined;

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            if (choice.delta.content) {
                content += choice.delta.content;
            }

            if (choice.delta.tool_calls) {
                if (!tool_calls) {
                    tool_calls = [];
                }
                // Accumulate tool calls
                for (const toolCall of choice.delta.tool_calls) {
                    if (!tool_calls[toolCall.index]) {
                        tool_calls[toolCall.index] = {
                            id: toolCall.id,
                            type: toolCall.type,
                            function: { name: '', arguments: '' }
                        };
                    }
                    if (toolCall.function?.name) {
                        tool_calls[toolCall.index].function.name += toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                        tool_calls[toolCall.index].function.arguments += toolCall.function.arguments;
                    }
                }
            }

            if (choice.delta.function_call) {
                if (!function_call) {
                    function_call = { name: '', arguments: '' };
                }
                if (choice.delta.function_call.name) {
                    function_call.name += choice.delta.function_call.name;
                }
                if (choice.delta.function_call.arguments) {
                    function_call.arguments += choice.delta.function_call.arguments;
                }
            }

            if (chunk.usage) {
                usage = chunk.usage;
            }
        }

        this.logger.debug('Stream accumulated', {
            contentLength: content.length,
            hasToolCalls: !!tool_calls,
            hasFunctionCall: !!function_call,
            hasUsage: !!usage
        });

        return { content, tool_calls, function_call, usage };
    }

    /**
     * Handle stream errors and recovery
     */
    async handleStreamError(error: any, onError?: (error: Error) => void): Promise<void> {
        this.logger.error('Stream error occurred', {
            error: error instanceof Error ? error.message : String(error)
        });

        if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Create a readable stream for web streaming API
     */
    createReadableStream(generator: AsyncGenerator<StreamChunk>): ReadableStream<Uint8Array> {
        const encoder = new TextEncoder();

        return new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of generator) {
                        const data = `data: ${JSON.stringify(chunk)}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });
    }
}

export const createStreamingHandler = (logger: Logger): StreamingHandler => {
    return new StreamingHandler(logger);
};

