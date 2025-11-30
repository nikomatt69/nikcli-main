import { type Context, context as otelContext, propagation, type Span, trace } from '@opentelemetry/api'

export class ContextPropagator {
  inject<T extends Record<string, string>>(carrier: T): T {
    propagation.inject(otelContext.active(), carrier)
    return carrier
  }

  extract<T extends Record<string, string>>(carrier: T): Context {
    return propagation.extract(otelContext.active(), carrier)
  }

  async withContext<T>(carrier: Record<string, string>, operation: () => Promise<T>): Promise<T> {
    const extractedContext = this.extract(carrier)
    return otelContext.with(extractedContext, operation)
  }

  withContextSync<T>(carrier: Record<string, string>, operation: () => T): T {
    const extractedContext = this.extract(carrier)
    return otelContext.with(extractedContext, operation)
  }

  getCurrentTraceId(): string | undefined {
    const span = trace.getActiveSpan()
    if (!span) return undefined

    const spanContext = span.spanContext()
    return spanContext.traceId
  }

  getCurrentSpanId(): string | undefined {
    const span = trace.getActiveSpan()
    if (!span) return undefined

    const spanContext = span.spanContext()
    return spanContext.spanId
  }

  isTracingEnabled(): boolean {
    const span = trace.getActiveSpan()
    if (!span) return false

    const spanContext = span.spanContext()
    return Boolean(spanContext.traceFlags & 0x01)
  }

  getTraceContext(): { traceId?: string; spanId?: string; traced: boolean } {
    return {
      traceId: this.getCurrentTraceId(),
      spanId: this.getCurrentSpanId(),
      traced: this.isTracingEnabled(),
    }
  }
}

export const contextPropagator = new ContextPropagator()
