/**
 * Secrets Configuration
 * Centralized configuration for all API providers and their associated secrets
 * Defines which environment variables map to which providers
 */

export interface ProviderSecretConfig {
  id: string
  provider: string
  environmentVars: string[] // Priority order for checking env vars
  description: string
  quotaLimit?: number
  rateLimitPerMinute?: number
  optional?: boolean // If false, provider won't work without a secret
}

/**
 * Provider secrets mapping
 * Defines how to look up secrets for each provider
 */
export const PROVIDER_SECRETS_CONFIG: Record<string, ProviderSecretConfig> = {
  // Generated from build-with-secrets.mjs - DO NOT EDIT MANUALLY
  nodeenv: {
    id: 'node_env',
    provider: 'config',
    environmentVars: ['NODE_ENV'],
    description: 'Node environment',
    optional: true,
  },
  port: {
    id: 'port',
    provider: 'config',
    environmentVars: ['PORT'],
    description: 'Server port',
    optional: true,
  },
  webport: {
    id: 'web_port',
    provider: 'config',
    environmentVars: ['WEB_PORT'],
    description: 'Web port',
    optional: true,
  },
  apiport: {
    id: 'api_port',
    provider: 'config',
    environmentVars: ['API_PORT'],
    description: 'API port',
    optional: true,
  },
  consoleport: {
    id: 'console_port',
    provider: 'config',
    environmentVars: ['CONSOLE_PORT'],
    description: 'Console port',
    optional: true,
  },
  nikclicompact: {
    id: 'nikcli_compact',
    provider: 'config',
    environmentVars: ['NIKCLI_COMPACT'],
    description: 'Compact mode',
    optional: true,
  },
  allowedorigins: {
    id: 'allowed_origins',
    provider: 'config',
    environmentVars: ['ALLOWED_ORIGINS'],
    description: 'CORS origins',
    optional: true,
  },
  githubtoken: {
    id: 'github_token',
    provider: 'github',
    environmentVars: ['GITHUB_TOKEN'],
    description: 'GitHub Personal Access Token',
    optional: true,
  },
  githubappid: {
    id: 'github_app_id',
    provider: 'github',
    environmentVars: ['GITHUB_APP_ID'],
    description: 'GitHub App ID',
    optional: true,
  },
  githubprivatekey: {
    id: 'github_private_key',
    provider: 'github',
    environmentVars: ['GITHUB_PRIVATE_KEY_PATH'],
    description: 'GitHub Private Key',
    optional: true,
  },
  githubinstallationid: {
    id: 'github_installation_id',
    provider: 'github',
    environmentVars: ['GITHUB_INSTALLATION_ID'],
    description: 'GitHub Installation ID',
    optional: true,
  },
  githubwebhooksecret: {
    id: 'github_webhook_secret',
    provider: 'github',
    environmentVars: ['GITHUB_WEBHOOK_SECRET'],
    description: 'GitHub Webhook Secret',
    optional: true,
  },
  githubclientid: {
    id: 'github_client_id',
    provider: 'github',
    environmentVars: ['GITHUB_CLIENT_ID'],
    description: 'GitHub OAuth Client ID',
    optional: true,
  },
  githubclientsecret: {
    id: 'github_client_secret',
    provider: 'github',
    environmentVars: ['GITHUB_CLIENT_SECRET'],
    description: 'GitHub OAuth Secret',
    optional: true,
  },
  databaseurl: {
    id: 'database_url',
    provider: 'database',
    environmentVars: ['DATABASE_URL'],
    description: 'PostgreSQL connection URL',
    optional: true,
  },
  postgresurl: {
    id: 'postgres_url',
    provider: 'database',
    environmentVars: ['POSTGRES_URL'],
    description: 'PostgreSQL URL (dev)',
    optional: true,
  },
  redisurl: {
    id: 'redis_url',
    provider: 'redis',
    environmentVars: ['REDIS_URL'],
    description: 'Redis connection URL',
    optional: true,
  },
  upstashredisurl: {
    id: 'upstash_redis_url',
    provider: 'redis',
    environmentVars: ['UPSTASH_REDIS_REST_URL'],
    description: 'Upstash Redis REST URL',
    optional: true,
  },
  upstashredistoken: {
    id: 'upstash_redis_token',
    provider: 'redis',
    environmentVars: ['UPSTASH_REDIS_REST_TOKEN'],
    description: 'Upstash Redis REST Token',
    optional: true,
  },
  redishost: {
    id: 'redis_host',
    provider: 'redis',
    environmentVars: ['REDIS_HOST'],
    description: 'Redis host',
    optional: true,
  },
  redisport: {
    id: 'redis_port',
    provider: 'redis',
    environmentVars: ['REDIS_PORT'],
    description: 'Redis port',
    optional: true,
  },
  redispassword: {
    id: 'redis_password',
    provider: 'redis',
    environmentVars: ['REDIS_PASSWORD'],
    description: 'Redis password',
    optional: true,
  },
  redisdb: {
    id: 'redis_db',
    provider: 'redis',
    environmentVars: ['REDIS_DB'],
    description: 'Redis database',
    optional: true,
  },
  redistls: {
    id: 'redis_tls',
    provider: 'redis',
    environmentVars: ['REDIS_TLS'],
    description: 'Redis TLS enabled',
    optional: true,
  },
  redisconnecttimeout: {
    id: 'redis_connect_timeout',
    provider: 'redis',
    environmentVars: ['REDIS_CONNECT_TIMEOUT'],
    description: 'Redis connection timeout',
    optional: true,
  },
  rediscommandtimeout: {
    id: 'redis_command_timeout',
    provider: 'redis',
    environmentVars: ['REDIS_COMMAND_TIMEOUT'],
    description: 'Redis command timeout',
    optional: true,
  },
  redismaxretries: {
    id: 'redis_max_retries',
    provider: 'redis',
    environmentVars: ['REDIS_MAX_RETRIES'],
    description: 'Redis max retries',
    optional: true,
  },
  redisretrydelay: {
    id: 'redis_retry_delay',
    provider: 'redis',
    environmentVars: ['REDIS_RETRY_DELAY'],
    description: 'Redis retry delay',
    optional: true,
  },
  upstashsearchurl: {
    id: 'upstash_search_url',
    provider: 'redis',
    environmentVars: ['UPSTASH_SEARCH_REST_URL'],
    description: 'Upstash Search REST URL',
    optional: true,
  },
  upstashsearchtoken: {
    id: 'upstash_search_token',
    provider: 'redis',
    environmentVars: ['UPSTASH_SEARCH_REST_TOKEN'],
    description: 'Upstash Search REST Token',
    optional: true,
  },
  chromaapikey: {
    id: 'chroma_api_key',
    provider: 'chroma',
    environmentVars: ['CHROMA_API_KEY'],
    description: 'ChromaDB API Key',
    optional: true,
  },
  chromatenant: {
    id: 'chroma_tenant',
    provider: 'chroma',
    environmentVars: ['CHROMA_TENANT'],
    description: 'ChromaDB Tenant',
    optional: true,
  },
  chromadatabase: {
    id: 'chroma_database',
    provider: 'chroma',
    environmentVars: ['CHROMA_DATABASE'],
    description: 'ChromaDB Database',
    optional: true,
  },
  chromahost: {
    id: 'chroma_host',
    provider: 'chroma',
    environmentVars: ['CHROMA_HOST'],
    description: 'ChromaDB Host',
    optional: true,
  },
  chromaport: {
    id: 'chroma_port',
    provider: 'chroma',
    environmentVars: ['CHROMA_PORT'],
    description: 'ChromaDB Port',
    optional: true,
  },
  chromacollection: {
    id: 'chroma_collection',
    provider: 'chroma',
    environmentVars: ['CHROMA_COLLECTION'],
    description: 'ChromaDB Collection',
    optional: true,
  },
  enableembeddings: {
    id: 'enable_embeddings',
    provider: 'config',
    environmentVars: ['ENABLE_EMBEDDINGS'],
    description: 'Enable embeddings',
    optional: true,
  },
  embeddingmodel: {
    id: 'embedding_model',
    provider: 'config',
    environmentVars: ['EMBEDDING_MODEL'],
    description: 'Embedding model',
    optional: true,
  },
  supabaseurl: {
    id: 'supabase_url',
    provider: 'supabase',
    environmentVars: ['SUPABASE_URL'],
    description: 'Supabase URL',
    optional: true,
  },
  supabaseanonkey: {
    id: 'supabase_anon_key',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ANON_KEY'],
    description: 'Supabase Anon Key',
    optional: true,
  },
  supabaseauth: {
    id: 'supabase_auth',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ENABLE_AUTH'],
    description: 'Enable Supabase Auth',
    optional: true,
  },
  supabasedb: {
    id: 'supabase_db',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ENABLE_DATABASE'],
    description: 'Enable Supabase Database',
    optional: true,
  },
  supabasestorage: {
    id: 'supabase_storage',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ENABLE_STORAGE'],
    description: 'Enable Supabase Storage',
    optional: true,
  },
  supabaserealtime: {
    id: 'supabase_realtime',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ENABLE_REALTIME'],
    description: 'Enable Supabase Realtime',
    optional: true,
  },
  supabasevector: {
    id: 'supabase_vector',
    provider: 'supabase',
    environmentVars: ['SUPABASE_ENABLE_VECTOR_SEARCH'],
    description: 'Enable Supabase Vector Search',
    optional: true,
  },
  supabaseservicekey: {
    id: 'supabase_service_key',
    provider: 'supabase',
    environmentVars: ['SUPABASE_SERVICE_ROLE_KEY'],
    description: 'Supabase Service Role Key',
    optional: true,
  },
  jwtsecret: {
    id: 'jwt_secret',
    provider: 'security',
    environmentVars: ['JWT_SECRET'],
    description: 'JWT Secret',
    optional: true,
  },
  nikclijwtsecret: {
    id: 'nikcli_jwt_secret',
    provider: 'security',
    environmentVars: ['NIKCLI_JWT_SECRET'],
    description: 'NikCLI JWT Secret',
    optional: true,
  },
  nikcliproxysecret: {
    id: 'nikcli_proxy_secret',
    provider: 'security',
    environmentVars: ['NIKCLI_PROXY_SECRET'],
    description: 'NikCLI Proxy Secret',
    optional: true,
  },
  webhooksecret: {
    id: 'webhook_secret',
    provider: 'security',
    environmentVars: ['WEBHOOK_SECRET'],
    description: 'Webhook Secret',
    optional: true,
  },
  ollamahost: {
    id: 'ollama_host',
    provider: 'ollama',
    environmentVars: ['OLLAMA_HOST'],
    description: 'Ollama Host',
    optional: true,
  },
  oauthbackendurl: {
    id: 'oauth_backend_url',
    provider: 'oauth',
    environmentVars: ['OAUTH_BACKEND_URL'],
    description: 'OAuth Backend URL',
    optional: true,
  },
  oauthredirecturi: {
    id: 'oauth_redirect_uri',
    provider: 'oauth',
    environmentVars: ['OAUTH_REDIRECT_URI'],
    description: 'OAuth Redirect URI',
    optional: true,
  },
  claudeclientid: {
    id: 'claude_client_id',
    provider: 'oauth',
    environmentVars: ['CLAUDE_CLIENT_ID'],
    description: 'Claude Client ID',
    optional: true,
  },
  vercelurl: {
    id: 'vercel_url',
    provider: 'vercel',
    environmentVars: ['VERCEL_URL'],
    description: 'Vercel URL',
    optional: true,
  },
  maxconcurrentjobs: {
    id: 'max_concurrent_jobs',
    provider: 'config',
    environmentVars: ['MAX_CONCURRENT_JOBS'],
    description: 'Max concurrent jobs',
    optional: true,
  },
  maxjobtime: {
    id: 'max_job_time',
    provider: 'config',
    environmentVars: ['MAX_JOB_TIME_MINUTES'],
    description: 'Max job time (minutes)',
    optional: true,
  },
  stripesecretkey: {
    id: 'stripe_secret_key',
    provider: 'stripe',
    environmentVars: ['STRIPE_SECRET_KEY'],
    description: 'Stripe Secret Key',
    optional: true,
  },
  stripewebhooksecret: {
    id: 'stripe_webhook_secret',
    provider: 'stripe',
    environmentVars: ['STRIPE_WEBHOOK_SECRET'],
    description: 'Stripe Webhook Secret',
    optional: true,
  },
  stripepropriceid: {
    id: 'stripe_pro_price_id',
    provider: 'stripe',
    environmentVars: ['STRIPE_PRO_PRICE_ID'],
    description: 'Stripe Pro Price ID',
    optional: true,
  },
  subscriptionwebsiteurl: {
    id: 'subscription_website_url',
    provider: 'stripe',
    environmentVars: ['SUBSCRIPTION_WEBSITE_URL'],
    description: 'Subscription Website URL',
    optional: true,
  },
  lemonsqueezywebhook: {
    id: 'lemonsqueezy_webhook',
    provider: 'lemonsqueezy',
    environmentVars: ['LEMONSQUEEZY_WEBHOOK_SECRET'],
    description: 'Lemon Squeezy Webhook Secret',
    optional: true,
  },
  lemonsqueezypaymentlink: {
    id: 'lemonsqueezy_payment_link',
    provider: 'lemonsqueezy',
    environmentVars: ['LEMONSQUEEZY_PAYMENT_LINK'],
    description: 'Lemon Squeezy Payment Link',
    optional: true,
  },
  maxmemorymb: {
    id: 'max_memory_mb',
    provider: 'config',
    environmentVars: ['MAX_MEMORY_MB'],
    description: 'Max memory (MB)',
    optional: true,
  },
  maxcpupercent: {
    id: 'max_cpu_percent',
    provider: 'config',
    environmentVars: ['MAX_CPU_PERCENT'],
    description: 'Max CPU percent',
    optional: true,
  },
  maxfilesizemb: {
    id: 'max_file_size_mb',
    provider: 'config',
    environmentVars: ['MAX_FILE_SIZE_MB'],
    description: 'Max file size (MB)',
    optional: true,
  },
  alloweddomains: {
    id: 'allowed_domains',
    provider: 'config',
    environmentVars: ['ALLOWED_DOMAINS'],
    description: 'Allowed domains',
    optional: true,
  },
  loglevel: {
    id: 'log_level',
    provider: 'config',
    environmentVars: ['LOG_LEVEL'],
    description: 'Log level',
    optional: true,
  },
  debug: {
    id: 'debug',
    provider: 'config',
    environmentVars: ['DEBUG'],
    description: 'Debug mode',
    optional: true,
  },
  debugevents: {
    id: 'debug_events',
    provider: 'config',
    environmentVars: ['DEBUG_EVENTS'],
    description: 'Debug events',
    optional: true,
  },
  nikpromptdebug: {
    id: 'nik_prompt_debug',
    provider: 'config',
    environmentVars: ['NIK_PROMPT_DEBUG'],
    description: 'NikCLI prompt debug',
    optional: true,
  },
  validatereasoning: {
    id: 'validate_reasoning',
    provider: 'config',
    environmentVars: ['VALIDATE_REASONING'],
    description: 'Validate reasoning',
    optional: true,
  },
  aisdklogwarnings: {
    id: 'ai_sdk_log_warnings',
    provider: 'config',
    environmentVars: ['AI_SDK_LOG_WARNINGS'],
    description: 'AI SDK log warnings',
    optional: true,
  },
  prometheusurl: {
    id: 'prometheus_url',
    provider: 'prometheus',
    environmentVars: ['PROMETHEUS_URL'],
    description: 'Prometheus URL',
    optional: true,
  },
  grafanaurl: {
    id: 'grafana_url',
    provider: 'grafana',
    environmentVars: ['GRAFANA_URL'],
    description: 'Grafana URL',
    optional: true,
  },
  enabletelemetry: {
    id: 'enable_telemetry',
    provider: 'config',
    environmentVars: ['ENABLE_TELEMETRY'],
    description: 'Enable telemetry',
    optional: true,
  },
  enablemetrics: {
    id: 'enable_metrics',
    provider: 'config',
    environmentVars: ['ENABLE_METRICS'],
    description: 'Enable metrics',
    optional: true,
  },
  enabledebugging: {
    id: 'enable_debugging',
    provider: 'config',
    environmentVars: ['ENABLE_DEBUGGING'],
    description: 'Enable debugging',
    optional: true,
  },
  embedconcurrency: {
    id: 'embed_concurrency',
    provider: 'config',
    environmentVars: ['EMBED_CONCURRENCY'],
    description: 'Embedding concurrency',
    optional: true,
  },
  embedbatchsize: {
    id: 'embed_batch_size',
    provider: 'config',
    environmentVars: ['EMBED_BATCH_SIZE'],
    description: 'Embedding batch size',
    optional: true,
  },
  nikclitui: {
    id: 'nikcli_tui',
    provider: 'config',
    environmentVars: ['NIKCLI_TUI'],
    description: 'NikCLI TUI enabled',
    optional: true,
  },
  ratelimitwindow: {
    id: 'rate_limit_window',
    provider: 'config',
    environmentVars: ['RATE_LIMIT_WINDOW_MS'],
    description: 'Rate limit window (ms)',
    optional: true,
  },
  ratelimitmax: {
    id: 'rate_limit_max',
    provider: 'config',
    environmentVars: ['RATE_LIMIT_MAX_REQUESTS'],
    description: 'Rate limit max requests',
    optional: true,
  },
  walletaddress: {
    id: 'wallet_address',
    provider: 'blockchain',
    environmentVars: ['WALLET_ADDRESS'],
    description: 'Wallet address',
    optional: true,
  },
  rpcurl: {
    id: 'rpc_url',
    provider: 'blockchain',
    environmentVars: ['RPC_URL'],
    description: 'RPC URL',
    optional: true,
  },
  upstashvectorurl: {
    id: 'upstash_vector_url',
    provider: 'upstash',
    environmentVars: ['UPSTASH_VECTOR_REST_URL'],
    description: 'Upstash Vector REST URL',
    optional: true,
  },
  upstashvectortoken: {
    id: 'upstash_vector_token',
    provider: 'upstash',
    environmentVars: ['UPSTASH_VECTOR_REST_TOKEN'],
    description: 'Upstash Vector REST Token',
    optional: true,
  },
  polymarketchainid: {
    id: 'polymarket_chain_id',
    provider: 'polymarket',
    environmentVars: ['POLYMARKET_CHAIN_ID'],
    description: 'Polymarket Chain ID',
    optional: true,
  },
  polymarkethost: {
    id: 'polymarket_host',
    provider: 'polymarket',
    environmentVars: ['POLYMARKET_HOST'],
    description: 'Polymarket Host',
    optional: true,
  },
  polymarketsignaturetype: {
    id: 'polymarket_signature_type',
    provider: 'polymarket',
    environmentVars: ['POLYMARKET_SIGNATURE_TYPE'],
    description: 'Polymarket Signature Type',
    optional: true,
  },
  cdpapibaseurl: {
    id: 'cdp_api_base_url',
    provider: 'cdp',
    environmentVars: ['CDP_API_BASE_URL'],
    description: 'CDP API Base URL',
    optional: true,
  },
  chainid: {
    id: 'chain_id',
    provider: 'blockchain',
    environmentVars: ['CHAIN_ID'],
    description: 'Chain ID',
    optional: true,
  },
  polygonrpcurl: {
    id: 'polygon_rpc_url',
    provider: 'blockchain',
    environmentVars: ['POLYGON_RPC_URL'],
    description: 'Polygon RPC URL',
    optional: true,
  },
  baserpcurl: {
    id: 'base_rpc_url',
    provider: 'blockchain',
    environmentVars: ['BASE_RPC_URL'],
    description: 'Base RPC URL',
    optional: true,
  },
  goatethereumrpc: {
    id: 'goat_ethereum_rpc',
    provider: 'blockchain',
    environmentVars: ['GOAT_RPC_URL_ETHEREUM'],
    description: 'GOAT Ethereum RPC URL',
    optional: true,
  },
  goatsolanarpc: {
    id: 'goat_solana_rpc',
    provider: 'blockchain',
    environmentVars: ['GOAT_RPC_URL_SOLANA'],
    description: 'GOAT Solana RPC URL',
    optional: true,
  },
  otelenabled: {
    id: 'otel_enabled',
    provider: 'observability',
    environmentVars: ['OTEL_ENABLED'],
    description: 'OpenTelemetry enabled',
    optional: true,
  },
  otelendpoint: {
    id: 'otel_endpoint',
    provider: 'observability',
    environmentVars: ['OTEL_ENDPOINT'],
    description: 'OpenTelemetry endpoint',
    optional: true,
  },
  otelservicename: {
    id: 'otel_service_name',
    provider: 'observability',
    environmentVars: ['OTEL_SERVICE_NAME'],
    description: 'OpenTelemetry service name',
    optional: true,
  },
  otelserviceversion: {
    id: 'otel_service_version',
    provider: 'observability',
    environmentVars: ['OTEL_SERVICE_VERSION'],
    description: 'OpenTelemetry service version',
    optional: true,
  },
  otelsamplerate: {
    id: 'otel_sample_rate',
    provider: 'observability',
    environmentVars: ['OTEL_SAMPLE_RATE'],
    description: 'OpenTelemetry sample rate',
    optional: true,
  },
  otelexportinterval: {
    id: 'otel_export_interval',
    provider: 'observability',
    environmentVars: ['OTEL_EXPORT_INTERVAL_MS'],
    description: 'OpenTelemetry export interval',
    optional: true,
  },
  prometheusenabled: {
    id: 'prometheus_enabled',
    provider: 'prometheus',
    environmentVars: ['PROMETHEUS_ENABLED'],
    description: 'Prometheus enabled',
    optional: true,
  },
  prometheusport: {
    id: 'prometheus_port',
    provider: 'prometheus',
    environmentVars: ['PROMETHEUS_PORT'],
    description: 'Prometheus port',
    optional: true,
  },
  prometheuspath: {
    id: 'prometheus_path',
    provider: 'prometheus',
    environmentVars: ['PROMETHEUS_PATH'],
    description: 'Prometheus path',
    optional: true,
  },
  sentryenabled: {
    id: 'sentry_enabled',
    provider: 'sentry',
    environmentVars: ['SENTRY_ENABLED'],
    description: 'Sentry enabled',
    optional: true,
  },
  sentrydsn: {
    id: 'sentry_dsn',
    provider: 'sentry',
    environmentVars: ['SENTRY_DSN'],
    description: 'Sentry DSN',
    optional: true,
  },
  sentryenvironment: {
    id: 'sentry_environment',
    provider: 'sentry',
    environmentVars: ['SENTRY_ENVIRONMENT'],
    description: 'Sentry environment',
    optional: true,
  },
  sentrytracessamplerate: {
    id: 'sentry_traces_sample_rate',
    provider: 'sentry',
    environmentVars: ['SENTRY_TRACES_SAMPLE_RATE'],
    description: 'Sentry traces sample rate',
    optional: true,
  },
  sentryprofilessamplerate: {
    id: 'sentry_profiles_sample_rate',
    provider: 'sentry',
    environmentVars: ['SENTRY_PROFILES_SAMPLE_RATE'],
    description: 'Sentry profiles sample rate',
    optional: true,
  },
  sentrydebug: {
    id: 'sentry_debug',
    provider: 'sentry',
    environmentVars: ['SENTRY_DEBUG'],
    description: 'Sentry debug',
    optional: true,
  },
  alertingenabled: {
    id: 'alerting_enabled',
    provider: 'config',
    environmentVars: ['ALERTING_ENABLED'],
    description: 'Alerting enabled',
    optional: true,
  },
  slackenabled: {
    id: 'slack_enabled',
    provider: 'slack',
    environmentVars: ['SLACK_ENABLED'],
    description: 'Slack alerts enabled',
    optional: true,
  },
  slackwebhookurl: {
    id: 'slack_webhook_url',
    provider: 'slack',
    environmentVars: ['SLACK_WEBHOOK_URL'],
    description: 'Slack webhook URL',
    optional: true,
  },
  slackminseverity: {
    id: 'slack_min_severity',
    provider: 'slack',
    environmentVars: ['SLACK_MIN_SEVERITY'],
    description: 'Slack min severity',
    optional: true,
  },
  discordenabled: {
    id: 'discord_enabled',
    provider: 'discord',
    environmentVars: ['DISCORD_ENABLED'],
    description: 'Discord alerts enabled',
    optional: true,
  },
  discordwebhookurl: {
    id: 'discord_webhook_url',
    provider: 'discord',
    environmentVars: ['DISCORD_WEBHOOK_URL'],
    description: 'Discord webhook URL',
    optional: true,
  },
  discordminseverity: {
    id: 'discord_min_severity',
    provider: 'discord',
    environmentVars: ['DISCORD_MIN_SEVERITY'],
    description: 'Discord min severity',
    optional: true,
  },
  alertdedupenabled: {
    id: 'alert_dedup_enabled',
    provider: 'config',
    environmentVars: ['ALERT_DEDUPLICATION_ENABLED'],
    description: 'Alert deduplication enabled',
    optional: true,
  },
  alertdedupwindow: {
    id: 'alert_dedup_window',
    provider: 'config',
    environmentVars: ['ALERT_DEDUPLICATION_WINDOW_MS'],
    description: 'Alert deduplication window',
    optional: true,
  },
  alertthrottlingenabled: {
    id: 'alert_throttling_enabled',
    provider: 'config',
    environmentVars: ['ALERT_THROTTLING_ENABLED'],
    description: 'Alert throttling enabled',
    optional: true,
  },
  alertmaxperminute: {
    id: 'alert_max_per_minute',
    provider: 'config',
    environmentVars: ['ALERT_MAX_ALERTS_PER_MINUTE'],
    description: 'Alert max per minute',
    optional: true,
  },
  healthchecksenabled: {
    id: 'health_checks_enabled',
    provider: 'config',
    environmentVars: ['HEALTH_CHECKS_ENABLED'],
    description: 'Health checks enabled',
    optional: true,
  },
  healthcheckinterval: {
    id: 'health_check_interval',
    provider: 'config',
    environmentVars: ['HEALTH_CHECK_INTERVAL_MS'],
    description: 'Health check interval',
    optional: true,
  },
}

/**
 * Get configuration for a provider
 */
export function getProviderConfig(provider: string): ProviderSecretConfig | null {
  return PROVIDER_SECRETS_CONFIG[provider.toLowerCase()] || null
}

/**
 * Get secret ID for a provider
 */
export function getSecretId(provider: string): string | null {
  const config = getProviderConfig(provider)
  return config?.id || null
}

/**
 * Get environment variable names to check for a provider
 */
export function getEnvironmentVarNames(provider: string): string[] {
  const config = getProviderConfig(provider)
  return config?.environmentVars || []
}

/**
 * Check if provider requires a secret
 */
export function isProviderRequired(provider: string): boolean {
  const config = getProviderConfig(provider)
  return config ? !config.optional : false
}

/**
 * Get all configured providers
 */
export function getAllConfiguredProviders(): string[] {
  return Object.keys(PROVIDER_SECRETS_CONFIG)
}

/**
 * Get optional providers
 */
export function getOptionalProviders(): string[] {
  return getAllConfiguredProviders().filter((provider) => {
    const config = getProviderConfig(provider)
    return config?.optional === true
  })
}

/**
 * Get required providers
 */
export function getRequiredProviders(): string[] {
  return getAllConfiguredProviders().filter((provider) => {
    const config = getProviderConfig(provider)
    return config?.optional !== true
  })
}
