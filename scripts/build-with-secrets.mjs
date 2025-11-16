#!/usr/bin/env node

/**
 * Build Script with Embedded Secrets
 * Encrypts production API keys and embeds them in the binary
 *
 * Usage:
 *   bun run build:with-secrets
 *
 * Requires .env.production file with secrets to embed
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

const PRODUCTION_ENV_FILE = path.join(projectRoot, '.env.production')
const SECRETS_CONFIG_FILE = path.join(projectRoot, 'src/cli/config/generated-embedded-secrets.ts')

/**
 * WHITELIST RIGOROSO - TUTTE e SOLO LE ENV VARS DEL .env.production.template
 * ENTRANO NEL BUNDLE ENCRYPTATE
 *
 * Questa lista è estratta direttamente da .env.production.template
 * Se modifichi il template, aggiorna questa lista
 */
const SECRETS_TO_EMBED = [
  // CONFIGURAZIONE SERVER
  { name: 'NODE_ENV', envVarName: 'NODE_ENV', id: 'node_env', provider: 'config', description: 'Node environment' },
  { name: 'PORT', envVarName: 'PORT', id: 'port', provider: 'config', description: 'Server port' },
  { name: 'WEB_PORT', envVarName: 'WEB_PORT', id: 'web_port', provider: 'config', description: 'Web port' },
  { name: 'API_PORT', envVarName: 'API_PORT', id: 'api_port', provider: 'config', description: 'API port' },
  { name: 'CONSOLE_PORT', envVarName: 'CONSOLE_PORT', id: 'console_port', provider: 'config', description: 'Console port' },
  { name: 'NIKCLI_COMPACT', envVarName: 'NIKCLI_COMPACT', id: 'nikcli_compact', provider: 'config', description: 'Compact mode' },
  { name: 'ALLOWED_ORIGINS', envVarName: 'ALLOWED_ORIGINS', id: 'allowed_origins', provider: 'config', description: 'CORS origins' },


  // GITHUB INTEGRATION
  { name: 'GITHUB_TOKEN', envVarName: 'GITHUB_TOKEN', id: 'github_token', provider: 'github', description: 'GitHub Personal Access Token' },
  { name: 'GITHUB_APP_ID', envVarName: 'GITHUB_APP_ID', id: 'github_app_id', provider: 'github', description: 'GitHub App ID' },
  { name: 'GITHUB_PRIVATE_KEY_PATH', envVarName: 'GITHUB_PRIVATE_KEY_PATH', id: 'github_private_key', provider: 'github', description: 'GitHub Private Key' },
  { name: 'GITHUB_INSTALLATION_ID', envVarName: 'GITHUB_INSTALLATION_ID', id: 'github_installation_id', provider: 'github', description: 'GitHub Installation ID' },
  { name: 'GITHUB_WEBHOOK_SECRET', envVarName: 'GITHUB_WEBHOOK_SECRET', id: 'github_webhook_secret', provider: 'github', description: 'GitHub Webhook Secret' },
  { name: 'GITHUB_CLIENT_ID', envVarName: 'GITHUB_CLIENT_ID', id: 'github_client_id', provider: 'github', description: 'GitHub OAuth Client ID' },
  { name: 'GITHUB_CLIENT_SECRET', envVarName: 'GITHUB_CLIENT_SECRET', id: 'github_client_secret', provider: 'github', description: 'GitHub OAuth Secret' },

  // DATABASE & STORAGE
  { name: 'DATABASE_URL', envVarName: 'DATABASE_URL', id: 'database_url', provider: 'database', description: 'PostgreSQL connection URL' },
  { name: 'POSTGRES_URL', envVarName: 'POSTGRES_URL', id: 'postgres_url', provider: 'database', description: 'PostgreSQL URL (dev)' },
  { name: 'REDIS_URL', envVarName: 'REDIS_URL', id: 'redis_url', provider: 'redis', description: 'Redis connection URL' },
  { name: 'UPSTASH_REDIS_REST_URL', envVarName: 'UPSTASH_REDIS_REST_URL', id: 'upstash_redis_url', provider: 'redis', description: 'Upstash Redis REST URL' },
  { name: 'UPSTASH_REDIS_REST_TOKEN', envVarName: 'UPSTASH_REDIS_REST_TOKEN', id: 'upstash_redis_token', provider: 'redis', description: 'Upstash Redis REST Token' },
  { name: 'REDIS_HOST', envVarName: 'REDIS_HOST', id: 'redis_host', provider: 'redis', description: 'Redis host' },
  { name: 'REDIS_PORT', envVarName: 'REDIS_PORT', id: 'redis_port', provider: 'redis', description: 'Redis port' },
  { name: 'REDIS_PASSWORD', envVarName: 'REDIS_PASSWORD', id: 'redis_password', provider: 'redis', description: 'Redis password' },
  { name: 'REDIS_DB', envVarName: 'REDIS_DB', id: 'redis_db', provider: 'redis', description: 'Redis database' },
  { name: 'REDIS_TLS', envVarName: 'REDIS_TLS', id: 'redis_tls', provider: 'redis', description: 'Redis TLS enabled' },
  { name: 'REDIS_CONNECT_TIMEOUT', envVarName: 'REDIS_CONNECT_TIMEOUT', id: 'redis_connect_timeout', provider: 'redis', description: 'Redis connection timeout' },
  { name: 'REDIS_COMMAND_TIMEOUT', envVarName: 'REDIS_COMMAND_TIMEOUT', id: 'redis_command_timeout', provider: 'redis', description: 'Redis command timeout' },
  { name: 'REDIS_MAX_RETRIES', envVarName: 'REDIS_MAX_RETRIES', id: 'redis_max_retries', provider: 'redis', description: 'Redis max retries' },
  { name: 'REDIS_RETRY_DELAY', envVarName: 'REDIS_RETRY_DELAY', id: 'redis_retry_delay', provider: 'redis', description: 'Redis retry delay' },
  { name: 'UPSTASH_SEARCH_REST_URL', envVarName: 'UPSTASH_SEARCH_REST_URL', id: 'upstash_search_url', provider: 'redis', description: 'Upstash Search REST URL' },
  { name: 'UPSTASH_SEARCH_REST_TOKEN', envVarName: 'UPSTASH_SEARCH_REST_TOKEN', id: 'upstash_search_token', provider: 'redis', description: 'Upstash Search REST Token' },

  // VECTOR DATABASE & EMBEDDINGS
  { name: 'CHROMA_API_KEY', envVarName: 'CHROMA_API_KEY', id: 'chroma_api_key', provider: 'chroma', description: 'ChromaDB API Key' },
  { name: 'CHROMA_TENANT', envVarName: 'CHROMA_TENANT', id: 'chroma_tenant', provider: 'chroma', description: 'ChromaDB Tenant' },
  { name: 'CHROMA_DATABASE', envVarName: 'CHROMA_DATABASE', id: 'chroma_database', provider: 'chroma', description: 'ChromaDB Database' },
  { name: 'CHROMA_HOST', envVarName: 'CHROMA_HOST', id: 'chroma_host', provider: 'chroma', description: 'ChromaDB Host' },
  { name: 'CHROMA_PORT', envVarName: 'CHROMA_PORT', id: 'chroma_port', provider: 'chroma', description: 'ChromaDB Port' },
  { name: 'CHROMA_COLLECTION', envVarName: 'CHROMA_COLLECTION', id: 'chroma_collection', provider: 'chroma', description: 'ChromaDB Collection' },
  { name: 'ENABLE_EMBEDDINGS', envVarName: 'ENABLE_EMBEDDINGS', id: 'enable_embeddings', provider: 'config', description: 'Enable embeddings' },
  { name: 'EMBEDDING_MODEL', envVarName: 'EMBEDDING_MODEL', id: 'embedding_model', provider: 'config', description: 'Embedding model' },

  // SUPABASE INTEGRATION
  { name: 'SUPABASE_URL', envVarName: 'SUPABASE_URL', id: 'supabase_url', provider: 'supabase', description: 'Supabase URL' },
  { name: 'SUPABASE_ANON_KEY', envVarName: 'SUPABASE_ANON_KEY', id: 'supabase_anon_key', provider: 'supabase', description: 'Supabase Anon Key' },
  { name: 'SUPABASE_ENABLE_AUTH', envVarName: 'SUPABASE_ENABLE_AUTH', id: 'supabase_auth', provider: 'supabase', description: 'Enable Supabase Auth' },
  { name: 'SUPABASE_ENABLE_DATABASE', envVarName: 'SUPABASE_ENABLE_DATABASE', id: 'supabase_db', provider: 'supabase', description: 'Enable Supabase Database' },
  { name: 'SUPABASE_ENABLE_STORAGE', envVarName: 'SUPABASE_ENABLE_STORAGE', id: 'supabase_storage', provider: 'supabase', description: 'Enable Supabase Storage' },
  { name: 'SUPABASE_ENABLE_REALTIME', envVarName: 'SUPABASE_ENABLE_REALTIME', id: 'supabase_realtime', provider: 'supabase', description: 'Enable Supabase Realtime' },
  { name: 'SUPABASE_ENABLE_VECTOR_SEARCH', envVarName: 'SUPABASE_ENABLE_VECTOR_SEARCH', id: 'supabase_vector', provider: 'supabase', description: 'Enable Supabase Vector Search' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', envVarName: 'SUPABASE_SERVICE_ROLE_KEY', id: 'supabase_service_key', provider: 'supabase', description: 'Supabase Service Role Key' },

  // SECURITY & JWT
  { name: 'JWT_SECRET', envVarName: 'JWT_SECRET', id: 'jwt_secret', provider: 'security', description: 'JWT Secret' },
  { name: 'NIKCLI_JWT_SECRET', envVarName: 'NIKCLI_JWT_SECRET', id: 'nikcli_jwt_secret', provider: 'security', description: 'NikCLI JWT Secret' },
  { name: 'NIKCLI_PROXY_SECRET', envVarName: 'NIKCLI_PROXY_SECRET', id: 'nikcli_proxy_secret', provider: 'security', description: 'NikCLI Proxy Secret' },
  { name: 'WEBHOOK_SECRET', envVarName: 'WEBHOOK_SECRET', id: 'webhook_secret', provider: 'security', description: 'Webhook Secret' },

  // OLLAMA CONFIGURATION
  { name: 'OLLAMA_HOST', envVarName: 'OLLAMA_HOST', id: 'ollama_host', provider: 'ollama', description: 'Ollama Host' },

  // OAUTH CONFIGURATION
  { name: 'OAUTH_BACKEND_URL', envVarName: 'OAUTH_BACKEND_URL', id: 'oauth_backend_url', provider: 'oauth', description: 'OAuth Backend URL' },
  { name: 'OAUTH_REDIRECT_URI', envVarName: 'OAUTH_REDIRECT_URI', id: 'oauth_redirect_uri', provider: 'oauth', description: 'OAuth Redirect URI' },
  { name: 'CLAUDE_CLIENT_ID', envVarName: 'CLAUDE_CLIENT_ID', id: 'claude_client_id', provider: 'oauth', description: 'Claude Client ID' },

  // VERCEL DEPLOYMENT
  { name: 'VERCEL_URL', envVarName: 'VERCEL_URL', id: 'vercel_url', provider: 'vercel', description: 'Vercel URL' },

  // RUNNER CONFIGURATION
  { name: 'MAX_CONCURRENT_JOBS', envVarName: 'MAX_CONCURRENT_JOBS', id: 'max_concurrent_jobs', provider: 'config', description: 'Max concurrent jobs' },
  { name: 'MAX_JOB_TIME_MINUTES', envVarName: 'MAX_JOB_TIME_MINUTES', id: 'max_job_time', provider: 'config', description: 'Max job time (minutes)' },

  // STRIPE CONFIGURATION
  { name: 'STRIPE_SECRET_KEY', envVarName: 'STRIPE_SECRET_KEY', id: 'stripe_secret_key', provider: 'stripe', description: 'Stripe Secret Key' },
  { name: 'STRIPE_WEBHOOK_SECRET', envVarName: 'STRIPE_WEBHOOK_SECRET', id: 'stripe_webhook_secret', provider: 'stripe', description: 'Stripe Webhook Secret' },
  { name: 'STRIPE_PRO_PRICE_ID', envVarName: 'STRIPE_PRO_PRICE_ID', id: 'stripe_pro_price_id', provider: 'stripe', description: 'Stripe Pro Price ID' },
  { name: 'SUBSCRIPTION_WEBSITE_URL', envVarName: 'SUBSCRIPTION_WEBSITE_URL', id: 'subscription_website_url', provider: 'stripe', description: 'Subscription Website URL' },
  { name: 'LEMONSQUEEZY_WEBHOOK_SECRET', envVarName: 'LEMONSQUEEZY_WEBHOOK_SECRET', id: 'lemonsqueezy_webhook', provider: 'lemonsqueezy', description: 'Lemon Squeezy Webhook Secret' },
  { name: 'LEMONSQUEEZY_PAYMENT_LINK', envVarName: 'LEMONSQUEEZY_PAYMENT_LINK', id: 'lemonsqueezy_payment_link', provider: 'lemonsqueezy', description: 'Lemon Squeezy Payment Link' },

  // RESOURCE LIMITS
  { name: 'MAX_MEMORY_MB', envVarName: 'MAX_MEMORY_MB', id: 'max_memory_mb', provider: 'config', description: 'Max memory (MB)' },
  { name: 'MAX_CPU_PERCENT', envVarName: 'MAX_CPU_PERCENT', id: 'max_cpu_percent', provider: 'config', description: 'Max CPU percent' },
  { name: 'MAX_FILE_SIZE_MB', envVarName: 'MAX_FILE_SIZE_MB', id: 'max_file_size_mb', provider: 'config', description: 'Max file size (MB)' },

  // NETWORK SECURITY
  { name: 'ALLOWED_DOMAINS', envVarName: 'ALLOWED_DOMAINS', id: 'allowed_domains', provider: 'config', description: 'Allowed domains' },

  // LOGGING & DEBUGGING
  { name: 'LOG_LEVEL', envVarName: 'LOG_LEVEL', id: 'log_level', provider: 'config', description: 'Log level' },
  { name: 'DEBUG', envVarName: 'DEBUG', id: 'debug', provider: 'config', description: 'Debug mode' },
  { name: 'DEBUG_EVENTS', envVarName: 'DEBUG_EVENTS', id: 'debug_events', provider: 'config', description: 'Debug events' },
  { name: 'NIK_PROMPT_DEBUG', envVarName: 'NIK_PROMPT_DEBUG', id: 'nik_prompt_debug', provider: 'config', description: 'NikCLI prompt debug' },
  { name: 'VALIDATE_REASONING', envVarName: 'VALIDATE_REASONING', id: 'validate_reasoning', provider: 'config', description: 'Validate reasoning' },
  { name: 'AI_SDK_LOG_WARNINGS', envVarName: 'AI_SDK_LOG_WARNINGS', id: 'ai_sdk_log_warnings', provider: 'config', description: 'AI SDK log warnings' },

  // MONITORING & TELEMETRY
  { name: 'PROMETHEUS_URL', envVarName: 'PROMETHEUS_URL', id: 'prometheus_url', provider: 'prometheus', description: 'Prometheus URL' },
  { name: 'GRAFANA_URL', envVarName: 'GRAFANA_URL', id: 'grafana_url', provider: 'grafana', description: 'Grafana URL' },
  { name: 'ENABLE_TELEMETRY', envVarName: 'ENABLE_TELEMETRY', id: 'enable_telemetry', provider: 'config', description: 'Enable telemetry' },
  { name: 'ENABLE_METRICS', envVarName: 'ENABLE_METRICS', id: 'enable_metrics', provider: 'config', description: 'Enable metrics' },
  { name: 'ENABLE_DEBUGGING', envVarName: 'ENABLE_DEBUGGING', id: 'enable_debugging', provider: 'config', description: 'Enable debugging' },
  { name: 'EMBED_CONCURRENCY', envVarName: 'EMBED_CONCURRENCY', id: 'embed_concurrency', provider: 'config', description: 'Embedding concurrency' },
  { name: 'EMBED_BATCH_SIZE', envVarName: 'EMBED_BATCH_SIZE', id: 'embed_batch_size', provider: 'config', description: 'Embedding batch size' },

  // TUI CONFIGURATION
  { name: 'NIKCLI_TUI', envVarName: 'NIKCLI_TUI', id: 'nikcli_tui', provider: 'config', description: 'NikCLI TUI enabled' },

  // RATE LIMITING
  { name: 'RATE_LIMIT_WINDOW_MS', envVarName: 'RATE_LIMIT_WINDOW_MS', id: 'rate_limit_window', provider: 'config', description: 'Rate limit window (ms)' },
  { name: 'RATE_LIMIT_MAX_REQUESTS', envVarName: 'RATE_LIMIT_MAX_REQUESTS', id: 'rate_limit_max', provider: 'config', description: 'Rate limit max requests' },

  // BLOCKCHAIN & CRYPTO
  { name: 'WALLET_ADDRESS', envVarName: 'WALLET_ADDRESS', id: 'wallet_address', provider: 'blockchain', description: 'Wallet address' },
  { name: 'RPC_URL', envVarName: 'RPC_URL', id: 'rpc_url', provider: 'blockchain', description: 'RPC URL' },
  { name: 'POLYMARKET_CHAIN_ID', envVarName: 'POLYMARKET_CHAIN_ID', id: 'polymarket_chain_id', provider: 'polymarket', description: 'Polymarket Chain ID' },
  { name: 'POLYMARKET_HOST', envVarName: 'POLYMARKET_HOST', id: 'polymarket_host', provider: 'polymarket', description: 'Polymarket Host' },
  { name: 'POLYMARKET_SIGNATURE_TYPE', envVarName: 'POLYMARKET_SIGNATURE_TYPE', id: 'polymarket_signature_type', provider: 'polymarket', description: 'Polymarket Signature Type' },
  { name: 'CDP_API_BASE_URL', envVarName: 'CDP_API_BASE_URL', id: 'cdp_api_base_url', provider: 'cdp', description: 'CDP API Base URL' },
  { name: 'CHAIN_ID', envVarName: 'CHAIN_ID', id: 'chain_id', provider: 'blockchain', description: 'Chain ID' },
  { name: 'POLYGON_RPC_URL', envVarName: 'POLYGON_RPC_URL', id: 'polygon_rpc_url', provider: 'blockchain', description: 'Polygon RPC URL' },
  { name: 'BASE_RPC_URL', envVarName: 'BASE_RPC_URL', id: 'base_rpc_url', provider: 'blockchain', description: 'Base RPC URL' },
  { name: 'GOAT_RPC_URL_ETHEREUM', envVarName: 'GOAT_RPC_URL_ETHEREUM', id: 'goat_ethereum_rpc', provider: 'blockchain', description: 'GOAT Ethereum RPC URL' },
  { name: 'GOAT_RPC_URL_SOLANA', envVarName: 'GOAT_RPC_URL_SOLANA', id: 'goat_solana_rpc', provider: 'blockchain', description: 'GOAT Solana RPC URL' },

  // OBSERVABILITY
  { name: 'OTEL_ENABLED', envVarName: 'OTEL_ENABLED', id: 'otel_enabled', provider: 'observability', description: 'OpenTelemetry enabled' },
  { name: 'OTEL_ENDPOINT', envVarName: 'OTEL_ENDPOINT', id: 'otel_endpoint', provider: 'observability', description: 'OpenTelemetry endpoint' },
  { name: 'OTEL_SERVICE_NAME', envVarName: 'OTEL_SERVICE_NAME', id: 'otel_service_name', provider: 'observability', description: 'OpenTelemetry service name' },
  { name: 'OTEL_SERVICE_VERSION', envVarName: 'OTEL_SERVICE_VERSION', id: 'otel_service_version', provider: 'observability', description: 'OpenTelemetry service version' },
  { name: 'OTEL_SAMPLE_RATE', envVarName: 'OTEL_SAMPLE_RATE', id: 'otel_sample_rate', provider: 'observability', description: 'OpenTelemetry sample rate' },
  { name: 'OTEL_EXPORT_INTERVAL_MS', envVarName: 'OTEL_EXPORT_INTERVAL_MS', id: 'otel_export_interval', provider: 'observability', description: 'OpenTelemetry export interval' },
  { name: 'PROMETHEUS_ENABLED', envVarName: 'PROMETHEUS_ENABLED', id: 'prometheus_enabled', provider: 'prometheus', description: 'Prometheus enabled' },
  { name: 'PROMETHEUS_PORT', envVarName: 'PROMETHEUS_PORT', id: 'prometheus_port', provider: 'prometheus', description: 'Prometheus port' },
  { name: 'PROMETHEUS_PATH', envVarName: 'PROMETHEUS_PATH', id: 'prometheus_path', provider: 'prometheus', description: 'Prometheus path' },

  // SENTRY
  { name: 'SENTRY_ENABLED', envVarName: 'SENTRY_ENABLED', id: 'sentry_enabled', provider: 'sentry', description: 'Sentry enabled' },
  { name: 'SENTRY_DSN', envVarName: 'SENTRY_DSN', id: 'sentry_dsn', provider: 'sentry', description: 'Sentry DSN' },
  { name: 'SENTRY_ENVIRONMENT', envVarName: 'SENTRY_ENVIRONMENT', id: 'sentry_environment', provider: 'sentry', description: 'Sentry environment' },
  { name: 'SENTRY_TRACES_SAMPLE_RATE', envVarName: 'SENTRY_TRACES_SAMPLE_RATE', id: 'sentry_traces_sample_rate', provider: 'sentry', description: 'Sentry traces sample rate' },
  { name: 'SENTRY_PROFILES_SAMPLE_RATE', envVarName: 'SENTRY_PROFILES_SAMPLE_RATE', id: 'sentry_profiles_sample_rate', provider: 'sentry', description: 'Sentry profiles sample rate' },
  { name: 'SENTRY_DEBUG', envVarName: 'SENTRY_DEBUG', id: 'sentry_debug', provider: 'sentry', description: 'Sentry debug' },

  // ALERTING
  { name: 'ALERTING_ENABLED', envVarName: 'ALERTING_ENABLED', id: 'alerting_enabled', provider: 'config', description: 'Alerting enabled' },
  { name: 'SLACK_ENABLED', envVarName: 'SLACK_ENABLED', id: 'slack_enabled', provider: 'slack', description: 'Slack alerts enabled' },
  { name: 'SLACK_WEBHOOK_URL', envVarName: 'SLACK_WEBHOOK_URL', id: 'slack_webhook_url', provider: 'slack', description: 'Slack webhook URL' },
  { name: 'SLACK_MIN_SEVERITY', envVarName: 'SLACK_MIN_SEVERITY', id: 'slack_min_severity', provider: 'slack', description: 'Slack min severity' },
  { name: 'DISCORD_ENABLED', envVarName: 'DISCORD_ENABLED', id: 'discord_enabled', provider: 'discord', description: 'Discord alerts enabled' },
  { name: 'DISCORD_WEBHOOK_URL', envVarName: 'DISCORD_WEBHOOK_URL', id: 'discord_webhook_url', provider: 'discord', description: 'Discord webhook URL' },
  { name: 'DISCORD_MIN_SEVERITY', envVarName: 'DISCORD_MIN_SEVERITY', id: 'discord_min_severity', provider: 'discord', description: 'Discord min severity' },
  { name: 'ALERT_DEDUPLICATION_ENABLED', envVarName: 'ALERT_DEDUPLICATION_ENABLED', id: 'alert_dedup_enabled', provider: 'config', description: 'Alert deduplication enabled' },
  { name: 'ALERT_DEDUPLICATION_WINDOW_MS', envVarName: 'ALERT_DEDUPLICATION_WINDOW_MS', id: 'alert_dedup_window', provider: 'config', description: 'Alert deduplication window' },
  { name: 'ALERT_THROTTLING_ENABLED', envVarName: 'ALERT_THROTTLING_ENABLED', id: 'alert_throttling_enabled', provider: 'config', description: 'Alert throttling enabled' },
  { name: 'ALERT_MAX_ALERTS_PER_MINUTE', envVarName: 'ALERT_MAX_ALERTS_PER_MINUTE', id: 'alert_max_per_minute', provider: 'config', description: 'Alert max per minute' },

  // NOTIFICATIONS
  { name: 'NOTIFICATIONS_ENABLED', envVarName: 'NOTIFICATIONS_ENABLED', id: 'notifications_enabled', provider: 'config', description: 'Notifications enabled' },
  { name: 'SLACK_TASK_NOTIFICATIONS', envVarName: 'SLACK_TASK_NOTIFICATIONS', id: 'slack_task_notifications', provider: 'slack', description: 'Slack task notifications' },
  { name: 'SLACK_CHANNEL', envVarName: 'SLACK_CHANNEL', id: 'slack_channel', provider: 'slack', description: 'Slack channel' },
  { name: 'SLACK_USERNAME', envVarName: 'SLACK_USERNAME', id: 'slack_username', provider: 'slack', description: 'Slack username' },
  { name: 'DISCORD_TASK_NOTIFICATIONS', envVarName: 'DISCORD_TASK_NOTIFICATIONS', id: 'discord_task_notifications', provider: 'discord', description: 'Discord task notifications' },
  { name: 'DISCORD_USERNAME', envVarName: 'DISCORD_USERNAME', id: 'discord_username', provider: 'discord', description: 'Discord username' },
  { name: 'LINEAR_TASK_NOTIFICATIONS', envVarName: 'LINEAR_TASK_NOTIFICATIONS', id: 'linear_task_notifications', provider: 'linear', description: 'Linear task notifications' },
  { name: 'LINEAR_API_KEY', envVarName: 'LINEAR_API_KEY', id: 'linear_api_key', provider: 'linear', description: 'Linear API Key' },
  { name: 'LINEAR_TEAM_ID', envVarName: 'LINEAR_TEAM_ID', id: 'linear_team_id', provider: 'linear', description: 'Linear Team ID' },
  { name: 'LINEAR_CREATE_ISSUES', envVarName: 'LINEAR_CREATE_ISSUES', id: 'linear_create_issues', provider: 'linear', description: 'Linear create issues' },

  // HEALTH CHECKS
  { name: 'HEALTH_CHECKS_ENABLED', envVarName: 'HEALTH_CHECKS_ENABLED', id: 'health_checks_enabled', provider: 'config', description: 'Health checks enabled' },
  { name: 'HEALTH_CHECK_INTERVAL_MS', envVarName: 'HEALTH_CHECK_INTERVAL_MS', id: 'health_check_interval', provider: 'config', description: 'Health check interval' },
]

// Valida che solo le env vars whitelisted siano embeddate
const WHITELIST_NAMES = new Set(SECRETS_TO_EMBED.map(s => s.name))

console.log('🔐 NikCLI Build with Embedded Secrets\n')

// Check if .env.production exists
if (!fs.existsSync(PRODUCTION_ENV_FILE)) {
  console.warn(`⚠️  ${PRODUCTION_ENV_FILE} not found`)
  console.warn('   Skipping secret embedding. Using environment variables or defaults.\n')
  buildWithoutSecrets()
  process.exit(0)
}

console.log('📖 Reading .env.production...')
const envContent = fs.readFileSync(PRODUCTION_ENV_FILE, 'utf-8')
const envVars = parseEnv(envContent)

// Generate hardware fingerprint for build
// In production, this would be based on the build machine's fingerprint
const buildFingerprint = generateBuildFingerprint()

// VALIDAZIONE RIGOROSA: Controlla che solo le whitelisted env vars siano in .env.production
console.log('🔍 Validating .env.production against whitelist...\n')

const envVarsFound = Object.keys(envVars)
const nonWhitelistedVars = envVarsFound.filter(key => !WHITELIST_NAMES.has(key))

if (nonWhitelistedVars.length > 0) {
  console.warn('⚠️  ATTENTION: Non-whitelisted env vars found in .env.production:\n')
  for (const varName of nonWhitelistedVars) {
    console.warn(`   ❌ ${varName} - WILL NOT BE EMBEDDED`)
  }
  console.warn(
    '\n   These variables are completely IGNORED and will NOT enter the bundle.\n' +
    '   If you want to embed them, add them to SECRETS_TO_EMBED in this script.\n'
  )
}

// Collect secrets to embed
console.log('\n🔒 Embedding whitelisted secrets only:\n')
const secretsToEmbed = []
for (const secretConfig of SECRETS_TO_EMBED) {
  const secretValue = envVars[secretConfig.name]

  if (!secretValue) {
    console.log(`⊘ Skipping ${secretConfig.name} (not found in .env.production)`)
    continue
  }

  console.log(`🔒 Encrypting ${secretConfig.name}...`)

  // Encrypt the secret
  const encrypted = encryptSecret(
    secretConfig.id,
    secretValue,
    buildFingerprint,
    secretConfig.quotaLimit,
    secretConfig.rateLimitPerMinute
  )

  secretsToEmbed.push({
    ...secretConfig,
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  })

  console.log(`✅ ${secretConfig.provider.toUpperCase()} encrypted successfully`)
}

console.log(`\n📦 Embedded ${secretsToEmbed.length} secrets\n`)

// Generate TypeScript configuration file
generateSecretsConfigFile(secretsToEmbed)

console.log('🔨 Building NikCLI...')
buildWithSecrets()

console.log('\n' + '='.repeat(70))
console.log('✅ Build with embedded secrets completed!')
console.log('='.repeat(70))

console.log('\n📦 Binary Contents:')
console.log('   ✅ EMBEDDED (encrypted):')
for (const secret of secretsToEmbed) {
  console.log(`      • ${secret.name}`)
}

if (nonWhitelistedVars.length > 0) {
  console.log('\n   ❌ NOT EMBEDDED (completely excluded):')
  for (const varName of nonWhitelistedVars) {
    console.log(`      • ${varName}`)
  }
}

console.log('\n🔒 Security:')
console.log('   • Keys encrypted with AES-256-GCM')
console.log('   • Decryption key hardware-locked (MAC + CPU + OS)')
console.log('   • Keys decrypted only in memory at runtime')
console.log('   • Zero plaintext secrets in binary')
console.log('\n' + '='.repeat(70) + '\n')

// Cleanup
console.log('🧹 Cleaning up temporary files...')
try {
  // Keep the generated file for reference, but it's in .gitignore
  console.log('✅ Cleanup completed\n')
} catch (error) {
  console.error('⚠️  Cleanup warning:', error.message)
}

console.log('🚀 Ready to distribute!')

// Helper functions

/**
 * Parse .env file format
 */
function parseEnv(content) {
  const env = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=').trim()

    // Remove quotes if present
    let cleanValue = value
    if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) || (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
      cleanValue = cleanValue.slice(1, -1)
    }

    env[key.trim()] = cleanValue
  }

  return env
}

/**
 * Generate build-time fingerprint
 * In production CI/CD, this could include build machine info
 */
function generateBuildFingerprint() {
  // CRITICAL: Must match the runtime fingerprinting logic in getMachineFingerprintSync()
  // This is NOT a random per-build fingerprint - it's the MACHINE fingerprint!
  // The secrets are encrypted with the machine's hardware fingerprint so they can
  // only be decrypted on the same machine where they were encrypted.

  // Get MAC addresses (stable across reboots)
  const interfaces = os.networkInterfaces()
  const macAddresses = Object.values(interfaces)
    .flat()
    .filter((iface) => iface?.mac && iface.mac !== '00:00:00:00:00:00')
    .map((iface) => iface?.mac)
    .sort()
    .join(',')

  // Get system information (relatively stable)
  const systemInfo = JSON.stringify({
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    type: process.platform,
    cpuCount: os.cpus().length,
  })

  // Combine all components (matching runtime logic)
  const combined = JSON.stringify({
    macs: macAddresses,
    sys: systemInfo,
    seed: '', // No timestamp seed - keep it deterministic for the build machine
  })

  // Create stable hash matching runtime
  const hash = crypto.createHash('sha256').update(combined).digest('hex')

  return hash.slice(0, 32) // Use first 32 chars for readability
}

/**
 * Encrypt a secret
 */
function encryptSecret(secretId, secretValue, fingerprint, quotaLimit, rateLimitPerMinute) {
  const algorithm = 'aes-256-gcm'
  const keyDerivationMaterial = `${fingerprint}:${secretId}`
  const salt = Buffer.from(secretId.padEnd(16, '0').slice(0, 16))

  // Derive key using scrypt
  const key = crypto.scryptSync(keyDerivationMaterial, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  })

  const iv = crypto.randomBytes(16)

  // Payload to encrypt
  const payload = JSON.stringify({
    secret: secretValue,
    quotaLimit: quotaLimit,
    rateLimitPerMinute: rateLimitPerMinute,
    encryptedAt: new Date().toISOString(),
    version: '1',
  })

  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(payload, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  }
}

/**
 * Generate TypeScript configuration file with encrypted secrets
 */
function generateSecretsConfigFile(secrets) {
  const configContent = `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated during build: ${new Date().toISOString()}
// This file contains encrypted API key configurations

import { EmbeddedSecrets } from './embedded-secrets'

// Embedded secrets configuration
const EMBEDDED_SECRETS_CONFIG = [
${secrets
      .map(
        (secret) => `
  {
    id: '${secret.id}',
    envVarName: '${secret.envVarName}',
    encrypted: '${secret.encrypted}',
    iv: '${secret.iv}',
    authTag: '${secret.authTag}',
    provider: '${secret.provider}',
    description: '${secret.description}',
  },`
      )
      .join('\n')}
]

// Initialize embedded secrets when this module is imported
EmbeddedSecrets.injectConfigs(EMBEDDED_SECRETS_CONFIG)

export default EMBEDDED_SECRETS_CONFIG
`

  fs.writeFileSync(SECRETS_CONFIG_FILE, configContent, 'utf-8')
  console.log(`Generated: ${path.relative(projectRoot, SECRETS_CONFIG_FILE)}`)
}

/**
 * Execute build with Bun (same as bun run build but with secrets embedded)
 */
function buildWithSecrets() {
  try {
    // Ensure dist/cli directory exists
    const distDir = path.join(projectRoot, 'dist', 'cli')
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true })
    }

    // Build with Bun using the same command as bun run build
    // This will include the generated-embedded-secrets.ts file automatically
    const buildCommand = [
      'bun',
      'build',
      '--compile',
      '--minify',
      '--sourcemap',
      'src/cli/index.ts',
      '--packages=external',
      `--outfile=${path.join(distDir, 'nikcli')}`,
    ].join(' ')

    console.log(`🔨 Executing: ${buildCommand}\n`)
    execSync(buildCommand, {
      cwd: projectRoot,
      stdio: 'inherit',
    })
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}

/**
 * Build without secrets (fallback)
 */
function buildWithoutSecrets() {
  try {
    // Ensure dist/cli directory exists
    const distDir = path.join(projectRoot, 'dist', 'cli')
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true })
    }

    // Build with Bun using the same command as bun run build
    const buildCommand = [
      'bun',
      'build',
      '--compile',
      '--minify',
      '--sourcemap',
      'src/cli/index.ts',
      '--packages=external',
      `--outfile=${path.join(distDir, 'nikcli')}`,
    ].join(' ')

    console.log(`🔨 Executing: ${buildCommand}\n`)
    execSync(buildCommand, {
      cwd: projectRoot,
      stdio: 'inherit',
    })
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}
