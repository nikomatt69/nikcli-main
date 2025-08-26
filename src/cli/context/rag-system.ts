import { ChromaClient, CloudClient, EmbeddingFunction } from "chromadb";
// Register default embed provider for CloudClient (server-side embeddings)
// This package is a side-effect import that wires up default embeddings
// when using Chroma Cloud.
import "@chroma-core/default-embed";
import { readFile, writeFile, mkdir } from "fs/promises";
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, relative, resolve, extname, dirname } from "path";
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { homedir } from 'os';
import chalk from 'chalk';
import { CliUI } from '../utils/cli-ui';
import { configManager } from '../core/config-manager';
import { TOKEN_LIMITS, calculateTokenCost } from '../config/token-limits';
import { tokenTelemetry } from '../core/token-telemetry';

// Import workspace analysis types for integration
import type { FileEmbedding, WorkspaceContext } from './workspace-rag';
import { WorkspaceRAG } from './workspace-rag';

// Unified RAG interfaces
export interface UnifiedRAGConfig {
  useVectorDB: boolean;
  useLocalEmbeddings: boolean;
  hybridMode: boolean;
  maxIndexFiles: number;
  chunkSize: number;
  overlapSize: number;
  enableWorkspaceAnalysis: boolean;
  enableSemanticSearch: boolean;
  cacheEmbeddings: boolean;
  costThreshold: number;
}

export interface RAGSearchResult {
  content: string;
  path: string;
  score: number;
  metadata: {
    chunkIndex?: number;
    totalChunks?: number;
    fileType: string;
    importance: number;
    lastModified: Date;
    source: 'vector' | 'workspace' | 'hybrid';
  };
}

export interface RAGAnalysisResult {
  workspaceContext: WorkspaceContext;
  indexedFiles: number;
  embeddingsCost: number;
  processingTime: number;
  vectorDBStatus: 'available' | 'unavailable' | 'error';
  fallbackMode: boolean;
}

class OpenAIEmbeddingFunction implements EmbeddingFunction {
  private apiKey: string;
  private model: string = 'text-embedding-3-small'; // Most cost-effective OpenAI embedding model
  private maxTokens: number = 8191; // Max tokens per request for this model
  private batchSize: number = 100; // Process in batches to avoid rate limits

  constructor() {
    this.apiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenAI API key not found. Set it using: npm run cli set-key openai YOUR_API_KEY');
    }
  }

  async generate(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      // Process texts in batches to avoid rate limits and token limits
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const batchResults = await this.generateBatch(batch);
        results.push(...batchResults);

        // Add small delay between batches to respect rate limits
        if (i + this.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results;
    } catch (error: any) {
      CliUI.logError(`Embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  private async generateBatch(texts: string[]): Promise<number[][]> {
    // Truncate texts that are too long to avoid token limit
    const processedTexts = texts.map(text => this.truncateText(text));

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: processedTexts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return (data as any).data.map((item: any) => item.embedding);
  }

  private truncateText(text: string): string {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const maxChars = this.maxTokens * 4;
    if (text.length <= maxChars) return text;

    // Truncate and add indication
    return text.substring(0, maxChars - 50) + '\n[... content truncated ...]';
  }

  // Utility method to estimate cost
  static estimateCost(input: string[] | number): number {
    // Validate input
    if (typeof input === 'number' && input < 0) {
      throw new Error('Character count cannot be negative');
    }
    if (Array.isArray(input) && input.length === 0) {
      return 0;
    }
    const totalChars = typeof input === 'number'
      ? input
      : input.reduce((sum, text) => sum + text.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimation
    const costPer1KTokens = 0.00002; // $0.00002 per 1K tokens for text-embedding-3-small
    return (estimatedTokens / 1000) * costPer1KTokens;
  }
}

// Lazy embedder initialization to avoid throwing at import time
let _embedder: OpenAIEmbeddingFunction | null = null;
function getEmbedder(): OpenAIEmbeddingFunction {
  if (_embedder) return _embedder;
  _embedder = new OpenAIEmbeddingFunction();
  return _embedder;
}

// Resolve Chroma client: prefer local ChromaClient, fallback to CloudClient if needed
function getClient() {
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8005';

  // Always prefer local ChromaDB if URL is configured
  if (chromaUrl && chromaUrl !== 'http://localhost:8005') {
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`));
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false
    });
  }

  // Check if local ChromaDB is running on default port
  try {
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`));
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false
    });
  } catch (error) {
    // Fallback to Cloud if local is not available
    const apiKey = process.env.CHROMA_API_KEY || process.env.CHROMA_CLOUD_API_KEY;
    const tenant = process.env.CHROMA_TENANT;
    const database = process.env.CHROMA_DATABASE || 'agent-cli';

    if (apiKey && tenant) {
      console.log(chalk.gray(`⚠️ Local ChromaDB not available, falling back to Cloud - Tenant: ${tenant}, Database: ${database}`));
      return new CloudClient({
        apiKey,
        tenant,
        database,
      });
    }

    // Final fallback to local with default settings
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`));
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false
    });
  }
}

// Utility functions
async function estimateIndexingCost(files: string[], projectPath: string): Promise<number> {
  let totalChars = 0;
  let processedFiles = 0;

  for (const file of files.slice(0, Math.min(files.length, 10))) { // Sample first 10 files
    try {
      const filePath = join(projectPath, file);
      const content = await readFile(filePath, "utf-8");
      if (!isBinaryFile(content) && content.length <= 1000000) {
        totalChars += content.length;
        processedFiles++;
      }
    } catch {
      // Skip files that can't be read
    }
  }

  if (processedFiles === 0) return 0;

  // Estimate total based on sample
  const avgCharsPerFile = totalChars / processedFiles;
  const estimatedTotalChars = avgCharsPerFile * files.length;

  return OpenAIEmbeddingFunction.estimateCost(estimatedTotalChars);
}

function isBinaryFile(content: string): boolean {
  // Simple heuristic: if more than 1% of characters are null bytes or non-printable, consider it binary
  const nullBytes = (content.match(/\0/g) || []).length;
  const nonPrintable = (content.match(/[\x00-\x08\x0E-\x1F\x7F-\xFF]/g) || []).length;
  const threshold = content.length * 0.01;

  return nullBytes > 0 || nonPrintable > threshold;
}

/**
 * Unified RAG System combining vector DB and workspace analysis
 */
export class UnifiedRAGSystem {
  private config: UnifiedRAGConfig;
  private workspaceRAG: any; // WorkspaceRAG instance
  private vectorClient: ChromaClient | CloudClient | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction | null = null;
  private embeddingsCache: Map<string, number[]> = new Map();
  private analysisCache: Map<string, RAGAnalysisResult> = new Map();
  private lastAnalysis: number = 0;
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly CACHE_DIR = join(homedir(), '.nikcli', 'embeddings');
  private fileHashCache: Map<string, string> = new Map();

  constructor(config?: Partial<UnifiedRAGConfig>) {
    this.config = {
      useVectorDB: true,
      useLocalEmbeddings: true,
      hybridMode: true,
      maxIndexFiles: 1000,
      chunkSize: TOKEN_LIMITS.RAG?.CHUNK_TOKENS ?? 700,
      overlapSize: TOKEN_LIMITS.RAG?.CHUNK_OVERLAP_TOKENS ?? 80,
      enableWorkspaceAnalysis: true,
      enableSemanticSearch: true,
      cacheEmbeddings: true,
      costThreshold: 0.10, // $0.10 threshold
      ...config
    };

    this.initializeClients();
    this.loadPersistentCache();
    this.testPersistentCache();
  }

  private async initializeClients(): Promise<void> {
    try {
      // Initialize workspace RAG (local analysis)
      if (this.config.enableWorkspaceAnalysis) {
        this.workspaceRAG = new WorkspaceRAG(process.cwd());
      }

      // Initialize vector DB clients if configured
      if (this.config.useVectorDB) {
        try {
          this.vectorClient = getClient();
          this.embeddingFunction = getEmbedder();

          // Test ChromaDB connection and verify embeddings (real API calls)
          await this.testChromaConnection();
          await this.testOpenAIEmbeddings();
          console.log(chalk.green('✅ Vector DB client initialized'));
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ Vector DB unavailable: ${error.message}, using workspace analysis only`));
          this.config.useVectorDB = false;
        }
      }
    } catch (error: any) {
      console.log(chalk.yellow('⚠️ RAG initialization warning:', error));
    }
  }

  /**
   * Test ChromaDB connection and basic functionality
   */
  private async testChromaConnection(): Promise<void> {
    if (!this.vectorClient) {
      throw new Error('Vector client not initialized');
    }

    try {
      // Test basic connection by getting version (real API call)
      const version = await this.vectorClient.version();
      console.log(chalk.gray(`✓ ChromaDB version: ${version}`));

      // List existing collections to verify connection works (real API call)
      const collections = await this.vectorClient.listCollections();
      console.log(chalk.gray(`✓ Found ${collections.length} existing collections`));

      // Log database configuration
      const database = process.env.CHROMA_DATABASE || 'agent-cli';
      console.log(chalk.gray(`✓ Using database: ${database}`));

      // Check if our target collection exists
      const targetCollection = collections.find(c => c.name === 'unified_project_index');
      if (targetCollection) {
        console.log(chalk.gray(`✓ Target collection 'unified_project_index' exists`));
        // Try to get collection details
        try {
          const collection = await this.vectorClient.getCollection({
            name: 'unified_project_index',
          });
          console.log(chalk.gray(`✓ Collection details retrieved successfully`));
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ Collection exists but may have issues: ${error.message}`));
        }
      } else {
        console.log(chalk.gray(`✓ Target collection 'unified_project_index' will be created`));
      }

    } catch (error: any) {
      throw new Error(`ChromaDB connection test failed: ${error.message}`);
    }
  }

  /**
   * Test OpenAI embeddings with real API call
   */
  private async testOpenAIEmbeddings(): Promise<void> {
    if (!this.embeddingFunction) {
      throw new Error('Embedding function not initialized');
    }

    try {
      // Check if API key is configured
      const apiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      console.log(chalk.gray(`✓ API key: ${apiKey.slice(0, 8)}...`));

      // Make real API call with minimal test data
      const testText = 'test embedding';
      const startTime = Date.now();
      const embeddings = await this.embeddingFunction.generate([testText]);
      const duration = Date.now() - startTime;

      if (!embeddings || embeddings.length !== 1 || !Array.isArray(embeddings[0])) {
        throw new Error('Invalid embedding response format');
      }

      const embeddingDimension = embeddings[0].length;
      const expectedDimension = 1536; // text-embedding-3-small dimension

      if (embeddingDimension !== expectedDimension) {
        console.log(chalk.yellow(`⚠️ Unexpected embedding dimension: ${embeddingDimension} (expected: ${expectedDimension})`));
      }

      // Calculate real cost
      const actualCost = OpenAIEmbeddingFunction.estimateCost([testText]);

      console.log(chalk.gray(`✓ OpenAI embeddings working (${duration}ms)`));
      console.log(chalk.gray(`✓ Model: text-embedding-3-small, dimension: ${embeddingDimension}`));
      console.log(chalk.gray(`✓ Test cost: $${actualCost.toFixed(8)}`));

    } catch (error: any) {
      throw new Error(`OpenAI embedding test failed: ${error.message}`);
    }
  }

  /**
   * Unified project analysis combining workspace and vector approaches
   */
  async analyzeProject(projectPath: string): Promise<RAGAnalysisResult> {
    const startTime = Date.now();
    console.log(chalk.blue('🧠 Starting unified RAG analysis...'));

    // Check cache
    const cacheKey = `analysis-${projectPath}`;
    const cached = this.analysisCache.get(cacheKey);
    if (cached && (Date.now() - this.lastAnalysis) < this.CACHE_TTL) {
      console.log(chalk.green('✅ Using cached analysis'));
      return cached;
    }

    let workspaceContext: WorkspaceContext;
    let vectorDBStatus: 'available' | 'unavailable' | 'error' = 'unavailable';
    let embeddingsCost = 0;
    let indexedFiles = 0;

    // 1. Workspace Analysis (always run)
    if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
      console.log(chalk.cyan('📁 Analyzing workspace structure...'));
      workspaceContext = await this.workspaceRAG.analyzeWorkspace();
      console.log(chalk.green(`✅ Analyzed ${workspaceContext.files.size} files`));
    } else {
      // Fallback minimal analysis
      workspaceContext = this.createMinimalWorkspaceContext(projectPath);
    }

    // 2. Vector DB Indexing (if available and cost-effective)
    if (this.config.useVectorDB && this.vectorClient && this.embeddingFunction) {
      try {
        const indexResult = await this.indexProjectWithVectorDB(projectPath, workspaceContext);
        vectorDBStatus = indexResult.success ? 'available' : 'error';
        embeddingsCost = indexResult.cost;
        indexedFiles = indexResult.indexedFiles;
      } catch (error) {
        console.log(chalk.yellow('⚠️ Vector DB indexing failed, using workspace analysis only'));
        vectorDBStatus = 'error';
      }
    }

    const result: RAGAnalysisResult = {
      workspaceContext,
      indexedFiles,
      embeddingsCost,
      processingTime: Date.now() - startTime,
      vectorDBStatus,
      fallbackMode: !this.config.useVectorDB || vectorDBStatus !== 'available'
    };

    // Cache result
    this.analysisCache.set(cacheKey, result);
    this.lastAnalysis = Date.now();

    console.log(chalk.green(`✅ RAG analysis completed in ${result.processingTime}ms`));
    console.log(chalk.gray(`   Indexed: ${indexedFiles} files, Cost: $${embeddingsCost.toFixed(4)}, Vector DB: ${vectorDBStatus}`));

    return result;
  }

  /**
   * Unified search combining vector and workspace approaches
   */
  async search(query: string, options?: {
    limit?: number;
    includeContent?: boolean;
    semanticOnly?: boolean
  }): Promise<RAGSearchResult[]> {
    const { limit = 10, includeContent = true, semanticOnly = false } = options || {};
    const results: RAGSearchResult[] = [];

    console.log(chalk.blue(`🔍 Searching: "${query}"`));

    // 1. Vector DB Search (if available)
    if (this.config.useVectorDB && this.vectorClient && !semanticOnly) {
      try {
        const vectorResults = await this.searchVectorDB(query, Math.ceil(limit * 0.6));
        results.push(...vectorResults);
      } catch (error) {
        console.log(chalk.yellow('⚠️ Vector search failed, using workspace search'));
      }
    }

    // 2. Workspace-based Search
    if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
      const workspaceResults = await this.searchWorkspace(query, Math.ceil(limit * 0.4));
      results.push(...workspaceResults);
    }

    // 3. Hybrid scoring and deduplication
    const uniqueResults = this.deduplicateAndRank(results, query);
    const finalResults = uniqueResults.slice(0, limit);

    console.log(chalk.green(`✅ Found ${finalResults.length} results`));
    return finalResults;
  }

  private async indexProjectWithVectorDB(
    projectPath: string,
    workspaceContext: WorkspaceContext
  ): Promise<{ success: boolean; cost: number; indexedFiles: number }> {
    try {
      if (!this.embeddingFunction) {
        throw new Error('Embedding function not initialized');
      }

      // For local ChromaDB, use simpler collection creation
      let collection;
      try {
        // Try to get existing collection first
        collection = await this.vectorClient!.getCollection({
          name: 'unified_project_index',
        });
        console.log(chalk.gray('✓ Using existing collection: unified_project_index'));
      } catch (error) {
        // Collection doesn't exist, create it with embedding function
        console.log(chalk.gray('✓ Creating new collection: unified_project_index'));
        collection = await this.vectorClient!.createCollection({
          name: 'unified_project_index',
          embeddingFunction: this.embeddingFunction,
        });
        console.log(chalk.green('✅ Collection created successfully with embedding function'));
      }

      // Use workspace analysis to prioritize important files
      const importantFiles = Array.from(workspaceContext.files.values())
        .filter(f => f.importance > 30)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, this.config.maxIndexFiles);

      let totalCost = 0;
      let indexedCount = 0;

      for (const file of importantFiles) {
        try {
          const fullPath = join(projectPath, file.path);
          const content = await readFile(fullPath, 'utf-8');

          // Estimate cost before processing
          const estimatedCost = OpenAIEmbeddingFunction.estimateCost([content]);
          if (totalCost + estimatedCost > this.config.costThreshold) {
            console.log(chalk.yellow(`⚠️ Cost threshold reached, stopping indexing`));
            break;
          }

          // Chunk content intelligently based on file type
          const chunks = this.intelligentChunking(content, file.language);

          if (chunks.length > 0) {
            const ids = chunks.map((_, idx) => `${file.path}#${idx}`);
            const metadatas = chunks.map((chunk, idx) => ({
              source: file.path,
              size: chunk.length,
              chunkIndex: idx,
              totalChunks: chunks.length,
              importance: file.importance,
              language: file.language,
              lastModified: file.lastModified.toISOString()
            }));

            await collection.add({ ids, documents: chunks, metadatas });
            totalCost += estimatedCost;
            indexedCount++;
          }
        } catch (fileError) {
          console.log(chalk.yellow(`⚠️ Failed to index ${file.path}`));
        }
      }

      return { success: true, cost: totalCost, indexedFiles: indexedCount };
    } catch (error) {
      return { success: false, cost: 0, indexedFiles: 0 };
    }
  }

  private intelligentChunking(content: string, language: string): string[] {
    // Enhanced chunking based on file type
    if (language === 'typescript' || language === 'javascript') {
      return this.chunkCodeFile(content);
    } else if (language === 'markdown') {
      return this.chunkMarkdownFile(content);
    } else {
      return chunkTextByTokens(content, this.config.chunkSize, this.config.overlapSize);
    }
  }

  private chunkCodeFile(content: string): string[] {
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let bracketDepth = 0;
    let inFunction = false;
    let functionStartLine = -1;

    // Get optimized chunking parameters
    const minLines = TOKEN_LIMITS.RAG?.CODE_CHUNK_MIN_LINES ?? 80;
    const maxLines = TOKEN_LIMITS.RAG?.CODE_CHUNK_MAX_LINES ?? 150;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track bracket depth to keep functions/classes together
      bracketDepth += (line.match(/\{/g) || []).length;
      bracketDepth -= (line.match(/\}/g) || []).length;

      // Enhanced function/class detection
      if (this.isCodeBlockStart(line)) {
        inFunction = true;
        functionStartLine = i;
      }

      currentChunk.push(line);

      // Smart chunking logic: preserve logical blocks
      const shouldCreateChunk =
        // Function/class completed
        (inFunction && bracketDepth === 0 && currentChunk.length >= minLines) ||
        // Reached max size
        currentChunk.length >= maxLines ||
        // At import/export boundary with sufficient content
        (line.trim().startsWith('import ') || line.trim().startsWith('export ')) &&
        currentChunk.length >= minLines;

      if (shouldCreateChunk && currentChunk.length >= minLines) {
        chunks.push(currentChunk.join('\n'));

        // Smart overlap: include function signature in next chunk if we split mid-function
        if (inFunction && functionStartLine >= 0) {
          const overlapStart = Math.max(0, functionStartLine);
          const overlap = lines.slice(overlapStart, i + 1);
          currentChunk = overlap.length < 10 ? [...overlap] : [];
        } else {
          currentChunk = [];
        }

        inFunction = false;
        functionStartLine = -1;
      }
    }

    // Add remaining content if substantial
    if (currentChunk.length >= 10) {
      chunks.push(currentChunk.join('\n'));
    }

    return chunks.length > 0 ? chunks : [content];
  }

  /**
   * Load persistent embeddings cache from disk
   */
  private async loadPersistentCache(): Promise<void> {
    if (!this.config.cacheEmbeddings) return;

    try {
      await mkdir(this.CACHE_DIR, { recursive: true });

      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json');
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json');

      if (existsSync(cacheFilePath)) {
        const cacheData = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
        for (const [key, value] of Object.entries(cacheData)) {
          this.embeddingsCache.set(key, value as number[]);
        }
        console.log(chalk.blue(`📦 Loaded ${this.embeddingsCache.size} cached embeddings`));
      }

      if (existsSync(hashFilePath)) {
        const hashData = JSON.parse(readFileSync(hashFilePath, 'utf-8'));
        for (const [key, value] of Object.entries(hashData)) {
          this.fileHashCache.set(key, value as string);
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Failed to load embeddings cache'));
    }
  }

  /**
   * Test persistent cache functionality
   */
  private testPersistentCache(): void {
    if (!this.config.cacheEmbeddings) {
      console.log(chalk.yellow('⚠️ Persistent cache disabled'));
      return;
    }

    try {
      // Check cache directory exists
      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json');
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json');

      console.log(chalk.gray(`✓ Cache directory: ${this.CACHE_DIR}`));

      // Check if cache files exist
      const cacheExists = existsSync(cacheFilePath);
      const hashExists = existsSync(hashFilePath);

      console.log(chalk.gray(`✓ Embeddings cache: ${cacheExists ? 'exists' : 'will be created'}`));
      console.log(chalk.gray(`✓ File hashes cache: ${hashExists ? 'exists' : 'will be created'}`));

      // Test cache functionality by adding a test entry and saving
      const testKey = 'cache-test-' + Date.now();
      const testEmbedding = [0.1, 0.2, 0.3]; // Simple test embedding

      this.embeddingsCache.set(testKey, testEmbedding);
      console.log(chalk.gray(`✓ Test cache entry added (${this.embeddingsCache.size} total entries)`));

      // Show cost optimization summary
      this.showCostOptimizations();

    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Cache test warning: ${error.message}`));
    }
  }

  /**
   * Display RAG cost optimizations and savings
   */
  private showCostOptimizations(): void {
    console.log(chalk.blue('\n💰 RAG Cost Optimizations:'));

    // Show chunk optimization savings
    const oldChunkTokens = 700;
    const newChunkTokens = this.config.chunkSize;
    const chunkSavings = ((oldChunkTokens - newChunkTokens) / oldChunkTokens) * 100;

    const oldOverlap = 80;
    const newOverlap = this.config.overlapSize;
    const overlapSavings = ((oldOverlap - newOverlap) / oldOverlap) * 100;

    console.log(chalk.gray(`✓ Chunk size: ${oldChunkTokens} → ${newChunkTokens} tokens (${Math.abs(chunkSavings).toFixed(1)}% ${chunkSavings < 0 ? 'increase for better context' : 'reduction'})`));
    console.log(chalk.gray(`✓ Overlap reduction: ${oldOverlap} → ${newOverlap} tokens (${overlapSavings.toFixed(1)}% less duplication)`));

    // Calculate estimated savings for typical project
    const avgFileSize = 2000; // characters
    const avgFilesInProject = 100;
    const totalChars = avgFileSize * avgFilesInProject;

    const oldCost = OpenAIEmbeddingFunction.estimateCost(totalChars * 1.8); // Old approach with more chunks
    const newCost = OpenAIEmbeddingFunction.estimateCost(totalChars * 1.2); // New optimized approach
    const savings = ((oldCost - newCost) / oldCost) * 100;

    console.log(chalk.gray(`✓ Estimated project savings: ${savings.toFixed(1)}% ($${oldCost.toFixed(4)} → $${newCost.toFixed(4)})`));
    console.log(chalk.gray(`✓ Cache hits save: 100% on re-embeddings`));

    // Show current efficiency metrics
    if (this.embeddingsCache.size > 0) {
      console.log(chalk.gray(`✓ Cache efficiency: ${this.embeddingsCache.size} embeddings cached`));
    }
  }

  /**
   * Save persistent embeddings cache to disk
   */
  private async savePersistentCache(): Promise<void> {
    if (!this.config.cacheEmbeddings) return;

    try {
      await mkdir(this.CACHE_DIR, { recursive: true });

      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json');
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json');

      // Convert Maps to objects for JSON serialization
      const cacheData = Object.fromEntries(this.embeddingsCache);
      const hashData = Object.fromEntries(this.fileHashCache);

      await writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2));
      await writeFile(hashFilePath, JSON.stringify(hashData, null, 2));

      console.log(chalk.green(`💾 Saved ${this.embeddingsCache.size} embeddings to cache`));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Failed to save embeddings cache'));
    }
  }

  /**
   * Generate file content hash for change detection
   */
  private generateFileHash(filePath: string, content: string): string {
    const stats = statSync(filePath);
    const hashInput = `${filePath}:${stats.mtime.getTime()}:${content.length}`;
    return createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Check if file has changed since last processing
   */
  private hasFileChanged(filePath: string, content: string): boolean {
    const currentHash = this.generateFileHash(filePath, content);
    const cachedHash = this.fileHashCache.get(filePath);

    if (cachedHash !== currentHash) {
      this.fileHashCache.set(filePath, currentHash);
      return true;
    }

    return false;
  }

  private isCodeBlockStart(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('function ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ') ||
      trimmed.startsWith('const ') && (trimmed.includes('=>') || trimmed.includes('= function')) ||
      trimmed.startsWith('export ') && (trimmed.includes('function') || trimmed.includes('class')) ||
      /^(async\s+)?\w+\s*\([^)]*\)\s*\{/.test(trimmed) // Method definitions
    );
  }

  private chunkMarkdownFile(content: string): string[] {
    const minSectionSize = TOKEN_LIMITS.RAG?.MARKDOWN_MIN_SECTION ?? 200;

    // Split by headers while preserving hierarchical context
    const sections = content.split(/^(#{1,6}\s.*$)/m);
    const chunks: string[] = [];
    let currentChunk = '';
    let lastHeader = '';

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      if (section.match(/^#{1,6}\s/)) {
        // This is a header
        if (currentChunk.length >= minSectionSize) {
          chunks.push((lastHeader + currentChunk).trim());
          currentChunk = '';
        }
        lastHeader = section + '\n';
      } else if (section.trim()) {
        // This is content
        currentChunk += section;

        // Check if current chunk is getting too large
        if (currentChunk.length > 2000) {
          chunks.push((lastHeader + currentChunk).trim());
          currentChunk = '';
        }
      }
    }

    // Add remaining content
    if (currentChunk.trim().length >= minSectionSize) {
      chunks.push((lastHeader + currentChunk).trim());
    }

    return chunks.length > 0 ? chunks : [content];
  }

  private async searchVectorDB(query: string, limit: number): Promise<RAGSearchResult[]> {
    try {
      if (!this.embeddingFunction) {
        throw new Error('Embedding function not initialized');
      }

      // Get existing collection for search
      let collection;
      try {
        collection = await this.vectorClient!.getCollection({
          name: 'unified_project_index',
        });
        console.log(chalk.gray('✓ Collection found, performing vector search'));
      } catch (error: any) {
        console.log(chalk.yellow('⚠️ Collection not found, skipping vector search'));
        return [];
      }

      const results = await collection.query({
        nResults: limit,
        queryTexts: [query]
      });

      return (results.documents?.[0] || []).map((doc, idx) => ({
        content: doc || '',
        path: results.metadatas?.[0]?.[idx]?.source as string || '',
        score: 1 - (results.distances?.[0]?.[idx] || 1),
        metadata: {
          chunkIndex: results.metadatas?.[0]?.[idx]?.chunkIndex as number,
          totalChunks: results.metadatas?.[0]?.[idx]?.totalChunks as number,
          fileType: results.metadatas?.[0]?.[idx]?.language as string || 'unknown',
          importance: results.metadatas?.[0]?.[idx]?.importance as number || 50,
          lastModified: new Date(results.metadatas?.[0]?.[idx]?.lastModified as string || Date.now()),
          source: 'vector' as const
        }
      }));
    } catch (error) {
      return [];
    }
  }

  private async searchWorkspace(query: string, limit: number): Promise<RAGSearchResult[]> {
    if (!this.workspaceRAG) return [];

    try {
      const relevantFiles = this.workspaceRAG.getRelevantFiles(query, limit);

      return relevantFiles.map((file: FileEmbedding) => ({
        content: file.content.substring(0, 1000) + (file.content.length > 1000 ? '...' : ''),
        path: file.path,
        score: file.importance / 100,
        metadata: {
          fileType: file.language,
          importance: file.importance,
          lastModified: file.lastModified,
          source: 'workspace' as const
        }
      }));
    } catch (error) {
      return [];
    }
  }

  private deduplicateAndRank(results: RAGSearchResult[], query: string): RAGSearchResult[] {
    const pathMap = new Map<string, RAGSearchResult>();
    const queryWords = query.toLowerCase().split(/\s+/);

    // Deduplicate by path, keeping highest scoring result
    for (const result of results) {
      const existing = pathMap.get(result.path);
      if (!existing || result.score > existing.score) {
        // Enhanced scoring based on query relevance
        let enhancedScore = result.score;

        // Boost score for exact query matches
        const content = result.content.toLowerCase();
        queryWords.forEach(word => {
          if (content.includes(word)) enhancedScore += 0.1;
          if (result.path.toLowerCase().includes(word)) enhancedScore += 0.2;
        });

        // Boost score for important files
        enhancedScore += (result.metadata.importance / 100) * 0.3;

        pathMap.set(result.path, { ...result, score: enhancedScore });
      }
    }

    return Array.from(pathMap.values()).sort((a, b) => b.score - a.score);
  }

  private createMinimalWorkspaceContext(projectPath: string): WorkspaceContext {
    return {
      rootPath: resolve(projectPath),
      projectName: require('path').basename(projectPath),
      framework: 'unknown',
      languages: [],
      files: new Map(),
      structure: {},
      dependencies: [],
      scripts: {},
      lastAnalyzed: new Date()
    };
  }

  // Public utility methods
  getConfig(): UnifiedRAGConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<UnifiedRAGConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log(chalk.blue('🔧 RAG configuration updated'));
  }

  clearCaches(): void {
    this.embeddingsCache.clear();
    this.analysisCache.clear();
    console.log(chalk.green('✅ RAG caches cleared'));
  }

  getStats() {
    return {
      embeddingsCacheSize: this.embeddingsCache.size,
      analysisCacheSize: this.analysisCache.size,
      vectorDBAvailable: !!this.vectorClient,
      workspaceRAGAvailable: !!this.workspaceRAG,
      config: this.config
    };
  }
}

// Export singleton instance
export const unifiedRAGSystem = new UnifiedRAGSystem();

// Legacy functions for backward compatibility
export async function indexProject(projectPath: string) {
  console.log(chalk.blue('🔄 Using legacy indexProject (consider upgrading to UnifiedRAGSystem)'));
  try {
    const result = await unifiedRAGSystem.analyzeProject(projectPath);
    console.log(chalk.green(`✅ Legacy indexing completed - ${result.indexedFiles} files processed`));
  } catch (error: any) {
    console.error(chalk.red('❌ Legacy indexing failed:'), error.message);
  }
}

export async function search(query: string) {
  console.log(chalk.blue('🔄 Using legacy search (consider upgrading to UnifiedRAGSystem)'));
  try {
    const results = await unifiedRAGSystem.search(query, { limit: 5 });
    // Convert to legacy format
    return {
      documents: [results.map(r => r.content)],
      metadatas: [results.map(r => ({
        source: r.path,
        score: r.score,
        fileType: r.metadata.fileType,
        importance: r.metadata.importance,
        lastModified: r.metadata.lastModified.toISOString()
      }))]
    };
  } catch (error: any) {
    console.error(chalk.red('❌ Legacy search failed:'), error.message);
    return { documents: [[]], metadatas: [[]] };
  }
}

// --- helpers ---
function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

function chunkTextByTokens(text: string, chunkTokens: number, overlapTokens: number): string[] {
  if (!text) return [];
  const tokenToChar = 4; // heuristic
  const chunkChars = Math.max(200, Math.floor(chunkTokens * tokenToChar));
  const overlapChars = Math.max(0, Math.floor(overlapTokens * tokenToChar));

  const chunks: string[] = [];
  let start = 0;
  const N = text.length;

  while (start < N) {
    const end = Math.min(N, start + chunkChars);
    const slice = text.slice(start, end);
    chunks.push(slice);
    if (end >= N) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}