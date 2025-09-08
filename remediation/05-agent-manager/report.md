# Fix 05 — AgentManager destroy awaiting async shutdown

Affected file(s):

- src/tui/agents/src/manager/AgentManager.ts

Severity: Medium

Problem

- destroy() calls async stopAllAgents() but does not await it. Manager clears internal maps/listeners before agents are fully stopped, causing race conditions.

Impact

- Unclean shutdown; possible callbacks or logs after teardown.

Remediation

```ts
export class AgentManager {
  // ...
  async destroy(): Promise<void> {
    try {
      await this.stopAllAgents();
    } finally {
      this.agents.clear();
      this.emitter.removeAllListeners();
    }
  }
}
```

Also prefer typed import for consistency:

```ts
import { EventEmitter } from "events";
```

Test Plan

- Integration: start multiple agents, call destroy(); assert all agents stopped before resources cleared.

Acceptance Criteria

- No post-destroy activity; deterministic shutdown order.

Risk & Rollback

- Low; isolated to lifecycle handling.
