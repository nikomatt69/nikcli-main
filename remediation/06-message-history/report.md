# Fix 06 — MessageHistory rendering consistency

Affected file(s):

- src/tui/ai/src/chat/MessageHistory.ts

Severity: Low

Problem

- Uses el.screen.render() directly instead of a safeRender wrapper used elsewhere, reducing consistency and potentially missing error handling.

Impact

- Minor inconsistency; risk of render errors not being handled uniformly.

Remediation

- Replace direct screen.render() calls with safeRender(screen) where available.

Test Plan

- Manual/Unit: update message history, ensure safeRender is invoked and no behavior change.

Acceptance Criteria

- Rendering path is consistent across UI modules.

Risk & Rollback

- Very low; cosmetic/consistency-level change.
