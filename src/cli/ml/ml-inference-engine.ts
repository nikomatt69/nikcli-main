import { structuredLogger } from '../utils/structured-logger';
import type { CacheService } from '../services/cache-service';

interface FeatureVector {
  intentHash: string;
  features: Record<string, number>;
  context: Record<string, any>;
}

interface ToolPredictionResult {
  tools: string[];
  confidence: number;
  reasoning: string;
  successProbabilities: Record<string, number>;
}

interface SuccessPrediction {
  tool: string;
  successProbability: number;
  confidenceScore: number;
}

interface SequenceOptimization {
  recommendedSequence: string[];
  performanceImprovement: number;
  cachingStrategy: Record<string, number>;
}

class MLInferenceEngine {
  private cacheService: CacheService | null = null;
  private initialized = false;

  // Simple in-memory model weights (production would load serialized models)
  private toolSelectorWeights: Map<string, number> = new Map();
  private successPredictorWeights: Map<string, number> = new Map();

  constructor() {
  }

  async initialize(cacheService: CacheService): Promise<void> {
    try {
      this.cacheService = cacheService;

      // Initialize default model weights
      this.initializeDefaultWeights();

      this.initialized = true;
      structuredLogger.info('MLInferenceEngine initialized');
    } catch (error) {
      structuredLogger.error('Failed to initialize MLInferenceEngine', { error });
      throw error;
    }
  }

  async predictTools(featureVector: FeatureVector): Promise<ToolPredictionResult> {
    if (!this.initialized) {
      return {
        tools: [],
        confidence: 0,
        reasoning: 'Engine not initialized',
        successProbabilities: {}
      };
    }

    try {
      // Check cache first
      const cached = await this.getInferenceCache(featureVector.intentHash);
      if (cached) {
        return cached;
      }

      // Extract relevant features
      const scores = this.scoreToolCombinations(featureVector);

      // Get top tools by score
      const rankedTools = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tool]) => tool);

      // Calculate confidence from top scores
      const topScore = scores.get(rankedTools[0]) || 0;
      const confidence = Math.min(topScore / 100, 1.0); // Normalize to 0-1

      const result: ToolPredictionResult = {
        tools: rankedTools,
        confidence,
        reasoning: this.generateReasoningText(rankedTools, featureVector),
        successProbabilities: Object.fromEntries(
          rankedTools.map(tool => [tool, this.getToolSuccessProbability(tool)])
        )
      };

      // Cache result
      await this.cacheInference(featureVector.intentHash, result, 3600);

      return result;
    } catch (error) {
      structuredLogger.warn('Tool prediction inference failed', { error });
      return {
        tools: [],
        confidence: 0,
        reasoning: 'Inference failed',
        successProbabilities: {}
      };
    }
  }

  async predictSuccessRates(
    tools: string[],
    context: Record<string, any>
  ): Promise<Record<string, number>> {
    if (!this.initialized) {
      return {};
    }

    try {
      const predictions: Record<string, number> = {};

      for (const tool of tools) {
        // Get base success rate from model
        const baseRate = this.getToolSuccessProbability(tool);

        // Adjust based on context
        const contextAdjustment = this.getContextAdjustment(tool, context);

        predictions[tool] = Math.min(baseRate + contextAdjustment, 1.0);
      }

      return predictions;
    } catch (error) {
      structuredLogger.warn('Success rate prediction failed', { error });
      return {};
    }
  }

  async optimizeSequence(patterns: Record<string, any>): Promise<SequenceOptimization> {
    if (!this.initialized) {
      return {
        recommendedSequence: [],
        performanceImprovement: 0,
        cachingStrategy: {}
      };
    }

    try {
      const successfulCombinations =
        patterns.successfulToolCombinations || {};
      const successfulSequences = patterns.successfulToolSequences || {};

      // Find most successful sequence
      let bestSequence = '';
      let bestCount = 0;

      for (const [sequence, count] of Object.entries(successfulSequences)) {
        if (typeof count === 'number' && count > bestCount) {
          bestSequence = sequence;
          bestCount = count;
        }
      }

      const recommendedSequence = bestSequence
        ? bestSequence.split('|')
        : Object.keys(successfulCombinations).slice(0, 5);

      // Calculate potential improvement
      const currentAvgDuration = patterns.averageDuration || 0;
      const potentialImprovement = this.calculatePerformanceImprovement(
        recommendedSequence,
        patterns
      );

      // Build caching strategy
      const cachingStrategy = this.buildCachingStrategy(
        recommendedSequence,
        patterns
      );

      return {
        recommendedSequence,
        performanceImprovement: potentialImprovement,
        cachingStrategy
      };
    } catch (error) {
      structuredLogger.warn('Sequence optimization failed', { error });
      return {
        recommendedSequence: [],
        performanceImprovement: 0,
        cachingStrategy: {}
      };
    }
  }

  private initializeDefaultWeights(): void {
    // Default tool success rates (would be loaded from trained model in production)
    const defaultRates = {
      'read-file-tool': 0.95,
      'write-file-tool': 0.93,
      'edit-tool': 0.92,
      'glob-tool': 0.98,
      'grep-tool': 0.97,
      'git-tools': 0.89,
      'diff-tool': 0.96,
      'find-files-tool': 0.97,
      'multi-read-tool': 0.94,
      'multi-edit-tool': 0.91
    };

    for (const [tool, rate] of Object.entries(defaultRates)) {
      this.successPredictorWeights.set(tool, rate);
    }
  }

  private scoreToolCombinations(
    featureVector: FeatureVector
  ): Map<string, number> {
    const scores = new Map<string, number>();

    // Extract intent type from context
    const intentType = featureVector.context.intentType || 'general';
    const fileTypes = featureVector.context.fileTypes || [];
    const workspaceType = featureVector.context.workspaceType || 'mixed';

    // Score tools based on intent and context
    const toolScores: Record<string, number> = {
      'read-file-tool': intentType.includes('read') ? 95 : 70,
      'write-file-tool': intentType.includes('write') ? 95 : 60,
      'edit-tool':
        intentType.includes('edit') || intentType.includes('modify') ? 95 : 65,
      'glob-tool': intentType.includes('search') || intentType.includes('find') ? 90 : 75,
      'grep-tool':
        intentType.includes('search') || intentType.includes('find') ? 92 : 73,
      'git-tools': workspaceType === 'git' || intentType.includes('git') ? 88 : 50,
      'diff-tool': intentType.includes('diff') || intentType.includes('compare') ? 94 : 60
    };

    for (const [tool, score] of Object.entries(toolScores)) {
      scores.set(tool, score);
    }

    return scores;
  }

  private getToolSuccessProbability(tool: string): number {
    // Get from model weights, default to 0.85 if not found
    return this.successPredictorWeights.get(tool) || 0.85;
  }

  private getContextAdjustment(
    tool: string,
    context: Record<string, any>
  ): number {
    let adjustment = 0;

    // Boost if tool matches workspace type
    if (tool === 'git-tools' && context.workspaceType === 'git') {
      adjustment += 0.05;
    }

    // Reduce if user has low success history with this tool
    if (context.toolSuccessHistory) {
      const history = context.toolSuccessHistory[tool];
      if (history && history.successRate < 0.5) {
        adjustment -= 0.1;
      }
    }

    return Math.max(adjustment, -0.2); // Clamp to prevent negative adjustment
  }

  private generateReasoningText(
    tools: string[],
    featureVector: FeatureVector
  ): string {
    if (tools.length === 0) {
      return 'No suitable tools identified';
    }

    const primaryTool = tools[0];
    const intentType = featureVector.context.intentType || 'general';

    return `Selected ${primaryTool} as primary for ${intentType} task with ${tools.length} total recommendations`;
  }

  private calculatePerformanceImprovement(
    sequence: string[],
    patterns: Record<string, any>
  ): number {
    if (sequence.length === 0) {
      return 0;
    }

    // Estimate improvement based on tool efficiency
    const baselineDuration = patterns.averageDuration || 1000;
    const estimatedDuration = sequence.length * 200; // Rough estimate

    return Math.max((baselineDuration - estimatedDuration) / baselineDuration, 0);
  }

  private buildCachingStrategy(
    sequence: string[],
    patterns: Record<string, any>
  ): Record<string, number> {
    const strategy: Record<string, number> = {};

    // Set cache TTL based on tool frequency
    for (const tool of sequence) {
      // More frequent tools get shorter TTL (cache invalidates sooner)
      strategy[tool] = 3600; // 1 hour default, would be dynamic in production
    }

    return strategy;
  }

  private async getInferenceCache(
    intentHash: string
  ): Promise<ToolPredictionResult | null> {
    if (!this.cacheService) {
      return null;
    }

    try {
      return await this.cacheService.getMLInference(intentHash);
    } catch {
      return null;
    }
  }

  private async cacheInference(
    intentHash: string,
    prediction: ToolPredictionResult,
    ttl: number
  ): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    try {
      await this.cacheService.cacheMLInference(intentHash, prediction, ttl);
    } catch (error) {
      structuredLogger.warn('Failed to cache inference', { error });
    }
  }
}

export { MLInferenceEngine };
export type {
  FeatureVector,
  ToolPredictionResult,
  SuccessPrediction,
  SequenceOptimization
};
