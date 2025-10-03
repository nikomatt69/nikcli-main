# Documentation Database Schema

This directory contains the database schema for the documentation storage and retrieval system.

## Overview

The documentation database enables:
- **Persistent storage** of indexed documentation
- **Full-text search** capabilities
- **Semantic search** using vector embeddings (pgvector)
- **Popularity tracking** and access analytics
- **Multi-user support** with Row Level Security (RLS)

## Schema Components

### Tables

#### `documentation`
Main table for storing documentation entries:
- `id` - Unique identifier
- `title` - Document title
- `content` - Full document content
- `category` - Category classification
- `tags` - Array of tags for filtering
- `language` - Document language
- `word_count` - Number of words
- `url` - Original source URL
- `vector_embedding` - Semantic search vector (1536 dimensions)
- `popularity_score` - Calculated popularity metric
- `access_count` - Number of times accessed
- `is_public` - Public/private flag

### Functions

#### `search_documentation(search_query, max_results)`
Full-text search function using PostgreSQL's text search capabilities.

```sql
SELECT * FROM search_documentation('react hooks', 10);
```

#### `vector_search_documentation(query_embedding, max_results, similarity_threshold)`
Semantic search using vector similarity (requires pgvector extension).

```sql
SELECT * FROM vector_search_documentation('[0.1, 0.2, ...]'::vector, 10, 0.3);
```

#### `increment_access_count(doc_id)`
Increments the access count for a document.

```sql
SELECT increment_access_count('doc_12345');
```

### Views

#### `popular_documentation`
Materialized view of the most popular documents, refreshed periodically.

```sql
SELECT * FROM popular_documentation;
```

Refresh manually:
```sql
SELECT refresh_popular_documentation();
```

### Security

Row Level Security (RLS) is enabled with the following policies:
- **Public read** - Anyone can read public documents
- **Authenticated insert** - Authenticated users can add documents
- **Owner update** - Users can update their own documents
- **Owner delete** - Users can delete their own documents

## Setup Instructions

### 1. Supabase Setup

If using Supabase:

1. Create a new Supabase project
2. Enable the pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Run the schema.sql file in the SQL Editor
4. Configure your `.nikcli/config.json`:
   ```json
   {
     "supabase": {
       "enabled": true,
       "url": "https://your-project.supabase.co",
       "anonKey": "your-anon-key",
       "features": {
         "database": true,
         "vector": true
       }
     }
   }
   ```

### 2. Local PostgreSQL Setup

For local development:

1. Install PostgreSQL 14+
2. Install pgvector extension:
   ```bash
   cd /tmp
   git clone https://github.com/pgvector/pgvector.git
   cd pgvector
   make
   make install
   ```
3. Create database and run schema:
   ```bash
   createdb nikcli_docs
   psql nikcli_docs < schema.sql
   ```

## Usage Examples

### Adding Documentation

Documentation is automatically saved to the database when using `/doc-add`:

```bash
/doc-add https://reactjs.org/docs/hooks-intro.html react
```

### Searching Documentation

Use the smart docs search tool:

```bash
# In chat
I need documentation about React hooks
```

The AI will automatically:
1. Search local documentation library
2. Query the database if no local results
3. Search cloud/shared documentation
4. Suggest web sources if needed

### Database Integration

The documentation database integrates with:
- **DocumentationLibrary** - Saves entries after indexing
- **SmartDocsSearchTool** - Searches database when local results are insufficient
- **DocsRequestTool** - Requests and loads documentation from database

## Performance Optimization

### Indexes

The schema includes optimized indexes for:
- Category filtering
- Tag-based search (GIN index)
- Full-text search (GIN index)
- Vector similarity (IVFFlat index)
- Popularity sorting

### Caching

Consider implementing application-level caching:
- Cache frequently accessed documents
- Cache search results (with TTL)
- Use Redis for distributed caching

### Vector Search

For optimal vector search performance:
1. Generate embeddings using OpenAI's `text-embedding-ada-002`
2. Store in the `vector_embedding` column
3. Adjust IVFFlat index parameters based on dataset size

## Monitoring

Track documentation usage:

```sql
-- Most accessed documents
SELECT title, access_count, category
FROM documentation
ORDER BY access_count DESC
LIMIT 10;

-- Category distribution
SELECT category, COUNT(*) as count
FROM documentation
GROUP BY category
ORDER BY count DESC;

-- Popular tags
SELECT unnest(tags) as tag, COUNT(*) as count
FROM documentation
GROUP BY tag
ORDER BY count DESC
LIMIT 20;
```

## Maintenance

### Regular Tasks

1. **Refresh materialized view** (daily):
   ```sql
   SELECT refresh_popular_documentation();
   ```

2. **Update popularity scores** (weekly):
   ```sql
   UPDATE documentation
   SET popularity_score = (access_count * 0.7 + word_count * 0.0001)
   WHERE updated_at > NOW() - INTERVAL '7 days';
   ```

3. **Clean old documents** (monthly):
   ```sql
   DELETE FROM documentation
   WHERE access_count = 0 
     AND created_at < NOW() - INTERVAL '90 days';
   ```

## Troubleshooting

### Vector Search Not Working

1. Ensure pgvector extension is installed:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

2. Check if embeddings are populated:
   ```sql
   SELECT COUNT(*) FROM documentation WHERE vector_embedding IS NOT NULL;
   ```

### Slow Queries

1. Analyze query performance:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM search_documentation('react', 10);
   ```

2. Check index usage:
   ```sql
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_user_indexes
   WHERE tablename = 'documentation';
   ```

## Migration from File-based Storage

To migrate existing documentation from JSON files:

```sql
-- Import from JSON (example)
INSERT INTO documentation (id, title, content, category, tags, language, word_count, created_at)
SELECT 
  (doc->>'id')::text,
  (doc->>'title')::text,
  (doc->>'content')::text,
  (doc->>'category')::text,
  ARRAY(SELECT jsonb_array_elements_text(doc->'tags')),
  (doc->'metadata'->>'language')::text,
  (doc->'metadata'->>'wordCount')::integer,
  (doc->>'timestamp')::timestamptz
FROM jsonb_array_elements(:'json_data'::jsonb) AS doc;
```

## Contributing

To extend the schema:
1. Create migration file: `migrations/YYYYMMDD_description.sql`
2. Update this README
3. Test with both Supabase and local PostgreSQL
4. Submit PR with schema changes
