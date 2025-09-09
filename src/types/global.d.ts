/**
 * Global type declarations for NikCLI
 */

// Bun runtime types
declare global {
  // Bun global variable when running with Bun runtime
  const Bun: {
    version: string;
    // Add other Bun properties as needed
  } | undefined;

  // Node.js process extensions
  namespace NodeJS {
    interface ProcessEnv {
      ANTHROPIC_API_KEY?: string;
      OPENAI_API_KEY?: string;
      OPENROUTER_API_KEY?: string;
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
      OLLAMA_HOST?: string;
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
      REDIS_URL?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
    }
  }
}

// Module augmentations for third-party libraries
declare module 'boxen' {
  interface Options {
    padding?: number | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    margin?: number | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    borderStyle?: string;
    borderColor?: string;
    backgroundColor?: string;
    title?: string;
    titleAlignment?: 'left' | 'center' | 'right';
    width?: number;
    margin?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    textAlignment?: 'left' | 'center' | 'right';
  }

  function boxen(text: string, options?: Options): string;
  export = boxen;
}

export { };