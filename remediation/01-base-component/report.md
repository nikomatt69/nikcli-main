# Fix 01 — BaseComponent state/config persistence and layout handling

Affected file(s):

- src/tui/core/src/components/BaseComponent.ts

Severity: High

Problem

- variant, size, and state are captured as immutable locals at construction time. Methods like update(), setVariant(), and setSize() mutate stale values and do not persist across subsequent renders.
- Layout code assumes numeric width/height; when strings like '100%' or '50%' are used, numeric math yields NaN.
- normalizePadding uses unsafe casts; computeBlessedStyle requires tokens without guards.

Impact

- UI components re-render with stale styles, causing inconsistent theming and behavior.
- Potential runtime layout glitches when using percentage-based sizing.
- Possible runtime exceptions if tokens module shape changes or is missing.

Remediation

1. Persist config via a mutable closure object

- Create a config object to store variant, size, and state. Always read/write through config.

Example (patch excerpt):

```ts
// Before
const variant = opts.variant;
const size = opts.size;
const state = opts.state || "default";

// After
const config = {
  variant: opts.variant,
  size: opts.size,
  state: opts.state ?? "default",
};

function setVariant(newVariant: ComponentVariant) {
  config.variant = newVariant;
  refreshStyles();
}

function setSize(newSize: ComponentSize) {
  config.size = newSize;
  refreshStyles();
}

function setState(newState: ComponentState) {
  config.state = newState;
  refreshStyles();
}

function getConfig() {
  return {
    variant: config.variant,
    size: config.size,
    state: config.state,
    theme,
    responsive: props.responsive,
  };
}

function refreshStyles() {
  const tokens = getComponentTokens(componentName, config.variant, config.size);
  const style = computeBlessedStyle(tokens, config.state, theme);
  el.style = mergeComponentStyles(baseStyle, style);
  safeRender(el.screen);
}
```

2. Guard layout math for non-numeric dimensions

```ts
const widthNum =
  typeof el.width === "number" ? (el.width as number) : undefined;
const heightNum =
  typeof el.height === "number" ? (el.height as number) : undefined;
if (widthNum != null && heightNum != null) {
  // safe numeric layout math
}
// Otherwise: skip numeric-only calculations or parse percentage relative to parent if needed.
```

3. Safer normalizePadding

```ts
function normalizePadding(
  p?: number | { top?: number; right?: number; bottom?: number; left?: number },
) {
  if (p === undefined || p === null) return undefined;
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  const { top = 0, right = 0, bottom = 0, left = 0 } = p;
  return { top, right, bottom, left };
}
```

4. Guard design tokens and provide defaults

```ts
let tokens: any = {};
try {
  tokens = require("../theming/design-tokens").tokens ?? {};
} catch {}
const space = tokens.space ?? { 0: 0, 1: 1 };
// use optional chaining when reading tokens
```

Test Plan

- Unit: setVariant/setSize/update should persist values; getConfig reflects changes; styles refresh.
- Integration: components with width/height set to '100%' should not trigger NaN math.
- Regression: removing/altering design tokens should not crash; defaults apply.

Acceptance Criteria

- State changes persist across renders.
- No NaN layout calculations when using string-based dimensions.
- No uncaught exceptions from tokens import.

Risk & Rollback

- Low risk; localized changes. If regressions occur, revert to previous component file and reopen issue.
