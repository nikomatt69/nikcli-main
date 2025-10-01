# Adaptive Model Router - Intelligent Fallback System

## Overview

The `AdaptiveModelRouter` now includes an intelligent fallback mechanism that monitors model performance and automatically switches to safe fallback models when issues are detected, while respecting OpenRouter's internal routing for `@preset/nikcli`.

## Key Principles

### 1. **OpenRouter Internal Routing**
- For `@preset/nikcli` models, OpenRouter handles internal model selection
- The router does NOT override OpenRouter's decisions
- Only provides safety net when failures occur

### 2. **Intelligent Failure Detection**
- Tracks consecutive failures per model
- Threshold: **3 consecutive failures** triggers fallback
- Monitors success/failure rates for health status

### 3. **Safe Fallback Models**
Reliable models used when primary models fail:
- **OpenRouter**: `openai/gpt-4o-mini` (reliable, cost-effective)
- **OpenAI**: `gpt-4o-mini`
- **Anthropic**: `claude-3-5-sonnet-latest`
- **Google**: `gemini-2.5-flash`

## Architecture

### Performance Metrics Tracking

```typescript
interface ModelPerformanceMetrics {
  consecutiveFailures: number  // Consecutive failure count
  totalFailures: number         // Lifetime failures
  totalSuccesses: number        // Lifetime successes
  lastFailure?: Date           // Last failure timestamp
}
```

### Failure Thresholds

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `FAILURE_THRESHOLD` | 3 | Consecutive failures before fallback |
| `CONTEXT_WARNING_THRESHOLD` | 0.8 (80%) | Context usage warning level |

## Usage

### Recording Model Results

External callers should record success/failure after each model call:

```typescript
import { adaptiveModelRouter } from './adaptive-model-router'

// After successful model call
adaptiveModelRouter.recordSuccess(modelKey)

// After failed model call (error, timeout, etc.)
adaptiveModelRouter.recordFailure(modelKey)
```

### Checking Model Health

```typescript
const health = adaptiveModelRouter.getModelHealth(modelKey)

console.log(health.status)              // 'healthy' | 'degraded' | 'failing'
console.log(health.consecutiveFailures) // Number of consecutive failures
console.log(health.successRate)         // 0.0 - 1.0
```

### Getting Metrics

```typescript
const metrics = adaptiveModelRouter.getMetrics(modelKey)

console.log(metrics.consecutiveFailures)
console.log(metrics.totalFailures)
console.log(metrics.totalSuccesses)
```

### Resetting Metrics (After Recovery)

```typescript
// Reset metrics after manual intervention or confirmed recovery
adaptiveModelRouter.resetMetrics(modelKey)
```

## Behavior Flow

### Normal Operation

1. Request comes in with `@preset/nikcli` or specific model
2. Router applies tier-based logic (light/medium/heavy)
3. OpenRouter handles internal routing for `@preset/nikcli`
4. Model call succeeds → `recordSuccess()` resets consecutive failures

### Failure Detection

1. Model call fails (error, timeout, etc.)
2. External caller invokes `recordFailure(modelKey)`
3. Consecutive failure count increments
4. If count < 3: continues with normal routing
5. If count ≥ 3: **Fallback triggered**

### Fallback Mode

```
┌─────────────────────────────────────────┐
│ Model: @preset/nikcli                   │
│ Consecutive Failures: 3                 │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ ⚠️  Fallback Triggered                  │
│ Switch to: openai/gpt-4o-mini           │
│ Reason: "openrouter heavy (fallback    │
│          due to failures)"              │
└─────────────────────────────────────────┘
```

### Recovery

1. Use fallback model successfully
2. After stability confirmed, optionally reset metrics:
   ```typescript
   adaptiveModelRouter.resetMetrics('@preset/nikcli')
   ```
3. Next call uses original model again with clean slate

## Context Usage Optimization

The router monitors context window usage and warns when >80%:

```typescript
// Automatic warning logged when context usage is high
if (contextUsage > 0.8) {
  structuredLogger.warning(
    `High context usage: ${Math.round(contextUsage * 100)}%`,
    { model, tokens, contextLimit, tier }
  )
}
```

This helps identify when:
- Messages should be truncated
- Tier should be upgraded to model with larger context
- Request should be split into multiple calls

## Health Status Levels

| Status | Criteria |
|--------|----------|
| **Healthy** | No consecutive failures, success rate ≥ 80% |
| **Degraded** | 1-2 consecutive failures OR success rate < 80% |
| **Failing** | ≥3 consecutive failures (fallback active) |

## Integration Points

### 1. Model Provider Layer
After each model API call:
```typescript
try {
  const response = await callModelAPI(...)
  adaptiveModelRouter.recordSuccess(modelKey)
  return response
} catch (error) {
  adaptiveModelRouter.recordFailure(modelKey)
  throw error
}
```

### 2. Monitoring Dashboard
Display health status in `/config` or monitoring UI:
```typescript
const health = adaptiveModelRouter.getModelHealth('@preset/nikcli')
console.log(`Model Health: ${health.status}`)
console.log(`Success Rate: ${(health.successRate * 100).toFixed(1)}%`)
```

### 3. Alerting System
Trigger alerts when models enter failing state:
```typescript
const health = adaptiveModelRouter.getModelHealth(modelKey)
if (health.status === 'failing') {
  sendAlert(`Model ${modelKey} is failing - using fallback`)
}
```

## Benefits

✅ **Automatic Recovery**: Switches to reliable fallback without manual intervention
✅ **Minimal Disruption**: Only activates after confirmed failure pattern (3+ failures)
✅ **Respects OpenRouter**: Doesn't interfere with internal routing for `@preset/nikcli`
✅ **Context Awareness**: Warns about high context usage before errors occur
✅ **Performance Monitoring**: Tracks long-term success/failure rates
✅ **Production-Ready**: Safe, tested fallback models for each provider

## Example Scenarios

### Scenario 1: OpenRouter Outage
```
Call 1: @preset/nikcli → Timeout → recordFailure() → count = 1
Call 2: @preset/nikcli → Timeout → recordFailure() → count = 2
Call 3: @preset/nikcli → Timeout → recordFailure() → count = 3
Call 4: @preset/nikcli → Fallback to openai/gpt-4o-mini → Success ✓
```

### Scenario 2: Temporary Network Issue
```
Call 1: @preset/nikcli → Network error → recordFailure() → count = 1
Call 2: @preset/nikcli → Success ✓ → recordSuccess() → count = 0 (reset)
```

### Scenario 3: High Context Usage
```
Call: @preset/nikcli → 15K tokens / 16K context = 93.75%
→ Warning logged: "High context usage: 94%"
→ Continues with call (no fallback needed)
→ Caller can truncate messages or upgrade tier
```

## Configuration

Currently hardcoded, but can be made configurable:

```typescript
// Future: Load from config
const config = {
  failureThreshold: 3,
  contextWarningThreshold: 0.8,
  fallbackModels: {
    openrouter: 'openai/gpt-4o-mini',
    // ...
  }
}
```

## Testing

Test failure scenarios:
```typescript
// Simulate 3 failures
adaptiveModelRouter.recordFailure('@preset/nikcli')
adaptiveModelRouter.recordFailure('@preset/nikcli')
adaptiveModelRouter.recordFailure('@preset/nikcli')

// Next call should use fallback
const decision = await adaptiveModelRouter.choose({
  provider: 'openrouter',
  baseModel: '@preset/nikcli',
  messages: [...],
})

console.log(decision.selectedModel) // 'openai/gpt-4o-mini'
console.log(decision.reason)        // '... (fallback due to failures)'
```

## File Location

`/Volumes/SSD/Documents/Personal/nikcli-main/src/cli/ai/adaptive-model-router.ts`

Lines 177-443: Fallback system implementation
