import { context as otelContext, type Span, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api'

export class TracerService {
  private readonly tracer: Tracer

  constructor(tracerName = 'nikcli-tracer') {
    this.tracer = trace.getTracer(tracerName)
  }

  async trackOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.tracer.startActiveSpan(operationName, async (span: Span) => {
      if (attributes) {
        span.setAttributes(attributes)
      }

      try {
        const result = await operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  trackOperationSync<T>(
    operationName: string,
    operation: () => T,
    attributes?: Record<string, string | number | boolean>
  ): T {
    return this.tracer.startActiveSpan(operationName, (span: Span) => {
      if (attributes) {
        span.setAttributes(attributes)
      }

      try {
        const result = operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        throw error
      } finally {
        span.end()
      }
    })
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const span = trace.getActiveSpan()
    if (span) {
      span.addEvent(name, attributes)
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    const span = trace.getActiveSpan()
    if (span) {
      span.setAttribute(key, value)
    }
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    const span = trace.getActiveSpan()
    if (span) {
      span.setAttributes(attributes)
    }
  }

  getActiveSpan(): Span | undefined {
    return trace.getActiveSpan()
  }

  getTracer(): Tracer {
    return this.tracer
  }
}

export const tracerService = new TracerService()
