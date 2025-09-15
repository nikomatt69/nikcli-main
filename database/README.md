# NikCLI Database Schema

This directory contains the complete database schema and migrations for NikCLI's Supabase integration.

## 📋 Overview

The database schema enables:

- **User Management** - Enhanced profiles with quotas and preferences
- **Session Storage** - Chat sessions with metadata and versioning
- **Agent Blueprints** - Shareable AI agent configurations
- **Vector Search** - Semantic document search with pgvector
- **Collaboration** - Team workspaces and real-time features
- **Analytics** - Usage metrics and performance tracking
- **Security** - Audit logs and row-level security

## 🚀 Quick Setup

### 1. Complete Schema Installation

Run this in your Supabase SQL Editor to create all tables, indexes, policies, and functions:

```sql
-- Copy and paste the contents of supabase-schema.sql
-- This creates the complete database structure in one go
```

### 2. Step-by-Step Migration (Alternative)

If you prefer incremental setup:

```sql
-- Step 1: Basic tables
\i migrations/001_initial_schema.sql

-- Step 2: Advanced features
\i migrations/002_agent_blueprints.sql

-- Step 3: Vector search
\i migrations/003_vector_search.sql
```

### 3. Sample Data (Optional)

Add featured blueprints and demo content:

```sql
-- Load sample data
\i seed-data.sql
```

## 📊 Database Tables

| Table               | Purpose                  | Key Features                             |
| ------------------- | ------------------------ | ---------------------------------------- |
| `user_profiles`     | Enhanced user management | Quotas, preferences, subscription tiers  |
| `chat_sessions`     | Session storage          | JSONB content, versioning, sharing       |
| `agent_blueprints`  | AI agent templates       | Public marketplace, ratings, usage stats |
| `metrics`           | Analytics & usage        | Event tracking, performance metrics      |
| `documents`         | Vector search            | pgvector embeddings, semantic search     |
| `user_integrations` | API key management       | Encrypted storage, usage tracking        |
| `workspaces`        | Team collaboration       | Multi-user workspaces, permissions       |
| `workspace_members` | Workspace membership     | Role-based access control                |
| `audit_logs`        | Security auditing        | Action tracking, compliance              |

## 🔐 Security Features

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:

- Users can only access their own data
- Public content is appropriately shared
- Workspace members have proper access
- Admin functions are restricted

### Data Protection

- **Encrypted integrations** - API keys stored securely
- **Audit trails** - All actions logged
- **Input validation** - Database constraints prevent invalid data
- **Access controls** - Fine-grained permissions

## 🔍 Advanced Features

### Vector Search

```sql
-- Semantic document search example
SELECT * FROM search_documents(
    '[0.1, 0.2, ...]'::vector,  -- Query embedding
    0.8,                        -- Similarity threshold
    10,                         -- Max results
    'user-id'                   -- Optional user filter
);
```

### Real-time Subscriptions

```javascript
// Listen for session changes
supabase
  .channel("session-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "chat_sessions" },
    (payload) => console.log("Session updated:", payload)
  )
  .subscribe();
```

### Usage Analytics

```sql
-- Get user statistics
SELECT * FROM get_user_stats('user-id');

-- Popular blueprints view
SELECT * FROM popular_blueprints LIMIT 10;
```

## 📈 Performance Optimization

### Indexes

- **B-tree indexes** on frequently queried columns
- **GIN indexes** for JSONB and array columns
- **Vector indexes** for similarity search
- **Composite indexes** for complex queries

### Query Performance

```sql
-- Optimized session queries
EXPLAIN ANALYZE SELECT * FROM chat_sessions
WHERE user_id = $1 AND status = 'active'
ORDER BY updated_at DESC;

-- Vector search performance
EXPLAIN ANALYZE SELECT * FROM documents
WHERE embedding <=> $1 < 0.2
ORDER BY embedding <=> $1 LIMIT 10;
```

## 🔧 Maintenance

### Regular Tasks

```sql
-- Update table statistics
ANALYZE;

-- Reindex vector search (monthly)
REINDEX INDEX idx_documents_embedding;

-- Clean old audit logs (quarterly)
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Monitoring Queries

```sql
-- Check table sizes
SELECT schemaname, tablename,
       pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- Monitor cache hit rates
SELECT * FROM pg_stat_user_tables;
```

## 🛠️ Customization

### Adding Custom Fields

To add fields to existing tables:

```sql
-- Example: Add custom field to user_profiles
ALTER TABLE user_profiles
ADD COLUMN custom_data JSONB DEFAULT '{}'::jsonb;

-- Update RLS policy if needed
DROP POLICY IF EXISTS "Users can manage own profile" ON user_profiles;
CREATE POLICY "Users can manage own profile" ON user_profiles
FOR ALL USING (auth.uid() = id);
```

### Custom Agent Types

Add new agent categories:

```sql
-- Insert custom blueprint
INSERT INTO agent_blueprints (
    name, agent_type, category,
    configuration, is_public
) VALUES (
    'Custom Agent', 'custom-type', 'specialized',
    '{"temperature": 0.7}'::jsonb, false
);
```

## 📚 Schema Versions

| Version | Date       | Changes                               |
| ------- | ---------- | ------------------------------------- |
| 1.0.0   | 2024-01-18 | Initial schema with basic tables      |
| 0.1.0   | 2024-01-18 | Added agent blueprints and workspaces |
| 1.2.0   | 2024-01-18 | Vector search and audit logging       |

## 🤝 Contributing

When modifying the schema:

1. **Create migrations** for any changes
2. **Update RLS policies** as needed
3. **Test performance** with realistic data
4. **Document changes** in this README
5. **Version appropriately** following semver

## 📞 Support

For database-related issues:

1. Check Supabase logs in your dashboard
2. Verify RLS policies for access issues
3. Monitor query performance in Supabase
4. Use the built-in SQL editor for testing

## 🔗 Related Documentation

- [Supabase Documentation](https://supabase.com/docs)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
