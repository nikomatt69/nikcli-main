# Fix 07 — Cross-cutting improvements

Areas:

- Node/runtime requirements
- Telemetry and diagnostics
- Key binding constants
- Documentation

Severity: Low

Problems & Remediations

1. Node/global APIs

- Problem: Relies on global fetch, TextDecoder, AbortController (Node 18+).
- Fix: Add engines field to package.json: { "engines": { "node": ">=18" } } and/or polyfills.

2. Telemetry for truncation/dropped chunks

- Problem: Backpressure and truncation drop counts not visible.
- Fix: Add counters (e.g., truncation_dropped_messages, stream_dropped_chunks) and log at debug level.

3. Key binding consistency

- Problem: Mixed usage of 'C-r' strings vs constants.
- Fix: Centralize key constants and reuse across components.

4. Documentation

- Problem: Unclear minimum Node version and streaming behavior.
- Fix: Update README and package docs with engines, abort behavior, and truncation policy.

Test Plan

- CI: enforce Node 18+ matrix; lint for key-constant usage.

Acceptance Criteria

- Clear engines metadata; minimal noisy logs; consistent key binding usage.

Risk & Rollback

- None; documentation/config only.
