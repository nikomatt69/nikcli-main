import { TOKEN_LIMITS } from '../config/token-limits'
import { truncateForPrompt } from './analysis-utils'

export type SimpleMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function estimateTokens(text: string): number {
  if (!text) return 0
  // Rough heuristic: 4 chars ≈ 1 token
  return Math.ceil(text.length / 4)
}

/**
 * Token-aware truncation for arbitrary message shapes (CoreMessage-like).
 * - Caps by tokens for system/tool messages.
 * - Truncates text parts within array content.
 */
export function truncateMessageByTokensAny<M extends { role?: string; content: any }>(
  message: M,
  maxTokens: number,
  maxFunctionArgsChars: number = TOKEN_LIMITS.PROMPT_CAPS.MAX_FUNCTION_ARGS_CHARS
): M {
  if (!message) return message

  const maxChars = Math.max(0, Math.floor(maxTokens * 4))
  const clone: any = { ...message }
  const _role = (clone.role || '').toString()

  // Helper to truncate strings safely
  const t = (s: string, limit: number) => truncateForPrompt(s || '', Math.max(0, limit))

  // String content
  if (typeof clone.content === 'string') {
    clone.content = t(clone.content, maxChars)
    return clone
  }

  // Array content (e.g., tool messages with parts)
  if (Array.isArray(clone.content)) {
    let used = 0
    clone.content = clone.content.map((part: any) => {
      if (typeof part === 'string') {
        const remain = Math.max(0, maxChars - used)
        const out = t(part, remain)
        used += out.length
        return out
      }
      if (part && typeof part === 'object') {
        const cp = { ...part }
        if (typeof cp.text === 'string') {
          const remain = Math.max(0, maxChars - used)
          cp.text = t(cp.text, remain)
          used += cp.text.length
        }
        // Clamp any obvious function arg payloads if present
        if (cp.args && typeof cp.args === 'string') {
          cp.args = t(cp.args, maxFunctionArgsChars)
        }
        return cp
      }
      return part
    })
    return clone
  }

  // Object content (fallback: stringify then truncate)
  try {
    const s = JSON.stringify(clone.content)
    clone.content = t(s, maxChars)
  } catch {
    // leave as is if not serializable
  }
  return clone
}

export function logPromptDiagnostics(tag: string, messages: SimpleMessage[]): void {
  const enabled = process.env.NIK_PROMPT_DEBUG === '1' || process.env.NIK_PROMPT_DEBUG?.toLowerCase() === 'true'
  if (!enabled) return

  const per = messages.map((m, i) => ({
    i,
    role: m.role,
    chars: m.content?.length ?? 0,
    estTokens: estimateTokens(m.content || ''),
  }))
  const totalChars = per.reduce((a, b) => a + b.chars, 0)
  const totalTokens = per.reduce((a, b) => a + b.estTokens, 0)
  // eslint-disable-next-line no-console
  console.log(`[prompt][${tag}] messages=${messages.length} chars=${totalChars} tokens≈${totalTokens}`, per)
}

export interface TruncateOptions {
  maxContextChars?: number // budget for non-system messages
  maxSystemChars?: number // per-system message cap
  keepLast?: number // number of recent non-system messages to preserve
}

export function truncateMessagesForPrompt<T extends SimpleMessage>(messages: T[], opts: TruncateOptions = {}): T[] {
  const maxContextChars = opts.maxContextChars ?? TOKEN_LIMITS.ANALYSIS.CONTEXT_MAX_CHARS
  const maxSystemChars = opts.maxSystemChars ?? TOKEN_LIMITS.PROMPT_CAPS.MAX_SYSTEM_MESSAGE_TOKENS * 4
  const keepLast = opts.keepLast ?? 10

  const systemMessages: T[] = []
  const nonSystemMessages: T[] = []

  for (const m of messages) {
    if (m.role === 'system') systemMessages.push(m)
    else nonSystemMessages.push(m)
  }

  // Truncate system messages aggressively
  const truncatedSystem = systemMessages.map((m) => ({
    ...m,
    content: truncateForPrompt(m.content || '', maxSystemChars),
  }))

  // Keep only the last N non-system messages
  const recent = nonSystemMessages.slice(-keepLast).map((m) => ({ ...m }))

  // Ensure combined non-system messages fit within maxContextChars
  let currentChars = recent.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)

  // Drop oldest until within budget
  while (recent.length > 1 && currentChars > maxContextChars) {
    const removed = recent.shift()
    currentChars -= removed?.content?.length ?? 0
  }

  // If still too large, truncate the remaining last message
  if (recent.length >= 1 && currentChars > maxContextChars) {
    const last = recent[recent.length - 1]!
    const allowed = Math.max(500, maxContextChars) // ensure we keep something meaningful
    last.content = truncateForPrompt(last.content || '', allowed)
  }

  // If we removed messages, insert a truncation notice just after system messages
  const removedCount = Math.max(0, nonSystemMessages.length - recent.length)
  const result: T[] = [...truncatedSystem]
  if (removedCount > 0) {
    const notice = {
      role: 'system',
      content: `[Conversation truncated] ${removedCount} older messages were removed to fit context limits. Recent context preserved.`,
    } as T
    result.push(notice)
  }

  result.push(...recent)
  return result
}
