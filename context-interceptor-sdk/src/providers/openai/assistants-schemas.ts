import { z } from 'zod';

// Assistant schema
export const AssistantSchema = z.object({
  id: z.string(),
  object: z.literal('assistant'),
  created_at: z.number(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  model: z.string(),
  instructions: z.string().nullable().optional(),
  tools: z.array(z.any()),
  tool_resources: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  response_format: z.any().optional(),
});

// Thread schema
export const ThreadSchema = z.object({
  id: z.string(),
  object: z.literal('thread'),
  created_at: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
  tool_resources: z.record(z.string(), z.any()).optional(),
});

// Message in thread schema
export const ThreadMessageSchema = z.object({
  id: z.string(),
  object: z.literal('thread.message'),
  created_at: z.number(),
  thread_id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.array(z.any()),
  attachments: z.array(z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Run schema
export const RunSchema = z.object({
  id: z.string(),
  object: z.literal('thread.run'),
  created_at: z.number(),
  thread_id: z.string(),
  assistant_id: z.string(),
  status: z.enum([
    'queued',
    'in_progress',
    'requires_action',
    'cancelling',
    'cancelled',
    'failed',
    'completed',
    'expired',
  ]),
  model: z.string(),
  instructions: z.string().nullable().optional(),
  tools: z.array(z.any()),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Type inference
export type Assistant = z.infer<typeof AssistantSchema>;
export type Thread = z.infer<typeof ThreadSchema>;
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;
export type Run = z.infer<typeof RunSchema>;

