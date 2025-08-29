import { ChatMessage } from './model-provider';

export type ModelScope = 'chat_default' | 'planning' | 'code_gen' | 'tool_light' | 'tool_heavy' | 'vision';

export interface ModelRouteInput {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'vercel' | 'gateway';
  baseModel: string; // model id configured as current for provider
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>;
  scope?: ModelScope;
  needsVision?: boolean;
  sizeHints?: { fileCount?: number; totalBytes?: number };
}

export interface ModelRouteDecision {
  selectedModel: string;
  tier: 'light' | 'medium' | 'heavy';
  reason: string;
  estimatedTokens: number;
  confidence: number; // 0..1
}

function estimateTokens(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((s, m) => s + (m.content?.length || 0), 0);
  return Math.max(1, Math.round(chars / 4));
}

function pickOpenAI(baseModel: string, tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Prefer GPT-5 family when base is gpt-5; otherwise fallback to 4o family
  const isGpt5 = /gpt-5/i.test(baseModel);
  if (needsVision) {
    // 4o family supports vision well; prefer 4o for vision tasks
    return 'gpt-4o';
  }
  if (isGpt5) {
    if (tier === 'heavy') return 'gpt-5';
    if (tier === 'medium') return 'gpt-5-mini-2025-08-07';
    return 'gpt-5-nano-2025-08-07';
  } else {
    if (tier === 'heavy') return 'gpt-4o';
    if (tier === 'medium') return 'gpt-4o-mini';
    // Light fallback — prefer mini; if not available, still use mini
    return 'gpt-4o-mini';
  }
}

function pickAnthropic(baseModel: string, tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Claude-4 Opus/Sonnet-4/3.5 Sonnet present in defaults; Haiku may not be configured
  if (tier === 'heavy') return 'claude-sonnet-4-20250514';
  if (tier === 'medium') return 'claude-3-7-sonnet-20250219';
  return 'claude-3-5-sonnet-latest'; // light fallback
}

function pickGoogle(_baseModel: string, tier: 'light' | 'medium' | 'heavy'): string {
  if (tier === 'heavy') return 'gemini-2.5-pro';
  if (tier === 'medium') return 'gemini-2.5-flash';
  return 'gemini-2.5-flash-lite';
}

function determineTier(tokens: number, scope?: ModelScope, content?: string): 'light' | 'medium' | 'heavy' {
  // Scope shortcuts override
  if (scope === 'tool_light') return 'light';
  if (scope === 'tool_heavy' || scope === 'planning' || scope === 'code_gen') return 'heavy';
  if (scope === 'vision') return tokens > 2000 ? 'heavy' : tokens > 800 ? 'medium' : 'light';

  // Keyword hints
  const text = (content || '').toLowerCase();
  const heavyHints = ['analizza la repository', 'analyze the repository', 'execution plan', 'generate plan', 'create project', 'multi-file', 'end-to-end'];
  if (heavyHints.some(k => text.includes(k))) return 'heavy';

  // Token thresholds
  if (tokens > 4000) return 'heavy';
  if (tokens > 800) return 'medium';
  return 'light';
}

export class AdaptiveModelRouter {
  choose(input: ModelRouteInput): ModelRouteDecision {
    const tokens = estimateTokens(input.messages);
    const lastUser = [...input.messages].reverse().find(m => m.role === 'user')?.content || '';
    const tier = determineTier(tokens, input.scope, lastUser);

    let selected = input.baseModel;
    let reason = 'base model';

    switch (input.provider) {
      case 'openai':
        selected = pickOpenAI(input.baseModel, tier, input.needsVision);
        reason = `openai ${tier}`;
        break;
      case 'anthropic':
        selected = pickAnthropic(input.baseModel, tier, input.needsVision);
        reason = `anthropic ${tier}`;
        break;
      case 'google':
        selected = pickGoogle(input.baseModel, tier);
        reason = `google ${tier}`;
        break;
      case 'vercel':
      case 'gateway':
        // Default: keep base model (gateways often wrap specific ids)
        selected = input.baseModel;
        reason = `${input.provider} base`;
        break;
      case 'ollama':
        selected = input.baseModel; // keep local model selection
        reason = 'ollama base';
        break;
    }

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: tokens,
      confidence: 0.7,
    };
  }
}

export const adaptiveModelRouter = new AdaptiveModelRouter();

