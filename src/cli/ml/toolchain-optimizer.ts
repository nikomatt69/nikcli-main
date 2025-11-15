import { EventEmitter } from 'events';
import { structuredLogger } from '../utils/structured-logger';
import type { EnhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider';
import type { MLInferenceEngine } from './ml-inference-engine';
import type { FeatureExtractor } from './feature-extractor';

interface ToolPrediction {
  tools: string[];
  confidence: number;
  reasoning: string;
}

interface ToolExecution {
  sessionId: string;
  userIntentHash: string;
  contextFeatures: Record<string, any>;
  selectedTools: string[];
  toolSequence: number[];
  executionSuccess: boolean;
  executionDurationMs: number;
  toolFailures?: Record<string, string>;
  performanceMetrics: Record<string, number>;
}

interface ToolchainOptimization {
  recommendedSequence: string[];
  performanceImprovement: number;
  cachingStrategy: Record<string, number>;
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

class ToolchainOptimizer extends EventEmitter {
  private supabaseProvider: EnhancedSupabaseProvider | null = null;
  private inferenceEngine: MLInferenceEngine | null = null;
  private featureExtractor: FeatureExtractor | null = null;
  private initialized = false;
  private currentModels: Map<string, any> = new Map();
  private executionBuffer: ToolExecution[] = [];
  private readonly BUFFER_THRESHOLD = 100;
  private readonly RETRAINING_THRESHOLD = 0.05; // 5% improvement

  constructor() {
    super();
  }

  async initialize(
    supabaseProvider: EnhancedSupabaseProvider,
    inferenceEngine: MLInferenceEngine,
    featureExtractor: FeatureExtractor
  ): Promise<void> {
    try {
      this.supabaseProvider = supabaseProvider;
      this.inferenceEngine = inferenceEngine;
      this.featureExtractor = featureExtractor;

      // Load latest deployed models
      await this.loadLatestModels();

      this.initialized = true;
      structuredLogger.info('ToolchainOptimizer initialized successfully');
      this.emit('initialized');
    } catch (error) {
      structuredLogger.error('Failed to initialize ToolchainOptimizer', { error });
      throw error;
    }
  }

  async predictOptimalTools(
    userIntent: string,
    context: Record<string, any>
  ): Promise<ToolPrediction> {
    if (!this.initialized || !this.inferenceEngine || !this.featureExtractor) {
      return { tools: [], confidence: 0, reasoning: 'ML not initialized' };
    }

    try {
      // Extract features from context
      const features = await this.featureExtractor.extract(userIntent, context);

      // Get prediction from inference engine
      const prediction = await this.inferenceEngine.predictTools(features);

      return {
        tools: prediction.tools,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning
      };
    } catch (error) {
      structuredLogger.warn('Tool prediction failed, falling back to defaults', {
        error
      });
      return { tools: [], confidence: 0, reasoning: 'Prediction failed' };
    }
  }

  async recordExecution(execution: ToolExecution): Promise<void> {
    if (!this.initialized || !this.supabaseProvider) {
      return;
    }

    try {
      // Add to buffer
      this.executionBuffer.push(execution);

      // Flush buffer if threshold reached
      if (this.executionBuffer.length >= this.BUFFER_THRESHOLD) {
        await this.flushExecutionBuffer();
      }

      // Non-blocking: record success/failure for immediate optimization
      this.emit('execution:recorded', {
        success: execution.executionSuccess,
        tools: execution.selectedTools,
        duration: execution.executionDurationMs
      });
    } catch (error) {
      structuredLogger.warn('Failed to record execution', { error });
    }
  }

  async evaluateSession(sessionId: string): Promise<void> {
    if (!this.initialized || !this.supabaseProvider) {
      return;
    }

    try {
      // Flush any remaining executions
      if (this.executionBuffer.length > 0) {
        await this.flushExecutionBuffer();
      }

      // Calculate session metrics
      const metrics = await this.calculateSessionMetrics(sessionId);

      // Check if retraining needed
      await this.checkAndTriggerRetraining(metrics);

      structuredLogger.info('Session evaluation completed', { sessionId, metrics });
      this.emit('session:evaluated', { sessionId, metrics });
    } catch (error) {
      structuredLogger.warn('Session evaluation failed', { error });
    }
  }

  async optimizeToolchainPerformance(
    executions: ToolExecution[]
  ): Promise<ToolchainOptimization> {
    if (!this.initialized || !this.inferenceEngine) {
      return {
        recommendedSequence: [],
        performanceImprovement: 0,
        cachingStrategy: {}
      };
    }

    try {
      // Analyze execution patterns
      const patterns = this.analyzePatterns(executions);

      // Get optimization suggestions from inference engine
      const optimization = await this.inferenceEngine.optimizeSequence(patterns);

      return optimization;
    } catch (error) {
      structuredLogger.warn('Performance optimization failed', { error });
      return {
        recommendedSequence: [],
        performanceImprovement: 0,
        cachingStrategy: {}
      };
    }
  }

  private async loadLatestModels(): Promise<void> {
    if (!this.supabaseProvider) {
      return;
    }

    const modelTypes = ['tool_selector', 'success_predictor', 'performance_optimizer'];

    for (const modelType of modelTypes) {
      try {
        const model = await this.supabaseProvider.getLatestModel(modelType);
        if (model) {
          this.currentModels.set(modelType, model);
          structuredLogger.debug(`Loaded ${modelType} model`, {
            version: model.model_version,
            accuracy: model.accuracy_metrics?.accuracy
          });
        }
      } catch (error) {
        structuredLogger.warn(`Failed to load ${modelType} model`, { error });
      }
    }
  }

  private async flushExecutionBuffer(): Promise<void> {
    if (!this.supabaseProvider || this.executionBuffer.length === 0) {
      return;
    }

    try {
      for (const execution of this.executionBuffer) {
        await this.supabaseProvider.recordToolchainExecution(execution);
      }
      this.executionBuffer = [];
    } catch (error) {
      structuredLogger.warn('Failed to flush execution buffer', { error });
    }
  }

  private async calculateSessionMetrics(sessionId: string): Promise<ModelMetrics> {
    if (!this.supabaseProvider) {
      return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
    }

    try {
      // Query recent executions for this session
      const executions = await this.supabaseProvider.getSessionToolchainExecutions(
        sessionId
      );

      if (executions.length === 0) {
        return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
      }

      // Calculate metrics
      const successCount = executions.filter(e => e.execution_success).length;
      const accuracy = successCount / executions.length;

      // For now, use accuracy as primary metric
      // In production, would calculate precision, recall, F1 from confusion matrix
      return {
        accuracy,
        precision: accuracy,
        recall: accuracy,
        f1Score: accuracy
      };
    } catch (error) {
      structuredLogger.warn('Failed to calculate session metrics', { error });
      return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
    }
  }

  private async checkAndTriggerRetraining(metrics: ModelMetrics): Promise<void> {
    if (!this.supabaseProvider) {
      return;
    }

    try {
      // Get baseline model accuracy
      const baselineModel = this.currentModels.get('tool_selector');
      if (!baselineModel) {
        return;
      }

      const baselineAccuracy = baselineModel.accuracy_metrics?.accuracy || 0;
      const improvement =
        (metrics.accuracy - baselineAccuracy) / Math.max(baselineAccuracy, 0.01);

      if (improvement > this.RETRAINING_THRESHOLD) {
        structuredLogger.info('Triggering model retraining', {
          currentAccuracy: metrics.accuracy,
          baselineAccuracy,
          improvement: `${(improvement * 100).toFixed(2)}%`
        });

        this.emit('retraining:triggered', { improvement, metrics });
      }
    } catch (error) {
      structuredLogger.warn('Failed to check retraining threshold', { error });
    }
  }

  private analyzePatterns(executions: ToolExecution[]): Record<string, any> {
    // Group by tool combinations
    const toolCombinations = new Map<string, number>();
    const toolSequences = new Map<string, number>();
    let totalDuration = 0;

    for (const execution of executions) {
      if (!execution.executionSuccess) {
        continue;
      }

      const toolKey = execution.selectedTools.sort().join('|');
      toolCombinations.set(toolKey, (toolCombinations.get(toolKey) || 0) + 1);

      const sequenceKey = execution.toolSequence.join('|');
      toolSequences.set(sequenceKey, (toolSequences.get(sequenceKey) || 0) + 1);

      totalDuration += execution.executionDurationMs;
    }

    return {
      successfulToolCombinations: Object.fromEntries(toolCombinations),
      successfulToolSequences: Object.fromEntries(toolSequences),
      averageDuration: totalDuration / Math.max(executions.length, 1),
      totalExecutions: executions.length
    };
  }
}

export { ToolchainOptimizer };
export type { ToolPrediction, ToolExecution, ToolchainOptimization, ModelMetrics };
