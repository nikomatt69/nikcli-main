This repository includes a simple RAG (Retrieval-Augmented Generation) toolchain using OpenAI embeddings + Pinecone.

Usage

1. Copy .env.rag.example to .env.rag and fill API keys.
2. Install deps: npm install openai @pinecone-database/pinecone globby ts-node typescript
3. Ingest: node -r dotenv/config scripts/ingest.ts
4. Query: node -r dotenv/config scripts/query.ts "How does X work?"

Files

- src/rag/chunk.ts - text chunking utility
- src/rag/openaiClient.ts - OpenAI client wrapper
- src/rag/pineconeClient.ts - Pinecone client wrapper
- scripts/ingest.ts - ingestion script
- scripts/query.ts - query & RAG answer script

Notes

- This is a minimal starting point. Consider adding filtering, better metadata, batching, retry logic, and a re-ranker.
- Keep your .env.rag out of source control.
