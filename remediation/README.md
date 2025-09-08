Remediation bundle

This folder contains one subfolder per fix with a concise report and a Mermaid diagram for implementation and review.

Contents

- 01-base-component/ — Persist component config, layout guards, token safety
- 02-ai-service-truncate/ — Preserve system messages during truncation
- 03-chat-container/ — Timer lifecycle and blessed props corrections
- 04-providers-streaming/ — Abort listener cleanup, timeout finalization, SSE guards
- 05-agent-manager/ — Await async shutdown in destroy()
- 06-message-history/ — Use safeRender for consistency
- 07-cross-cutting/ — Engines field, telemetry, key constants, docs

How to render diagrams

- Use Mermaid CLI: mmdc -i input.mmd -o output.svg
- Or paste .mmd content into https://mermaid.live

Suggested order of application

1. 01, 02, 03 (critical/high)
2. 04, 05 (medium)
3. 06, 07 (low)
