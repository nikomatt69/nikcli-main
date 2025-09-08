# Fix 02 — Preserve system messages in truncateMessages

Affected file(s):

- src/tui/ai/src/streaming/AIService.ts

Severity: High

Problem

- truncateMessages may drop the initial system message while truncating to the token/char budget.

Impact

- Loss of system instructions leads to degraded or incorrect model behavior.

Remediation

- Always preserve system message(s) and then include as many recent non-system messages as fit within the budget.

Example (patch excerpt):

```ts
private truncateMessages(messages: Message[], maxTokens: number): Message[] {
  const maxChars = maxTokens * 4; // heuristic
  const systems = messages.filter(m => m.role === 'system');
  const others = messages.filter(m => m.role !== 'system');

  let used = systems.reduce((s, m) => s + (m.content?.length ?? 0), 0);
  const result: Message[] = [...systems];

  for (let i = others.length - 1; i >= 0; i--) {
    const m = others[i];
    const len = m.content?.length ?? 0;
    if (used + len > maxChars) break;
    result.unshift(m);
    used += len;
  }
  return result;
}
```

Enhancement (optional)

- Emit telemetry counter when messages are dropped.

Test Plan

- Unit: given [system, user1, asst1, user2, asst2] with small maxTokens, result keeps system and most recent turns.
- Unit: when no system message exists, behavior matches previous policy (tail-based truncation).

Acceptance Criteria

- System prompts are never dropped by truncation.

Risk & Rollback

- Low risk; localized function. Revert file if unexpected behavior occurs.
