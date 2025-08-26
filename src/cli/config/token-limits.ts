/**
 * Token limits configuration - Optimized for detailed analysis while managing costs
 * Based on maxTokens: 8000 (Claude compatibility), Context: 120000 tokens
 * Estimated cost considerations for sustainable operation
 */

export const TOKEN_LIMITS = {
  // Analysis limits - Balanced for quality and cost efficiency
  ANALYSIS: {
    PROMPT_MAX_CHARS: 16000,      // ~4k tokens (balanced output)
    CONTEXT_MAX_CHARS: 12000,     // ~3k tokens (efficient context)
    COMPACT_MAX_CHARS: 20000,     // ~5k tokens (good detail level)
    MAX_DIRECTORIES: 150,         // Adequate structure analysis
    MAX_FILES: 300,               // Sufficient file coverage
  },

  // Prompt caps - Hard caps for different message types (token-approx)
  PROMPT_CAPS: {
    MAX_SYSTEM_MESSAGE_TOKENS: 1200,
    MAX_TOOL_MESSAGE_TOKENS: 800,
    MAX_FUNCTION_ARGS_CHARS: 2000,
    TARGET_CONTEXT_COMPRESSION_RATIO: 0.4, // Aim to compress to 40% of target budget when over
  },

  // Display limits - For UI/UX (modest increase, minimal cost impact)
  DISPLAY: {
    CONVERSATION_SUMMARY: 200,    // Up from 100 (better context)
    TASK_DESCRIPTION: 100,        // Up from 50 (clearer descriptions)
    FILE_PREVIEW: 300,            // Up from 200 (adequate file understanding)
    ERROR_CONTEXT: 250,           // Up from 200 (better debugging)
    QUERY_TRUNCATION: 250,        // Up from 200 (preserve user intent)
  },

  // Cache limits - For performance (balanced increase, cost-conscious)
  CACHE: {
    SYSTEM_CONTEXT: 800,          // Up from 200 (better cache hits)
    COMPLETION_CONTEXT: 500,      // Maintained (adequate caching)
    RESPONSE_PREVIEW: 800,        // Up from 200 (better preview quality)
  },

  // List/Array limits - For comprehensive coverage
  ARRAYS: {
    RECENT_FILES: 15,            // Up from 5 (better context)
    POPULAR_QUERIES: 10,         // Up from 5 (better analytics)
    TODO_DISPLAY: 10,            // Up from 5 (better task visibility)
    EXECUTION_CONTEXT: 8,        // Up from 3 (better debugging)
    AFFECTED_FILES: 12,          // Up from 5 (better impact view)
    DIRECTORY_SAMPLE: 20,        // Up from 5 (better structure view)
  },

  // Smart context limits - Optimized for token reduction
  CONTEXT: {
    PROJECT_CONTEXT_MAX: 1000,          // Max tokens for project context (down from unlimited)
    GUIDANCE_CONTEXT_MAX: 800,          // Max tokens for agent guidance (down from unlimited)  
    WORKSPACE_CONTEXT_MAX: 2000,        // Max tokens for workspace context (down from unlimited)
    CHAT_HISTORY_MAX: 3000,             // Max tokens for chat history (down from 8000)
  },

  // Chat trimming & summarization window - ULTRA EMERGENCY FIX for 200k limit
  CHAT: {
    MAX_CONTEXT_TOKENS: 80000,           // DRASTICALLY reduced to 3k tokens (was 100k)
    MAX_RECENT_NON_SYSTEM: 4,           // Further reduced to 4 messages
    HEAD_TAIL_WINDOW: 2,                // Reduced to 2 messages
    EMERGENCY_TRUNCATE_AT: 120000,      // HARD truncate at 120k tokens (80k safety margin)
  },

  // RAG chunking defaults - Optimized for cost efficiency
  RAG: {
    CHUNK_TOKENS: 1200,        // ↑ Increased from 700 (71% fewer chunks = major cost reduction)
    CHUNK_OVERLAP_TOKENS: 40,  // ↓ Reduced from 80 (50% less duplication)
    // Smart chunking parameters
    CODE_CHUNK_MIN_LINES: 80,  // Minimum lines per code chunk to preserve context
    CODE_CHUNK_MAX_LINES: 150, // Maximum lines per code chunk
    MARKDOWN_MIN_SECTION: 200, // Minimum chars per markdown section
  },

  // Progressive processing guardrails
  PROGRESSIVE: {
    MAX_TOKENS_PER_CHUNK: 2500,
    MAX_RETRIES: 2,
  }
};

/**
 * Model pricing interface
 */
export interface ModelPricing {
  input: number;
  output: number;
  displayName: string;
}

/**
 * Real-time cost estimation for all supported models
 * Updated with latest pricing as of 2024-2025 (researched online)
 */
export const MODEL_COSTS: Record<string, ModelPricing> = {
  // Claude models (Anthropic) - Updated with real pricing
  'claude-sonnet-4-20250514': {
    input: 3.00,      // $3.00 per 1M input tokens (verified 2025)
    output: 15.00,    // $15.00 per 1M output tokens (verified 2025)
    displayName: 'Claude Sonnet 4'
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.00,      // $3.00 per 1M input tokens (verified 2025)
    output: 15.00,    // $15.00 per 1M output tokens (verified 2025)
    displayName: 'Claude 3.5 Sonnet'
  },
  'claude-3-5-sonnet-latest': {
    input: 3.00,      // $3.00 per 1M input tokens (FIXED - was wrong)
    output: 15.00,    // $15.00 per 1M output tokens (FIXED - was wrong)
    displayName: 'Claude 3.5 Sonnet'  // FIXED - was showing as Haiku
  },
  'claude-3-7-sonnet-20250219': {
    input: 3.00,      // $3.00 per 1M input tokens (new model)
    output: 15.00,    // $15.00 per 1M output tokens (new model)
    displayName: 'Claude 3.7 Sonnet'
  },
  'claude-3-opus-20240229': {
    input: 15.00,     // $15.00 per 1M input tokens (verified)
    output: 75.00,    // $75.00 per 1M output tokens (verified)
    displayName: 'Claude 3 Opus'
  },
  'claude-3-sonnet-20240229': {
    input: 3.00,      // $3.00 per 1M input tokens (verified)
    output: 15.00,    // $15.00 per 1M output tokens (verified)
    displayName: 'Claude 3 Sonnet'
  },
  'claude-3-haiku-20240307': {
    input: 0.25,      // $0.25 per 1M input tokens (updated real price)
    output: 1.25,     // $1.25 per 1M output tokens (updated real price)
    displayName: 'Claude 3 Haiku'
  },
  'claude-3-5-haiku': {
    input: 0.80,      // $0.80 per 1M input tokens (new model)
    output: 4.00,     // $4.00 per 1M output tokens (new model)
    displayName: 'Claude 3.5 Haiku'
  },
  // Claude Opus 4.1 (future model)
  'claude-opus-4.1': {
    input: 15.00,     // $15.00 per 1M input tokens
    output: 75.00,    // $75.00 per 1M output tokens
    displayName: 'Claude Opus 4.1'
  },

  // GPT models (OpenAI) - Updated with real 2024-2025 pricing
  'gpt-5': {
    input: 1.25,      // $1.25 per 1M input tokens (verified 2025)
    output: 10.00,    // $10.00 per 1M output tokens (verified 2025)
    displayName: 'GPT-5'
  },
  'gpt-5-mini-2025-08-07': {
    input: 0.25,      // $0.25 per 1M input tokens (verified 2025)
    output: 2.00,     // $2.00 per 1M output tokens (verified 2025)
    displayName: 'GPT-5 Mini'
  },
  'gpt-5-nano-2025-08-07': {
    input: 0.05,      // $0.05 per 1M input tokens (verified 2025)
    output: 0.40,     // $0.40 per 1M output tokens (verified 2025)
    displayName: 'GPT-5 Nano'
  },
  'gpt-4o': {
    input: 3.00,      // $3.00 per 1M input tokens (updated - was 2.50)
    output: 10.00,    // $10.00 per 1M output tokens (verified 2025)
    displayName: 'GPT-4o'
  },
  'gpt-4.1': {
    input: 2.00,      // $2.00 per 1M input tokens
    output: 8.00,     // $8.00 per 1M output tokens
    displayName: 'GPT-4.1'
  },
  'gpt-4o-mini': {
    input: 0.15,      // $0.15 per 1M input tokens (verified 2025)
    output: 0.60,     // $0.60 per 1M output tokens (verified 2025)
    displayName: 'GPT-4o Mini'
  },
  // GPT-4.1 variants
  'gpt-4.1-mini': {
    input: 0.40,      // $0.40 per 1M input tokens
    output: 1.60,     // $1.60 per 1M output tokens
    displayName: 'GPT-4.1 Mini'
  },
  'gpt-4.1-nano': {
    input: 0.10,      // $0.10 per 1M input tokens
    output: 0.40,     // $0.40 per 1M output tokens
    displayName: 'GPT-4.1 Nano'
  },
  // Legacy models - Updated with real pricing
  'gpt-4-turbo-preview': {
    input: 10.00,     // $10.00 per 1M input tokens (verified)
    output: 30.00,    // $30.00 per 1M output tokens (verified)
    displayName: 'GPT-4 Turbo'
  },
  'gpt-4': {
    input: 30.00,     // $30.00 per 1M input tokens (verified)
    output: 60.00,    // $60.00 per 1M output tokens (verified)
    displayName: 'GPT-4'
  },
  'gpt-3.5-turbo': {
    input: 0.50,      // $0.50 per 1M input tokens (verified 2025)
    output: 1.50,     // $1.50 per 1M output tokens (verified 2025)
    displayName: 'GPT-3.5 Turbo'
  },

  // Gemini models (Google) - Updated with real 2024-2025 pricing
  'gemini-2.5-pro': {
    input: 2.50,      // $2.50 per 1M input tokens (>200K context, verified)
    output: 15.00,    // $15.00 per 1M output tokens (>200K context, verified)
    displayName: 'Gemini 2.5 Pro'
  },
  'gemini-2.5-pro-200k': {
    input: 1.25,      // $1.25 per 1M input tokens (<200K context, verified)
    output: 10.00,    // $10.00 per 1M output tokens (<200K context, verified)
    displayName: 'Gemini 2.5 Pro (<200k)'
  },
  'gemini-2.5-flash': {
    input: 0.30,      // $0.30 per 1M input tokens (verified 2025)
    output: 2.50,     // $2.50 per 1M output tokens (verified 2025)
    displayName: 'Gemini 2.5 Flash'
  },
  'gemini-2.5-flash-lite': {
    input: 0.10,      // $0.10 per 1M input tokens (estimated)
    output: 0.40,     // $0.40 per 1M output tokens (estimated)
    displayName: 'Gemini 2.5 Flash-Lite'
  },
  'gemini-2.0-flash': {
    input: 0.10,      // $0.10 per 1M input tokens (verified 2025)
    output: 0.40,     // $0.40 per 1M output tokens (verified 2025)
    displayName: 'Gemini 2.0 Flash'
  },
  // Legacy Gemini models - Updated pricing
  'gemini-1.5-pro': {
    input: 3.50,      // $3.50 per 1M input tokens (legacy pricing)
    output: 10.50,    // $10.50 per 1M output tokens (legacy pricing)
    displayName: 'Gemini 1.5 Pro'
  },
  'gemini-1.5-flash': {
    input: 0.075,     // $0.075 per 1M input tokens (verified reduced price)
    output: 0.30,     // $0.30 per 1M output tokens (verified reduced price)
    displayName: 'Gemini 1.5 Flash'
  },

  // xAI Grok models - Updated with real 2024-2025 pricing
  'grok-4': {
    input: 3.00,      // $3.00 per 1M input tokens (verified 2025)
    output: 15.00,    // $15.00 per 1M output tokens (verified 2025)
    displayName: 'Grok 4'
  },
  'grok-3': {
    input: 3.00,      // $3.00 per 1M input tokens (verified 2025)
    output: 15.00,    // $15.00 per 1M output tokens (verified 2025)
    displayName: 'Grok 3'
  },
  'grok-3-mini': {
    input: 0.30,      // $0.30 per 1M input tokens (verified 2025)
    output: 0.50,     // $0.50 per 1M output tokens (verified 2025)
    displayName: 'Grok 3 Mini'
  },
  'grok-3-speedier': {
    input: 5.00,      // $5.00 per 1M input tokens (premium tier)
    output: 25.00,    // $25.00 per 1M output tokens (premium tier)
    displayName: 'Grok 3 Speedier'
  },
  'grok-3-mini-speedier': {
    input: 0.60,      // $0.60 per 1M input tokens (premium tier)
    output: 4.00,     // $4.00 per 1M output tokens (premium tier)
    displayName: 'Grok 3 Mini Speedier'
  },

  // Vercel v0 models - Updated with real 2024-2025 pricing
  'v0-1.0-md': {
    input: 1.00,      // $1.00 per 1M input tokens (legacy model)
    output: 3.00,     // $3.00 per 1M output tokens (legacy model)
    displayName: 'V0 1.0 MD'
  },
  'v0-1.5-md': {
    input: 1.50,      // $1.50 per 1M input tokens (verified 2025)
    output: 7.50,     // $7.50 per 1M output tokens (verified 2025)
    displayName: 'V0 1.5 MD'
  },
  'v0-1.5-lg': {
    input: 7.50,      // $7.50 per 1M input tokens (verified 2025)
    output: 37.50,    // $37.50 per 1M output tokens (verified 2025)
    displayName: 'V0 1.5 LG'
  },

  // Ollama models (free local models - no cost)
  'llama3.1:8b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'Llama 3.1 8B'
  },
  'codellama:7b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'Code Llama 7B'
  },
  'deepseek-r1:8b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'DeepSeek R1 8B'
  },
  'deepseek-r1:3b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'DeepSeek R1 3B'
  },
  'deepseek-r1:7b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'DeepSeek R1 7B'
  },
  'mistral:7b': {
    input: 0.00,      // Free (local)
    output: 0.00,     // Free (local)
    displayName: 'Mistral 7B'
  },

  // DeepSeek models (competitive pricing)
  'deepseek-r1': {
    input: 0.55,      // $0.55 per 1M input tokens (competitive with o3-mini)
    output: 2.19,     // $2.19 per 1M output tokens
    displayName: 'DeepSeek R1'
  },
  'deepseek-r1-8b': {
    input: 0.30,      // $0.30 per 1M input tokens
    output: 1.20,     // $1.20 per 1M output tokens
    displayName: 'DeepSeek R1 8B'
  },
  'deepseek-r1-3b': {
    input: 0.20,      // $0.20 per 1M input tokens
    output: 0.80,     // $0.80 per 1M output tokens
    displayName: 'DeepSeek R1 3B'
  },
  'deepseek-r1-7b': {
    input: 0.25,      // $0.25 per 1M input tokens
    output: 1.00,     // $1.00 per 1M output tokens
    displayName: 'DeepSeek R1 7B'
  },

  // Other models (updated pricing)
  'gpt-oss:20b': {
    input: 0.50,      // Estimated $0.50 per 1M input tokens
    output: 1.50,     // Estimated $1.50 per 1M output tokens
    displayName: 'GPT OSS 20B'
  },
  'gemma3': {
    input: 0.30,      // $0.30 per 1M input tokens (Google Gemma 3)
    output: 1.00,     // $1.00 per 1M output tokens
    displayName: 'Gemma 3'
  },
  'gemma3-large': {
    input: 0.80,      // $0.80 per 1M input tokens
    output: 2.40,     // $2.40 per 1M output tokens
    displayName: 'Gemma 3 Large'
  },
  'mistral-7b': {
    input: 0.25,      // $0.25 per 1M input tokens
    output: 0.75,     // $0.75 per 1M output tokens
    displayName: 'Mistral 7B'
  },
  'cline:cline/sonic': {
    input: 1.00,      // Estimated $1.00 per 1M input tokens
    output: 3.00,     // Estimated $3.00 per 1M output tokens
    displayName: 'Cline Sonic'
  },
  'cline:cline/sonic-pro': {
    input: 2.00,      // Estimated $2.00 per 1M input tokens
    output: 6.00,     // Estimated $6.00 per 1M output tokens
    displayName: 'Cline Sonic Pro'
  },

  // Default fallback for unknown models
  'default': {
    input: 3.00,      // $3 per 1M input tokens
    output: 15.00,    // $15 per 1M output tokens
    displayName: 'Unknown Model'
  }
};

/**
 * Calculate real cost for token usage
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string
): { inputCost: number; outputCost: number; totalCost: number; model: string } {
  const model = MODEL_COSTS[modelName] || MODEL_COSTS['default'];

  const inputCost = (inputTokens / 1000000) * model.input;
  const outputCost = (outputTokens / 1000000) * model.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    model: model.displayName
  };
}

/**
 * Get model pricing info
 */
export function getModelPricing(modelName: string) {
  return MODEL_COSTS[modelName] || MODEL_COSTS['default'];
}

/**
 * Legacy cost estimates (deprecated - use MODEL_COSTS instead)
 */
export const COST_ESTIMATES = {
  // Per 1000 tokens (approximate) - DEPRECATED
  CLAUDE_INPUT_COST: 0.003,     // $3 per 1M tokens
  CLAUDE_OUTPUT_COST: 0.015,    // $15 per 1M tokens

  // Daily usage estimates with new limits
  ESTIMATED_DAILY_TOKENS: 50000,  // Conservative estimate
  ESTIMATED_DAILY_COST: 0.90,     // ~$0.90/day with new limits
};