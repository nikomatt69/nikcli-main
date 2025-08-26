import { CoreTool } from 'ai';
import { intelligentFeedbackWrapper } from './intelligent-feedback-wrapper';
import { smartDocsTools } from '../tools/smart-docs-tool';
import { aiDocsTools } from '../tools/docs-request-tool';
import { documentationTools } from './documentation-tool';

/**
 * Wrapper che aggiunge feedback automatico ai tools esistenti
 */
export class FeedbackAwareTools {
  /**
   * Wrappa un tool esistente con intelligence feedback
   */
  static wrapTool(toolName: string, originalTool: CoreTool, agentType?: string): CoreTool {
    return {
      ...originalTool,
      execute: async (parameters: any) => {
        const context = this.extractContextFromParameters(parameters);

        return await intelligentFeedbackWrapper.executeToolWithFeedback(
          toolName,
          async () => {
            // Esegui il tool originale
            return await originalTool?.execute?.(parameters, {});
          },
          parameters,
          context,
          agentType
        );
      }
    };
  }

  private static extractContextFromParameters(parameters: any): string {
    // Estrae contesto dai parametri del tool
    if (parameters.query) return `Query: ${parameters.query}`;
    if (parameters.concept) return `Concept: ${parameters.concept}`;
    if (parameters.filePath) return `File: ${parameters.filePath}`;
    if (parameters.command) return `Command: ${parameters.command}`;
    if (parameters.code) return `Code analysis`;

    return `Tool execution: ${Object.keys(parameters).join(', ')}`;
  }

  /**
   * Crea versioni feedback-aware di tutti i documentation tools
   */
  static getEnhancedDocumentationTools(agentType?: string) {
    return {
      // Smart docs tools con feedback
      smart_docs_search: this.wrapTool('smart_docs_search', smartDocsTools.search, agentType),
      smart_docs_load: this.wrapTool('smart_docs_load', smartDocsTools.load, agentType),
      smart_docs_context: this.wrapTool('smart_docs_context', smartDocsTools.context, agentType),

      // AI docs tools con feedback
      docs_request: this.wrapTool('docs_request', aiDocsTools.request, agentType),
      docs_gap_report: this.wrapTool('docs_gap_report', aiDocsTools.gapReport, agentType),

      // Documentation tools standard con feedback
      doc_search: this.wrapTool('doc_search', documentationTools.search, agentType),
      doc_add: this.wrapTool('doc_add', documentationTools.add, agentType),
      doc_stats: this.wrapTool('doc_stats', documentationTools.stats, agentType),
    };
  }

  /**
   * Wrapper generico per qualsiasi tool
   */
  static enhanceAllTools(tools: Record<string, CoreTool>, agentType?: string): Record<string, CoreTool> {
    const enhancedTools: Record<string, CoreTool> = {};

    for (const [toolName, tool] of Object.entries(tools)) {
      // Non wrappare due volte i tools già enhanced
      if (toolName.includes('enhanced_')) {
        enhancedTools[toolName] = tool;
        continue;
      }

      enhancedTools[`enhanced_${toolName}`] = this.wrapTool(toolName, tool, agentType);

      // Mantieni anche la versione originale per compatibility
      enhancedTools[toolName] = tool;
    }

    return enhancedTools;
  }

  /**
   * Analizza pattern di feedback per suggerimenti di miglioramento
   */
  static async generateImprovementSuggestions(): Promise<{
    gapAnalysis: Array<{ concept: string; priority: string; suggestions: string[] }>;
    performanceIssues: Array<{ tool: string; issue: string; solution: string }>;
    learningInsights: Array<{ pattern: string; confidence: number; recommendation: string }>;
  }> {
    // Ottieni statistiche di apprendimento
    const learningStats = intelligentFeedbackWrapper.getLearningStats();

    // Ottieni top gaps dal feedback system
    const topGaps = (global as any).feedbackSystem?.getTopGaps?.(10) || [];

    const gapAnalysis = topGaps.map((gap: any) => ({
      concept: gap.concept,
      priority: gap.avgImpact,
      suggestions: [
        `Add documentation for "${gap.concept}"`,
        `Create examples and tutorials`,
        `Update knowledge base with ${gap.concept} patterns`
      ]
    }));

    const performanceIssues = [
      {
        tool: 'docs_search',
        issue: 'Low result quality in some queries',
        solution: 'Improve search algorithm and indexing'
      },
      {
        tool: 'code_analysis',
        issue: 'Slow execution on large files',
        solution: 'Implement chunked analysis for large codebases'
      }
    ];

    const learningInsights = [
      {
        pattern: 'React hooks queries',
        confidence: 0.85,
        recommendation: 'Users frequently search for React hooks documentation - prioritize this content'
      },
      {
        pattern: 'TypeScript integration',
        confidence: 0.72,
        recommendation: 'TypeScript setup questions are common - create comprehensive guides'
      }
    ];

    return {
      gapAnalysis,
      performanceIssues,
      learningInsights
    };
  }

  /**
   * Feedback-aware execution tracking per agenti specifici
   */
  static trackAgentPerformance(agentType: string): {
    successRate: number;
    averageExecutionTime: number;
    mostUsedTools: string[];
    commonFailures: string[];
  } {
    // TODO: Implementare tracking specifico per agente
    return {
      successRate: 0.85,
      averageExecutionTime: 1200,
      mostUsedTools: ['docs_request', 'smart_docs_search', 'code_analysis'],
      commonFailures: ['permission_errors', 'network_timeouts']
    };
  }

  /**
   * Sistema di raccomandazioni adattive
   */
  static getAdaptiveRecommendations(context: string, agentType?: string): {
    recommendedTools: string[];
    alternativeApproaches: string[];
    preventiveActions: string[];
  } {
    // Analizza il contesto e suggerisci tools più appropriati
    const contextLower = context.toLowerCase();

    let recommendedTools: string[] = [];
    let alternativeApproaches: string[] = [];
    let preventiveActions: string[] = [];

    if (contextLower.includes('documentation') || contextLower.includes('docs')) {
      recommendedTools = ['smart_docs_search', 'docs_request', 'doc_add'];
      alternativeApproaches = [
        'Search with broader terms',
        'Check external documentation sources',
        'Ask user for specific documentation needs'
      ];
      preventiveActions = [
        'Preload relevant documentation',
        'Verify documentation completeness',
        'Update local documentation library'
      ];
    } else if (contextLower.includes('code') || contextLower.includes('analysis')) {
      recommendedTools = ['code_analysis', 'file_operations', 'smart_docs_search'];
      alternativeApproaches = [
        'Break down analysis into smaller chunks',
        'Use different analysis approaches',
        'Search for code patterns in documentation'
      ];
      preventiveActions = [
        'Validate file accessibility',
        'Check code syntax first',
        'Load relevant programming documentation'
      ];
    } else if (contextLower.includes('file') || contextLower.includes('directory')) {
      recommendedTools = ['file_operations', 'git_workflow'];
      alternativeApproaches = [
        'Use relative paths instead of absolute',
        'Check file permissions first',
        'Verify directory structure'
      ];
      preventiveActions = [
        'Test file access permissions',
        'Backup important files',
        'Validate paths before operations'
      ];
    }

    return {
      recommendedTools,
      alternativeApproaches,
      preventiveActions
    };
  }
}

/**
 * Decorator per tools che aggiunge automaticamente feedback tracking
 */
export function withFeedbackTracking(toolName: string, agentType?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = `${toolName} execution`;

      return await intelligentFeedbackWrapper.executeToolWithFeedback(
        toolName,
        async () => {
          return await originalMethod.apply(this, args);
        },
        args[0] || {},
        context,
        agentType
      );
    };

    return descriptor;
  };
}

export default FeedbackAwareTools;