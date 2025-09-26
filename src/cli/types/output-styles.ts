/**
 * Output Styles for AI Provider - Sistema di personalizzazione output dell'AI
 *
 * Permette agli utenti di configurare lo stile di output dell'AI secondo le proprie esigenze:
 * - production-focused: Output conciso, orientato ai risultati, senza spiegazioni superflue
 * - creative-concise: Creativo ma compatto, con esempi pratici
 * - detailed-analytical: Analisi approfondite con spiegazioni dettagliate
 * - friendly-casual: Tono amichevole e conversazionale
 * - technical-precise: Terminologia tecnica precisa, documentazione completa
 * - educational-verbose: Spiegazioni educative dettagliate, perfetto per learning
 * - minimal-efficient: Output minimalista, solo l'essenziale
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
  // Default style applicato globalmente
  defaultStyle: OutputStyleEnum.default('production-focused'),

  // Override per contesti specifici
  contextOverrides: z.record(
    z.enum(['chat', 'planning', 'code-generation', 'documentation', 'debugging', 'analysis']),
    OutputStyleEnum
  ).optional(),

  // Override per provider specifici
  providerOverrides: z.record(
    z.enum(['openai', 'anthropic', 'google', 'ollama', 'vercel', 'gateway', 'openrouter']),
    OutputStyleEnum
  ).optional(),

  // Personalizzazioni avanzate
  customizations: z.object({
    // Livello di verbosità (1-10)
    verbosityLevel: z.number().min(1).max(10).default(5),

    // Include esempi di codice
    includeCodeExamples: z.boolean().default(true),

    // Include spiegazioni step-by-step
    includeStepByStep: z.boolean().default(true),

    // Usa emoji e formattazione decorativa
    useDecorative: z.boolean().default(false),

    // Lunghezza massima della risposta (in token approssimativi)
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

// Metadati per ogni output style
export interface OutputStyleMetadata {
  name: string
  description: string
  characteristics: string[]
  useCase: string
  verbosityLevel: number
  technicalDepth: 'low' | 'medium' | 'high'
  targetAudience: 'beginner' | 'intermediate' | 'expert' | 'mixed'
}

// Registry completo degli output styles
export const OUTPUT_STYLES_REGISTRY: Record<OutputStyle, OutputStyleMetadata> = {
  'production-focused': {
    name: 'Production Focused',
    description: 'Output ottimizzato per ambiente di produzione, conciso e orientato ai risultati',
    characteristics: [
      'Risposte dirette e concise',
      'Focus sui risultati pratici',
      'Minimizza spiegazioni teoriche',
      'Codice production-ready',
      'Best practices implicite'
    ],
    useCase: 'Sviluppo professionale, deployment, debugging critico',
    verbosityLevel: 3,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'creative-concise': {
    name: 'Creative Concise',
    description: 'Approccio creativo ma compatto, con soluzioni innovative',
    characteristics: [
      'Soluzioni creative e alternative',
      'Esempi pratici interessanti',
      'Bilanciamento creatività/praticità',
      'Approcci non convenzionali',
      'Compatto ma ispirante'
    ],
    useCase: 'Brainstorming, prototipazione, soluzioni innovative',
    verbosityLevel: 4,
    technicalDepth: 'medium',
    targetAudience: 'intermediate'
  },

  'detailed-analytical': {
    name: 'Detailed Analytical',
    description: 'Analisi approfondite con spiegazioni dettagliate e considerazioni tecniche',
    characteristics: [
      'Analisi completa del problema',
      'Spiegazioni step-by-step dettagliate',
      'Considerazioni pro/contro',
      'Context tecnico approfondito',
      'Alternative e trade-offs'
    ],
    useCase: 'Ricerca, architettura, decisioni tecniche complesse',
    verbosityLevel: 8,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'friendly-casual': {
    name: 'Friendly Casual',
    description: 'Tono amichevole e conversazionale, approccio accessibile',
    characteristics: [
      'Linguaggio amichevole e accessibile',
      'Spiegazioni conversazionali',
      'Incoraggiamento e supporto',
      'Analogie e metafore',
      'Atmosfera rilassata'
    ],
    useCase: 'Learning, onboarding, supporto generale',
    verbosityLevel: 6,
    technicalDepth: 'medium',
    targetAudience: 'mixed'
  },

  'technical-precise': {
    name: 'Technical Precise',
    description: 'Terminologia tecnica precisa, documentazione completa e accurata',
    characteristics: [
      'Terminologia tecnica accurata',
      'Riferimenti a specifiche',
      'Documentazione completa',
      'Precisione nei dettagli',
      'Standard industry'
    ],
    useCase: 'Documentazione, specifiche tecniche, review codice',
    verbosityLevel: 7,
    technicalDepth: 'high',
    targetAudience: 'expert'
  },

  'educational-verbose': {
    name: 'Educational Verbose',
    description: 'Spiegazioni educative dettagliate, perfetto per imparare nuovi concetti',
    characteristics: [
      'Spiegazioni pedagogiche complete',
      'Esempi progressivi',
      'Context storico e teorico',
      'Riferimenti per approfondire',
      'Focus sul learning'
    ],
    useCase: 'Tutorial, formazione, spiegazione concetti complessi',
    verbosityLevel: 9,
    technicalDepth: 'high',
    targetAudience: 'beginner'
  },

  'minimal-efficient': {
    name: 'Minimal Efficient',
    description: 'Output minimalista con solo le informazioni essenziali',
    characteristics: [
      'Solo informazioni essenziali',
      'Formato ultra-compatto',
      'Zero ridondanza',
      'Codice senza commenti superflui',
      'Massima efficienza'
    ],
    useCase: 'Quick fixes, automazione, script rapidi',
    verbosityLevel: 2,
    technicalDepth: 'medium',
    targetAudience: 'expert'
  }
}

// Utility functions for output style management
export class OutputStyleUtils {
  /**
   * Ottiene i metadati per un output style
   */
  static getStyleMetadata(style: OutputStyle): OutputStyleMetadata {
    return OUTPUT_STYLES_REGISTRY[style]
  }

  /**
   * Lista tutti gli output styles disponibili
   */
  static getAllStyles(): OutputStyle[] {
    return Object.keys(OUTPUT_STYLES_REGISTRY) as OutputStyle[]
  }

  /**
   * Filtra styles per target audience
   */
  static getStylesByAudience(audience: OutputStyleMetadata['targetAudience']): OutputStyle[] {
    return Object.entries(OUTPUT_STYLES_REGISTRY)
      .filter(([_, metadata]) => metadata.targetAudience === audience || metadata.targetAudience === 'mixed')
      .map(([style, _]) => style as OutputStyle)
  }

  /**
   * Filtra styles per livello di verbosità
   */
  static getStylesByVerbosity(minLevel: number, maxLevel: number): OutputStyle[] {
    return Object.entries(OUTPUT_STYLES_REGISTRY)
      .filter(([_, metadata]) => metadata.verbosityLevel >= minLevel && metadata.verbosityLevel <= maxLevel)
      .map(([style, _]) => style as OutputStyle)
  }

  /**
   * Suggerisce il miglior style per un contesto
   */
  static suggestStyleForContext(context: {
    userLevel?: 'beginner' | 'intermediate' | 'expert'
    taskType?: 'learning' | 'production' | 'debugging' | 'creative' | 'documentation'
    urgency?: 'low' | 'medium' | 'high'
  }): OutputStyle {
    const { userLevel = 'intermediate', taskType = 'production', urgency = 'medium' } = context

    // Logica di suggerimento basata sul contesto
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
   * Valida che un output style sia supportato
   */
  static isValidStyle(style: string): style is OutputStyle {
    return style in OUTPUT_STYLES_REGISTRY
  }

  /**
   * Ottiene il livello di verbosità per uno style
   */
  static getVerbosityLevel(style: OutputStyle): number {
    return OUTPUT_STYLES_REGISTRY[style].verbosityLevel
  }

  /**
   * Confronta due styles per verbosità
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