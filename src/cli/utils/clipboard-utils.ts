import { z } from "zod";

// ============================================================================
// Type Definitions and Schemas
// ============================================================================

/**
 * Configuration schema for clipboard monitoring
 */
export const ClipboardConfigSchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(0).default(1000),
  indicatorDuration: z.number().min(500).max(30000).default(3000),
  debounceMs: z.number().min(0).default(100),
  maxContentLength: z.number().min(0).default(100000),
  includeMetadata: z.boolean().default(true),
  logEvents: z.boolean().default(false),
});

export type ClipboardConfig = z.infer<typeof ClipboardConfigSchema>;

/**
 * Clipboard event data schema
 */
export const ClipboardEventSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  contentLength: z.number().min(0),
  contentPreview: z.string().max(500),
  contentType: z.enum(["text", "html", "image", "mixed", "unknown"]),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type ClipboardEvent = z.infer<typeof ClipboardEventSchema>;

/**
 * Indicator display state schema
 */
export const IndicatorStateSchema = z.object({
  visible: z.boolean(),
  type: z.enum(["info", "warning", "error", "success"]),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
  thresholdExceeded: z.boolean(),
  thresholdValue: z.number(),
  actualValue: z.number(),
  timestamp: z.date(),
});

export type IndicatorState = z.infer<typeof IndicatorStateSchema>;

/**
 * Analysis result schema
 */
export const ClipboardAnalysisSchema = z.object({
  valid: z.boolean(),
  length: z.number().min(0),
  exceedsThreshold: z.boolean(),
  threshold: z.number(),
  percentage: z.number().min(0).max(100),
  lines: z.number().min(0),
  words: z.number().min(0),
  characters: z.number().min(0),
  estimatedTokens: z.number().min(0),
  contentType: z.enum(["text", "html", "image", "mixed", "unknown"]),
  hasSensitiveData: z.boolean().optional(),
  suggestions: z.array(z.string()),
});

export type ClipboardAnalysis = z.infer<typeof ClipboardAnalysisSchema>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CLIPBOARD_CONFIG: ClipboardConfig = {
  enabled: true,
  threshold: 1000,
  indicatorDuration: 3000,
  debounceMs: 100,
  maxContentLength: 100000,
  includeMetadata: true,
  logEvents: false,
};

// ============================================================================
// Core Utility Functions
// ============================================================================

/**
 * Detects paste events on a target element
 *
 * @param element - DOM element to attach paste event listener to
 * @param callback - Callback function to execute on paste event
 * @param config - Clipboard configuration options
 * @returns Cleanup function to remove event listener
 *
 * @example
 * ```ts
 * const inputElement = document.querySelector('textarea')!
 * const cleanup = detectPasteEvent(inputElement, (event) => {
 *   console.log('Paste detected:', event)
 * }, { threshold: 500 })
 *
 * // Later: cleanup()
 * ```
 */
export function detectPasteEvent(
  element: HTMLElement,
  callback: (event: ClipboardEvent) => void,
  config: Partial<ClipboardConfig> = {},
): () => void {
  const fullConfig = { ...DEFAULT_CLIPBOARD_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return () => { };
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  const handlePaste = (e: Event) => {
    const clipboardEvent = e as any;

    // Clear previous debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Apply debounce
    debounceTimer = setTimeout(() => {
      const clipboardData = clipboardEvent.clipboardData[''];
      if (!clipboardData) return;

      // Extract content
      const textData = clipboardData.getData("text/plain") || "";
      const htmlData = clipboardData.getData("text/html") || "";
      const hasImages = Array.from(clipboardData.items).some((item: any) =>
        item.type.startsWith("image/"),
      );

      // Determine content type
      let contentType: ClipboardEvent["contentType"] = "text";
      if (hasImages && (textData || htmlData)) {
        contentType = "mixed";
      } else if (hasImages) {
        contentType = "image";
      } else if (htmlData && !textData) {
        contentType = "html";
      }

      // Validate content length
      const contentLength = textData.length;
      if (contentLength > fullConfig.maxContentLength) {
        console.warn(
          `Clipboard content exceeds maximum length: ${contentLength}`,
        );
        return;
      }

      // Create event object
      const pasteEvent: ClipboardEvent = {
        id: generateEventId(),
        timestamp: new Date(),
        contentLength,
        contentPreview: textData.slice(0, 500),
        contentType,
        source: element.id || element.className || "unknown",
        metadata: fullConfig.includeMetadata
          ? {
            hasImages,
            hasHtml: !!htmlData,
            itemsCount: clipboardData.items.length,
          }
          : undefined,
      };

      if (fullConfig.logEvents) {
        console.log("[Clipboard] Paste detected:", pasteEvent);
      }

      callback(pasteEvent);
    }, fullConfig.debounceMs);
  };

  element.addEventListener("paste", handlePaste);

  // Return cleanup function
  return () => {
    element.removeEventListener("paste", handlePaste);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}

/**
 * Analyzes clipboard content length and provides detailed metrics
 *
 * @param content - Clipboard content to analyze
 * @param config - Clipboard configuration options
 * @returns Analysis result with metrics and suggestions
 *
 * @example
 * ```ts
 * const analysis = analyzeClipboardLength('Hello world', { threshold: 100 })
 * console.log(analysis.exceedsThreshold) // false
 * console.log(analysis.words) // 2
 * console.log(analysis.lines) // 1
 * ```
 */
export function analyzeClipboardLength(
  content: string,
  config: Partial<ClipboardConfig> = {},
): ClipboardAnalysis {
  const fullConfig = { ...DEFAULT_CLIPBOARD_CONFIG, ...config };

  const length = content.length;
  const exceedsThreshold = length > fullConfig.threshold;
  const percentage = Math.min((length / fullConfig.threshold) * 100, 999);

  // Count lines
  const lines = content.split("\n").length;

  // Count words
  const words = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // Count characters (excluding whitespace)
  const characters = content.replace(/\s/g, "").length;

  // Estimate tokens (rough approximation: ~4 chars per token)
  const estimatedTokens = Math.ceil(length / 4);

  // Determine content type
  let contentType: ClipboardAnalysis["contentType"] = "text";
  if (content.includes("<") && content.includes(">")) {
    contentType = "html";
  }

  // Generate suggestions based on analysis
  const suggestions: string[] = [];

  if (exceedsThreshold) {
    suggestions.push(
      `Content exceeds threshold by ${length - fullConfig.threshold} characters`,
    );
    suggestions.push("Consider splitting into smaller chunks");
  }

  if (lines > 100) {
    suggestions.push("Large number of lines detected");
  }

  if (estimatedTokens > 4000) {
    suggestions.push("Token count may exceed model context limits");
  }

  if (percentage > 90) {
    suggestions.push("Approaching threshold limit");
  }

  return {
    valid: length > 0,
    length,
    exceedsThreshold,
    threshold: fullConfig.threshold,
    percentage,
    lines,
    words,
    characters,
    estimatedTokens,
    contentType,
    hasSensitiveData: detectSensitiveData(content),
    suggestions,
  };
}

/**
 * Triggers indicator display based on threshold analysis
 *
 * @param analysis - Clipboard analysis result
 * @param showIndicator - Function to display the indicator
 * @param config - Clipboard configuration options
 * @returns Indicator state and cleanup function
 *
 * @example
 * ```ts
 * const analysis = analyzeClipboardLength(content, { threshold: 1000 })
 * const { state, cleanup } = triggerIndicator(analysis, (indicator) => {
 *   console.log('Show indicator:', indicator.message)
 * })
 *
 * // Later: cleanup()
 * ```
 */
export function triggerIndicator(
  analysis: ClipboardAnalysis,
  showIndicator: (state: IndicatorState) => void,
  config: Partial<ClipboardConfig> = {},
): { state: IndicatorState; cleanup: () => void } {
  const fullConfig = { ...DEFAULT_CLIPBOARD_CONFIG, ...config };

  // Determine indicator type based on analysis
  let indicatorType: IndicatorState["type"] = "info";

  if (analysis.percentage > 150) {
    indicatorType = "error";
  } else if (analysis.percentage > 100) {
    indicatorType = "warning";
  } else if (analysis.exceedsThreshold) {
    indicatorType = "warning";
  }

  // Create indicator message
  let message = "";
  if (analysis.exceedsThreshold) {
    message = `Content (${analysis.length.toLocaleString()} chars) exceeds threshold (${fullConfig.threshold.toLocaleString()})`;
  } else if (analysis.percentage > 90) {
    message = `Content approaching threshold: ${Math.round(analysis.percentage)}%`;
  } else {
    message = `Content length: ${analysis.length.toLocaleString()} chars`;
  }

  // Add suggestions to message if available
  if (analysis.suggestions.length > 0 && indicatorType !== "info") {
    message += `. ${analysis.suggestions[0]}`;
  }

  // Create indicator state
  const state: IndicatorState = {
    visible: true,
    type: indicatorType,
    message,
    progress: Math.min(analysis.percentage, 100),
    thresholdExceeded: analysis.exceedsThreshold,
    thresholdValue: fullConfig.threshold,
    actualValue: analysis.length,
    timestamp: new Date(),
  };

  // Display indicator
  showIndicator(state);

  // Set up auto-hide timer
  let hideTimer: NodeJS.Timeout | null = null;

  if (fullConfig.indicatorDuration > 0) {
    hideTimer = setTimeout(() => {
      showIndicator({ ...state, visible: false });
    }, fullConfig.indicatorDuration);
  }

  // Return cleanup function
  const cleanup = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
  };

  return { state, cleanup };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique event ID
 */
function generateEventId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Detects potential sensitive data patterns in content
 */
function detectSensitiveData(content: string): boolean {
  const sensitivePatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
    /password\s*[:=]\s*\S+/i, // Password
    /api[_-]?key\s*[:=]\s*\S+/i, // API key
    /secret\s*[:=]\s*\S+/i, // Secret
  ];

  return sensitivePatterns.some((pattern) => pattern.test(content));
}

// ============================================================================
// Composite Functions
// ============================================================================

/**
 * Sets up complete clipboard monitoring with automatic analysis and indicators
 *
 * @param element - DOM element to monitor
 * @param showIndicator - Function to display indicators
 * @param config - Clipboard configuration options
 * @returns Cleanup function to remove all event listeners
 *
 * @example
 * ```ts
 * const cleanup = setupClipboardMonitoring(
 *   document.querySelector('textarea')!,
 *   (indicator) => displayIndicator(indicator),
 *   { threshold: 1000, indicatorDuration: 5000 }
 * )
 *
 * // Later: cleanup()
 * ```
 */
export function setupClipboardMonitoring(
  element: HTMLElement,
  showIndicator: (state: IndicatorState) => void,
  config: Partial<ClipboardConfig> = {},
): () => void {
  const fullConfig = { ...DEFAULT_CLIPBOARD_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return () => { };
  }

  const cleanupPaste = detectPasteEvent(
    element,
    (event) => {
      // Analyze content
      const analysis = analyzeClipboardLength(event.contentPreview, fullConfig);

      // Trigger indicator
      triggerIndicator(analysis, showIndicator, fullConfig);
    },
    fullConfig,
  );

  // Return combined cleanup function
  return () => {
    cleanupPaste();
  };
}

/**
 * Creates a batch handler for multiple elements
 *
 * @param elements - Array of DOM elements to monitor
 * @param showIndicator - Function to display indicators
 * @param config - Clipboard configuration options
 * @returns Cleanup function for all elements
 *
 * @example
 * ```ts
 * const inputs = document.querySelectorAll('input, textarea')
 * const cleanup = createBatchHandler(
 *   Array.from(inputs),
 *   displayIndicator,
 *   { threshold: 500 }
 * )
 * ```
 */
export function createBatchHandler(
  elements: HTMLElement[],
  showIndicator: (state: IndicatorState) => void,
  config: Partial<ClipboardConfig> = {},
): () => void {
  const cleanupFunctions = elements.map((element) =>
    setupClipboardMonitoring(element, showIndicator, config),
  );

  // Return combined cleanup function
  return () => {
    cleanupFunctions.forEach((cleanup) => cleanup());
  };
}

// ============================================================================
// Utility Classes
// ============================================================================

/**
 * Clipboard Monitor class for managing clipboard monitoring state
 */
export class ClipboardMonitor {
  private config: ClipboardConfig;
  private monitoredElements: Map<HTMLElement, () => void>;
  private showIndicator: (state: IndicatorState) => void;

  constructor(
    showIndicator: (state: IndicatorState) => void,
    config: Partial<ClipboardConfig> = {},
  ) {
    this.config = { ...DEFAULT_CLIPBOARD_CONFIG, ...config };
    this.monitoredElements = new Map();
    this.showIndicator = showIndicator;
  }

  /**
   * Start monitoring an element
   */
  monitor(element: HTMLElement): () => void {
    if (this.monitoredElements.has(element)) {
      console.warn("Element is already being monitored");
      return () => { };
    }

    const cleanup = setupClipboardMonitoring(
      element,
      this.showIndicator,
      this.config,
    );

    this.monitoredElements.set(element, cleanup);

    // Return cleanup function for this specific element
    return () => {
      this.unmonitor(element);
    };
  }

  /**
   * Stop monitoring an element
   */
  unmonitor(element: HTMLElement): void {
    const cleanup = this.monitoredElements.get(element);
    if (cleanup) {
      cleanup();
      this.monitoredElements.delete(element);
    }
  }

  /**
   * Stop monitoring all elements
   */
  unmonitorAll(): void {
    this.monitoredElements.forEach((cleanup) => cleanup());
    this.monitoredElements.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ClipboardConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Re-apply to all monitored elements
    this.monitoredElements.forEach((cleanup, element) => {
      cleanup();
      this.monitoredElements.set(
        element,
        setupClipboardMonitoring(element, this.showIndicator, this.config),
      );
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ClipboardConfig> {
    return { ...this.config };
  }

  /**
   * Get count of monitored elements
   */
  getMonitoredCount(): number {
    return this.monitoredElements.size;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  ClipboardConfigSchema,
  ClipboardEventSchema,
  IndicatorStateSchema,
  ClipboardAnalysisSchema,
  DEFAULT_CLIPBOARD_CONFIG,
  detectPasteEvent,
  analyzeClipboardLength,
  triggerIndicator,
  setupClipboardMonitoring,
  createBatchHandler,
  ClipboardMonitor,
};
