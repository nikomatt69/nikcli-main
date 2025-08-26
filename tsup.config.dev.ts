import { defineConfig } from 'tsup'
import { config } from 'dotenv'

// Carica le variabili d'ambiente dal file .env
config()

export default defineConfig({
  entry: [
    'src/cli/index.ts',
    'src/cli/nik-cli.ts',
    'src/cli/register-agents.ts',
    'src/cli/streaming-orchestrator.ts',
    'src/cli/main-orchestrator.ts',
    'src/cli/unified-chat.ts',
    'src/cli/unified-cli.ts',
    'src/cli/**/*.ts'
  ],
  outDir: 'dist/cli',
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // No minification for development
  bundle: false, // Disable bundling to avoid Yarn PnP issues
  dts: false,
  treeshake: false, // Disable tree shaking for faster builds
  // Keep all dependencies as external
  external: [
    // Node.js built-in modules
    'fs', 'path', 'os', 'crypto', 'child_process',
    'readline', 'events', 'stream', 'util', 'url',
    'http', 'https', 'zlib', 'querystring', 'buffer',
    'process', 'assert', 'constants', 'domain',
    'punycode', 'string_decoder', 'timers', 'tty',
    'vm', 'worker_threads', 'perf_hooks', 'async_hooks',
    'inspector', 'trace_events', 'v8', 'module',
    // All npm dependencies
    '@ai-sdk/*', 'ai', 'blessed', 'boxen', 'chalk',
    'chokidar', 'cli-progress', 'commander', 'cors',
    'diff', 'dotenv', 'express', 'express-rate-limit',
    'globby', 'gradient-string', 'helmet', 'highlight.js',
    'ink', 'ink-box', 'ink-divider', 'ink-select-input',
    'ink-spinner', 'ink-table', 'ink-text-input',
    'inquirer', 'ioredis', 'js-yaml', 'jsonwebtoken',
    'keytar', 'marked', 'marked-terminal', 'nanoid',
    'ollama-ai-provider', 'ora', 'prismjs', 'react',
    'react-dom', 'strip-ansi', 'uuid', 'vscode-jsonrpc',
    'zod', 'zustand', '@chroma-core/default-embed',
    '@supabase/supabase-js', '@upstash/redis', 'conf'
  ],
  onSuccess: 'echo "Development build completed successfully!"',
  env: {
    NODE_ENV: 'development',

    // OpenAI
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

    // Ollama
    OLLAMA_HOST: process.env.OLLAMA_HOST || '127.0.0.1:11434',

    // Chroma
    CHROMA_API_KEY: process.env.CHROMA_API_KEY || "",
    CHROMA_TENANT: process.env.CHROMA_TENANT || "",
    CHROMA_DATABASE: process.env.CHROMA_DATABASE || "agent-cli",

    // Embeddings
    ENABLE_EMBEDDINGS: process.env.ENABLE_EMBEDDINGS || "true",
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || "text-embedding-3-small",

    // Vercel
    VERCEL_URL: process.env.VERCEL_URL || "nikcli-main.vercel.app",

    // OAuth
    OAUTH_BACKEND_URL: process.env.OAUTH_BACKEND_URL || "https://nikcli-main.vercel.app",
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || "https://nikcli-main.vercel.app/api/oauth/callback",

    // Supabase
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",

    // Upstash Redis
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",

    // Redis Configuration
    REDIS_HOST: process.env.REDIS_HOST || "localhost",
    REDIS_PORT: process.env.REDIS_PORT || "6379",
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
    REDIS_DB: process.env.REDIS_DB || "0",

    // Redis Timeouts
    REDIS_CONNECT_TIMEOUT: process.env.REDIS_CONNECT_TIMEOUT || "10000",
    REDIS_COMMAND_TIMEOUT: process.env.REDIS_COMMAND_TIMEOUT || "5000",
    REDIS_MAX_RETRIES: process.env.REDIS_MAX_RETRIES || "3",
    REDIS_RETRY_DELAY: process.env.REDIS_RETRY_DELAY || "1000",

    // Supabase Features
    SUPABASE_ENABLE_AUTH: process.env.SUPABASE_ENABLE_AUTH || "true",
    SUPABASE_ENABLE_DATABASE: process.env.SUPABASE_ENABLE_DATABASE || "true",
    SUPABASE_ENABLE_STORAGE: process.env.SUPABASE_ENABLE_STORAGE || "false",
    SUPABASE_ENABLE_REALTIME: process.env.SUPABASE_ENABLE_REALTIME || "true",
    SUPABASE_ENABLE_VECTOR_SEARCH: process.env.SUPABASE_ENABLE_VECTOR_SEARCH || "false",

    // GitHub
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",

    // NikCLI Secrets
    NIKCLI_JWT_SECRET: process.env.NIKCLI_JWT_SECRET || "",
    NIKCLI_PROXY_SECRET: process.env.NIKCLI_PROXY_SECRET || "",

    // Debug and Validation
    DEBUG_EVENTS: process.env.DEBUG_EVENTS || "false",
    NIK_PROMPT_DEBUG: process.env.NIK_PROMPT_DEBUG || "false",
    DEBUG: process.env.DEBUG || "false",
    VALIDATE_REASONING: process.env.VALIDATE_REASONING || "false",
  }
})
