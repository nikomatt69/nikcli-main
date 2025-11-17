import { authProvider } from '../providers/supabase/auth-provider'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import type { MessageTokenInfo, SessionContext } from '../core/context-token-manager'

/**
 * Record per-user token usage metrics for the current authenticated user.
 *
 * This helper is intentionally defensive:
 * - No-ops when Supabase or auth are disabled/not configured
 * - Swallows errors to avoid impacting the CLI UX
 *
 * Metrics are stored in the existing Supabase `metrics` table via EnhancedSupabaseProvider.
 */
export async function recordTokenUsageForCurrentUser(
  messageInfo: MessageTokenInfo,
  session: SessionContext
): Promise<void> {
  try {
    // Require an authenticated user with a loaded profile
    const profile = authProvider.getCurrentProfile()
    if (!profile || !authProvider.isAuthenticated()) {
      return
    }

    // Determine whether this is input or output tokens from the user's perspective
    const direction: 'input' | 'output' =
      messageInfo.role === 'assistant' ? 'output' : 'input'

    const eventData = {
      provider: session.provider,
      model: session.model,
      direction,
      tokens: messageInfo.tokens,
      cost: messageInfo.cost,
      messageId: messageInfo.messageId,
      cumulativeTokens: messageInfo.cumulativeTokens,
    }

    const metadata = {
      source: 'nikcli-cli',
      command: 'chat',
      environment: process.env.NODE_ENV || 'development',
    }

    // Persist fine-grained token usage metric
    await enhancedSupabaseProvider.recordMetric({
      user_id: profile.id,
      session_id: session.sessionId,
      event_type: 'token_usage',
      event_data: eventData,
      metadata,
    })

    // Keep aggregate token usage on the user profile in sync where available
    try {
      await authProvider.recordUsage('tokens', messageInfo.tokens)
    } catch {
      // Profile usage updates are best-effort; ignore failures
    }
  } catch {
    // Metrics recording must never break the main CLI flow
    return
  }
}


