/**
 * Output Styles for AI Provider - AI output customization system
 *
 * Allows users to configure AI output style according to their needs:
 * - production-focused: Concise output, results-oriented, without unnecessary explanations
 * - creative-concise: Creative but compact, with practical examples
 * - detailed-analytical: In-depth analysis with detailed explanations
 * - friendly-casual: Friendly and conversational tone
 * - technical-precise: Precise technical terminology, complete documentation
 * - educational-verbose: Detailed educational explanations, perfect for learning
 * - minimal-efficient: Minimalist output, only the essentials
 */

import { z } from 'zod'

// Core output style enumeration
export const OutputStyleEnum = z.enum([
  'production-focused',
  'creative-concise',
  'detailed-analytical',
  'friendly-casual',
  'technical-precise',
  'educational-verbose',
  'minimal-efficient'
])

export type OutputStyle = z.infer<typeof OutputStyleEnum>

// Output style configuration with context-specific overrides
export const OutputStyleConfigSchema = z.object({
  // Default style applied globally
  defaultStyle: OutputStyleEnum.default('production-focused'),

  // Overrides for specific contexts
  contextOverrides: z.record(
    z.enum(['chat', 'planning', 'code-generation', 'documentation', 'debugging', 'analysis']),
    OutputStyleEnum
  ).optional(),

  // Overrides for specific providers
  providerOverrides: z.record(
    z.enum(['openai', 'anthropic', 'google', 'ollama', 'vercel', 'gateway', 'openrouter']),
    OutputStyleEnum
  ).optional(),

  // Advanced customizations
  customizations: z.object({
    // Verbosity level (1-10)
    verbosityLevel: z.number().min(1).max(10).default(5),

    // Include code examples
    includeCodeExamples: z.boolean().default(true),

    // Include step-by-step explanations
    includeStepByStep: z.boolean().default(true),

    // Use emoji and decorative formatting
    useDecorative: z.boolean().default(false),

    // Maximum response length (in approximate tokens)
    maxResponseLength: z.enum(['short', 'medium', 'long', 'unlimited']).default('medium')
  }).default({
    verbosityLevel: 5,
    includeCodeExamples: true,
    includeStepByStep: true,
    useDecorative: false,
    maxResponseLength: 'medium'
  })
})

export type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>

// Metadata for each output style
export interface OutputStyleMetadata {
  name: string
  description: string
  characteristics: string[]
  useCase: string
  verbosityLevel: number
  technicalDepth: 'low' | 'medium' | 'high'
  targetAudience: 'beginner' | 'intermediate' | 'expert' | 'mixed'
}

// Complete registry of output styles
export const OUTPUT_STYLES_REGISTRY: Record<OutputStyle, OutputStyleMetadata> = {
  'production-focused': {
    name: 'Production Focused',
    description: 'Output optimized for production environment, concise and results-oriented',
    characteristics: [
      'Direct and concise responses',
      'Focus on practical results',
      'Minimizes theoretical explanations',
      'Production-ready code',
      'Implicit best practices'
    ],
    useCase: 'Professional development, deployment, critical debugging',
    verbosityLevel: 3,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'creative-concise': {
    name: 'Creative Concise',
    description: 'Creative but compact approach, with innovative solutions',
    characteristics: [
      'Creative and alternative solutions',
      'Interesting practical examples',
      'Creativity/practicality balance',
      'Unconventional approaches',
      'Compact but inspiring'
    ],
    useCase: 'Brainstorming, prototyping, innovative solutions',
    verbosityLevel: 4,
    technicalDepth: 'medium',
    targetAudience: 'intermediate'
  },

  'detailed-analytical': {
    name: 'Detailed Analytical',
    description: 'In-depth analysis with detailed explanations and technical considerations',
    characteristics: [
      'Complete problem analysis',
      'Detailed step-by-step explanations',
      'Pro/con considerations',
      'Deep technical context',
      'Alternatives and trade-offs'
    ],
    useCase: 'Research, architecture, complex technical decisions',
    verbosityLevel: 8,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'friendly-casual': {
    name: 'Friendly Casual',
    description: 'Friendly and conversational tone, accessible approach',
    characteristics: [
      'Friendly and accessible language',
      'Conversational explanations',
      'Encouragement and support',
      'Analogies and metaphors',
      'Relaxed atmosphere'
    ],
    useCase: 'Learning, onboarding, general support',
    verbosityLevel: 6,
    technicalDepth: 'medium',
    targetAudience: 'mixed'
  },

  'technical-precise': {
    name: 'Technical Precise',
    description: 'Precise technical terminology, complete and accurate documentation',
    characteristics: [
      'Accurate technical terminology',
      'References to specifications',
      'Complete documentation',
      'Precision in details',
      'Industry standards'
    ],
    useCase: 'Documentation, technical specifications, code review',
    verbosityLevel: 7,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'educational-verbose': {
    name: 'Educational Verbose',
    description: 'Detailed educational explanations, perfect for learning new concepts',
    characteristics: [
      'Complete pedagogical explanations',
      'Progressive examples',
      'Historical and theoretical context',
      'References for further study',
      'Focus on learning'
    ],
    useCase: 'Tutorials, training, explaining complex concepts',
    verbosityLevel: 9,
    technicalDepth: 'high',
    targetAudience: 'beginner'
  },

  'minimal-efficient': {
    name: 'Minimal Efficient',
    description: 'Minimalist output with only essential information',
    characteristics: [
      'Only essential information',
      'Ultra-compact format',
      'Zero redundancy',
      'Code without superfluous comments',
      'Maximum efficiency'
    ],
    useCase: 'Quick fixes, automation, rapid scripts',
    verbosityLevel: 2,
    technicalDepth: 'medium',
    targetAudience: 'expert'
  }
}

// Utility functions for output style management
export class OutputStyleUtils {
  /**
   * Gets metadata for an output style
   */
  static getStyleMetadata(style: OutputStyle): OutputStyleMetadata {
    return OUTPUT_STYLES_REGISTRY[style]
  }

  /**
   * Lists all available output styles
   */
  static getAllStyles(): OutputStyle[] {
    return Object.keys(OUTPUT_STYLES_REGISTRY) as OutputStyle[]
  }

  /**
   * Filters styles by target audience
   */
  static getStylesByAudience(audience: OutputStyleMetadata['targetAudience']): OutputStyle[] {
    return Object.entries(OUTPUT_STYLES_REGISTRY)
      .filter(([_, metadata]) => metadata.targetAudience === audience || metadata.targetAudience === 'mixed')
      .map(([style, _]) => style as OutputStyle)
  }

  /**
   * Filters styles by verbosity level
   */
  static getStylesByVerbosity(minLevel: number, maxLevel: number): OutputStyle[] {
    return Object.entries(OUTPUT_STYLES_REGISTRY)
      .filter(([_, metadata]) => metadata.verbosityLevel >= minLevel && metadata.verbosityLevel <= maxLevel)
      .map(([style, _]) => style as OutputStyle)
  }

  /**
   * Suggests the best style for a context
   */
  static suggestStyleForContext(context: {
    userLevel?: 'beginner' | 'intermediate' | 'expert'
    taskType?: 'learning' | 'production' | 'debugging' | 'creative' | 'documentation'
    urgency?: 'low' | 'medium' | 'high'
  }): OutputStyle {
    const { userLevel = 'intermediate', taskType = 'production', urgency = 'medium' } = context

    // Context-based suggestion logic
    if (urgency === 'high') {
      return 'minimal-efficient'
    }

    if (taskType === 'learning' && userLevel === 'beginner') {
      return 'educational-verbose'
    }

    if (taskType === 'production') {
      return 'production-focused'
    }

    if (taskType === 'creative') {
      return 'creative-concise'
    }

    if (taskType === 'documentation') {
      return 'technical-precise'
    }

    if (userLevel === 'beginner') {
      return 'friendly-casual'
    }

    // Default fallback
    return 'production-focused'
  }

  /**
   * Validates that an output style is supported
   */
  static isValidStyle(style: string): style is OutputStyle {
    return style in OUTPUT_STYLES_REGISTRY
  }

  /**
   * Gets the verbosity level for a style
   */
  static getVerbosityLevel(style: OutputStyle): number {
    return OUTPUT_STYLES_REGISTRY[style].verbosityLevel
  }

  /**
   * Compares two styles by verbosity
   */
  static compareVerbosity(style1: OutputStyle, style2: OutputStyle): number {
    return this.getVerbosityLevel(style1) - this.getVerbosityLevel(style2)
  }
}

// Export default configuration
export const DEFAULT_OUTPUT_STYLE_CONFIG: OutputStyleConfig = {
  defaultStyle: 'production-focused',
  customizations: {
    verbosityLevel: 5,
    includeCodeExamples: true,
    includeStepByStep: true,
    useDecorative: false,
    maxResponseLength: 'medium'
  }
}