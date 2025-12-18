/**
 * Global type declarations for NikCLI
 */

// Bun runtime types
declare global {
  // Bun global variable when running with Bun runtime

  // Node.js process extensions
  namespace NodeJS {
    interface ProcessEnv {
      ANTHROPIC_API_KEY?: string
      OPENAI_API_KEY?: string
      OPENROUTER_API_KEY?: string
      GOOGLE_GENERATIVE_AI_API_KEY?: string
      OPENCODE_API_KEY?: string
      OLLAMA_HOST?: string
      SUPABASE_URL?: string
      SUPABASE_ANON_KEY?: string
      MINIMAX_API_KEY?: string
      REDIS_URL?: string
    }
  }
}

export { }
