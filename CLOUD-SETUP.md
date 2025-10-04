# Cloud Services Setup Guide

NikCLI is now configured with **Upstash Redis** and **Supabase** enabled by default for optimal performance and cloud persistence.

## 🚀 Quick Setup

### 1. Upstash Redis (Cache Layer) ⚡

Upstash Redis provides serverless caching for improved performance and reduced API costs.

**Setup Steps:**

1. Sign up at [upstash.com](https://upstash.com)
2. Create a new Redis database (Global or Regional)
3. Copy your credentials from the dashboard
4. Add to your `.env` file:

```bash
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

**Features Enabled:**

- ✅ Token caching (reduces AI API calls)
- ✅ Session persistence
- ✅ Agent state caching
- ✅ Documentation caching
- ✅ Automatic fallback to in-memory cache if unavailable

**Cost:** Free tier includes 10,000 commands/day - perfect for development!

---

### 2. Supabase (Database & Storage) 🗄️

Supabase provides PostgreSQL database, storage, auth, and real-time features.

**Setup Steps:**

1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Project Settings** → **API**
4. Copy your credentials and add to `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

5. Run the database migrations:

```bash
# Connect to your Supabase project SQL Editor and run:
cat database/migrations/*.sql | pbcopy
# Paste into Supabase SQL Editor and execute
```

**Features Enabled:**

- ✅ Database operations (chat sessions, agent blueprints)
- ✅ File storage (documents, artifacts)
- ✅ Authentication (user management)
- ✅ Real-time subscriptions (live updates)
- ✅ Vector search (semantic documentation search with pgvector)

**Cost:** Free tier includes 500 MB database + 1 GB storage - excellent for getting started!

---

## 📋 Database Schema Setup

NikCLI includes database migrations in `database/migrations/`:

1. **001_initial_schema.sql** - Core tables for sessions, users, metrics
2. **002_agent_blueprints.sql** - Agent configuration storage
3. **003_vector_search.sql** - pgvector extension for semantic search

**To apply migrations:**

1. Open your Supabase project
2. Navigate to **SQL Editor**
3. Execute each migration file in order
4. Verify tables are created in **Table Editor**

---

## ⚙️ Configuration Details

### Default Settings (config-manager.ts)

Both services are **enabled by default** with graceful fallbacks:

```typescript
redis: {
  enabled: true,              // ✅ Enabled by default
  ttl: 3600,                 // 1 hour cache TTL
  fallback: {
    enabled: true,           // Falls back to memory if unavailable
    strategy: 'memory'
  },
  strategies: {
    tokens: true,            // All caching strategies enabled
    sessions: true,
    agents: true,
    documentation: true
  }
}

supabase: {
  enabled: true,             // ✅ Enabled by default
  features: {
    database: true,          // ✅ All features enabled
    storage: true,           // ✅
    auth: true,              // ✅
    realtime: true,          // ✅
    vector: true             // ✅
  }
}
```

### Graceful Degradation

If credentials are not provided:

- **Redis**: Falls back to in-memory caching (SmartCache)
- **Supabase**: Disables cloud persistence, continues with local-only operation

No errors or crashes - the system adapts automatically! ✨

---

## 🔍 Verification

After setup, start NikCLI and check for connection messages:

```bash
nik
```

You should see:

```
🔗 Connecting to Upstash Redis...
✓ Redis connected successfully

🔗 Connecting to Supabase...
✓ Supabase connected successfully
```

---

## 🛠️ Advanced Configuration

### Redis Cluster Mode (Enterprise)

```bash
# In your config, enable cluster mode:
redis: {
  enabled: true,
  cluster: {
    enabled: true,
    nodes: [
      { host: 'node1.upstash.io', port: 6379 },
      { host: 'node2.upstash.io', port: 6379 }
    ]
  }
}
```

### Supabase Custom Table Names

```bash
# Override default table names in config:
supabase: {
  tables: {
    sessions: 'my_custom_sessions',
    blueprints: 'my_agent_configs',
    users: 'my_users',
    metrics: 'my_metrics',
    documents: 'my_docs'
  }
}
```

---

## 📊 Monitoring

### Redis Health Check

```bash
# In NikCLI, run:
/health redis
```

Shows:

- Connection status
- Latency metrics
- Memory usage
- Cache hit rate

### Supabase Stats

```bash
# In NikCLI, run:
/health supabase
```

Shows:

- Database connection
- Storage usage
- Active sessions
- Real-time connections

---

## 🚨 Troubleshooting

### Redis Connection Issues

1. **Verify credentials** in `.env`
2. **Check network**: Ensure no firewall blocking Upstash
3. **Test endpoint**: Try `curl https://your-endpoint.upstash.io`
4. **View logs**: Set `NIKCLI_LOG_LEVEL=debug` in `.env`

### Supabase Connection Issues

1. **Verify credentials** in `.env`
2. **Check project status** in Supabase dashboard
3. **Verify migrations** were applied correctly
4. **Check RLS policies** - ensure they don't block your operations

---

## 💡 Best Practices

1. **Use environment variables** - Never commit credentials to git
2. **Separate environments** - Use different Supabase projects for dev/prod
3. **Monitor usage** - Keep an eye on free tier limits
4. **Enable backups** - Supabase provides automatic backups on paid plans
5. **Test fallbacks** - Occasionally test without credentials to ensure graceful degradation

---

## 📚 Resources

- [Upstash Documentation](https://upstash.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [NikCLI Redis Provider](./src/cli/providers/redis/redis-provider.ts)
- [NikCLI Supabase Provider](./src/cli/providers/supabase/enhanced-supabase-provider.ts)

---

## 🎉 You're All Set!

With both Upstash Redis and Supabase configured, you'll enjoy:

- ⚡ **Faster responses** with intelligent caching
- 💾 **Persistent sessions** across restarts
- 🔍 **Semantic search** through documentation
- 🔄 **Real-time updates** in collaborative scenarios
- 📊 **Usage analytics** and metrics tracking

Happy coding! 🚀
