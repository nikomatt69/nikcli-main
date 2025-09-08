# Fix 04 — Providers: abort cleanup, timeout finally, SSE robustness

Affected file(s):

- src/tui/providers/src/OpenAIProvider.ts
- src/tui/providers/src/AnthropicProvider.ts
- src/tui/providers/src/OllamaProvider.ts

Severity: Medium

Problems

1. AbortSignal listeners are added but never removed.
2. Timeout cleared only on some paths; should be in finally.
3. SSE parsing assumes populated data lines; add small guards.

Impact

- Memory leaks over long sessions; possible dangling timeouts; brittle parsing on edge cases.

Remediation

```ts
const controller = new AbortController();
const onAbort = () => controller.abort();
abortSignal?.addEventListener("abort", onAbort);
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
try {
  const res = await fetch(url, { signal: controller.signal /* ... */ });
  // ... read stream, parse SSE with guards ...
  // inside reader loop
  const line = decoded.trim();
  if (!line) continue;
  if (line.startsWith("data:")) {
    const json = line.slice(5).trim();
    if (!json) continue;
    // parse json safely
  }
} finally {
  abortSignal?.removeEventListener("abort", onAbort);
  clearTimeout(timeoutId);
}
```

Test Plan

- Unit/Integration: start stream then abort via signal; ensure generator ends and listener is removed.
- Unit: inject blank/whitespace-only SSE lines; parser skips without errors.
- Unit: ensure timeout cancels request and is cleared in finally.

Acceptance Criteria

- No listener leaks (listener count stable across runs); streams abort promptly; no parsing crashes on empty lines.

Risk & Rollback

- Low risk; localized to provider streaming wrappers.
