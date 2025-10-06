import { z } from 'zod';

// Message content schemas
export const MessageContentSchema = z.union([
    z.string(),
    z.array(
        z.object({
            type: z.enum(['text', 'image_url']),
            text: z.string().optional(),
            image_url: z
                .object({
                    url: z.string().url(),
                    detail: z.enum(['low', 'high', 'auto']).optional(),
                })
                .optional(),
        })
    ),
]);

// Message schema
export const MessageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool', 'function']),
    content: MessageContentSchema.optional(),
    name: z.string().optional(),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
    function_call: z.any().optional(),
});

// Tool function schema
export const ToolFunctionSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.any()),
});

// Tool schema
export const ToolSchema = z.object({
    type: z.literal('function'),
    function: ToolFunctionSchema,
});

// Response format schemas
export const ResponseFormatSchema = z.union([
    z.object({ type: z.literal('text') }),
    z.object({ type: z.literal('json_object') }),
    z.object({
        type: z.literal('json_schema'),
        json_schema: z.object({
            name: z.string(),
            description: z.string().optional(),
            schema: z.record(z.string(), z.any()),
            strict: z.boolean().optional(),
        }),
    }),
]);

// Tool choice schema
export const ToolChoiceSchema = z.union([
    z.enum(['auto', 'none', 'required']),
    z.object({
        type: z.literal('function'),
        function: z.object({ name: z.string() }),
    }),
]);

// Main request schema
export const ChatCompletionRequestSchema = z.object({
    model: z.string(),
    messages: z.array(MessageSchema).min(1),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    n: z.number().int().min(1).max(128).optional(),
    stream: z.boolean().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    max_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    logit_bias: z.record(z.string(), z.number()).optional(),
    logprobs: z.boolean().optional(),
    top_logprobs: z.number().int().min(0).max(20).optional(),
    user: z.string().optional(),
    tools: z.array(ToolSchema).optional(),
    tool_choice: ToolChoiceSchema.optional(),
    parallel_tool_calls: z.boolean().optional(),
    response_format: ResponseFormatSchema.optional(),
    seed: z.number().int().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    stream_options: z
        .object({
            include_usage: z.boolean().optional(),
        })
        .optional(),
});

// Response schemas
export const ChatCompletionResponseSchema = z.object({
    id: z.string(),
    object: z.literal('chat.completion'),
    created: z.number(),
    model: z.string(),
    choices: z.array(
        z.object({
            index: z.number(),
            message: MessageSchema,
            finish_reason: z.string().nullable(),
            logprobs: z.any().nullable(),
        })
    ),
    usage: z
        .object({
            prompt_tokens: z.number(),
            completion_tokens: z.number(),
            total_tokens: z.number(),
        })
        .optional(),
    system_fingerprint: z.string().optional(),
});

// Type inference
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

