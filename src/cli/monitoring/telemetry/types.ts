export interface TelemetryConfig {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly endpoint: string;
  readonly enabled: boolean;
  readonly sampleRate: number;
  readonly exportIntervalMs?: number;
  readonly maxQueueSize?: number;
  readonly maxBatchSize?: number;
}

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
}

export interface TraceMetadata {
  readonly operation: string;
  readonly duration: number;
  readonly status: 'ok' | 'error';
  readonly attributes?: Record<string, string | number | boolean>;
  readonly events?: readonly TraceEvent[];
}

export interface TraceEvent {
  readonly name: string;
  readonly timestamp: Date;
  readonly attributes?: Record<string, string | number | boolean>;
}

export interface TracingStats {
  readonly totalSpans: number;
  readonly activeSpans: number;
  readonly exportedSpans: number;
  readonly droppedSpans: number;
  readonly averageSpanDuration: number;
}
