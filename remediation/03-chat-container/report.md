# Fix 03 — ChatContainer timers and blessed props

Affected file(s):

- src/tui/ai/src/chat/ChatContainer.ts

Severity: High (timers), Medium (props)

Problems

1. Error toast auto-hide timer is not cleared on destroy(), risking callbacks after teardown.
2. Nonstandard blessed props like borderStyle/borderColor may have no effect.
3. textbox.clearValue() may not exist in your blessed version.

Impact

- Potential post-destroy exceptions; visual styling may be ineffective; input clearing may throw.

Remediation

1. Track and clear timers on destroy

```ts
private errorToastTimer: NodeJS.Timeout | null = null;

showError(msg: string) {
  // ... show toast ...
  if (this.errorToastTimer) clearTimeout(this.errorToastTimer);
  this.errorToastTimer = setTimeout(() => {
    // ... hide toast ...
    this.errorToastTimer = null;
  }, 5000);
}

destroy() {
  if (this.errorToastTimer) clearTimeout(this.errorToastTimer);
  this.errorToastTimer = null;
  this.root.destroy();
}
```

2. Use canonical blessed styling props

```ts
this.input = blessed.textbox({
  border: { type: "line" },
  style: { border: { fg: "cyan" } },
  inputOnFocus: true,
});
```

3. Clear value compatibly

```ts
this.input.setValue("");
if (typeof (this.input as any).clearValue === "function") {
  (this.input as any).clearValue();
}
this.screen.render();
```

Test Plan

- Integration: showError then destroy() before timeout fires; no exceptions.
- Visual: input border shows as expected.
- Functional: pressing Enter clears textbox reliably.

Acceptance Criteria

- No callbacks fire after destroy; styling renders; input clearing is stable across blessed versions.

Risk & Rollback

- Low risk; local to ChatContainer.
