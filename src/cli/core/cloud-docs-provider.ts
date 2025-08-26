import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { DocumentationEntry } from './documentation-library';
import { simpleConfigManager } from './config-manager';

export interface SharedDocEntry {
  id: string;
  title: string;
  url: string;
  content: string;
  category: string;
  tags: string[];
  language: string;
  word_count: number;
  contributor_id?: string;
  created_at: string;
  updated_at: string;
  access_count: number;
  popularity_score: number;
}

export interface DocsLibrary {
  id: string;
  name: string;
  description: string;
  doc_ids: string[];
  creator_id?: string;
  installs_count: number;
  created_at: string;
}

export interface CloudDocsConfig {
  enabled?: boolean;
  provider?: 'supabase' | 'firebase' | 'github';
  apiUrl?: string;
  apiKey?: string;
  autoSync?: boolean;
  contributionMode?: boolean;
  maxContextSize?: number;
  autoLoadForAgents?: boolean;
  smartSuggestions?: boolean;
}

export class CloudDocsProvider {
  private supabase: SupabaseClient | null = null;
  private config: CloudDocsConfig;
  private cacheDir: string;
  private sharedIndexFile: string;
  private isInitialized = false;

  constructor(config: CloudDocsConfig, cacheDir: string = './.nikcli') {
    this.config = {
      enabled: true,
      provider: 'supabase',
      autoSync: true,
      contributionMode: true,
      maxContextSize: 50000,
      autoLoadForAgents: true,
      smartSuggestions: true,
      ...config
    };

    // Carica automaticamente le API keys dal config manager se non fornite
    if (!this.config.apiUrl || !this.config.apiKey) {
      const cloudKeys = simpleConfigManager.getCloudDocsApiKeys();
      if (!this.config.apiUrl && cloudKeys.apiUrl) {
        this.config.apiUrl = cloudKeys.apiUrl;
      }
      if (!this.config.apiKey && cloudKeys.apiKey) {
        this.config.apiKey = cloudKeys.apiKey;
      }
    }

    this.cacheDir = cacheDir;
    this.sharedIndexFile = path.join(cacheDir, 'shared-docs-index.json');

    // Non chiamare async nel costruttore - inizializzazione lazy
  }

  /**
   * Inizializza il provider se non già fatto
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.config.enabled && this.config.provider === 'supabase') {
      await this.initializeSupabase();
    }
  }

  private async initializeSupabase(): Promise<void> {
    try {
      if (!this.config.apiUrl || !this.config.apiKey) {
        console.log(chalk.yellow('⚠️ Supabase credentials not configured. Cloud docs disabled.'));
        console.log(chalk.gray('Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables'));
        return;
      }

      this.supabase = createClient(this.config.apiUrl, this.config.apiKey);
      this.isInitialized = true;
      console.log(chalk.green('✅ Connected to Supabase docs cloud'));
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize Supabase: ${error.message}`));
    }
  }


  /**
   * Sincronizza libreria locale con cloud
   */
  async sync(): Promise<{ downloaded: number; uploaded: number }> {
    await this.ensureInitialized();
    
    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized');
    }

    console.log(chalk.blue('🔄 Synchronizing with cloud library...'));

    try {
      // Download nuovi docs dal cloud
      const { data: cloudDocs, error: fetchError } = await this.supabase
        .from('shared_docs')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      let downloaded = 0;
      let uploaded = 0;

      // Salva indice dei docs condivisi
      if (cloudDocs && cloudDocs.length > 0) {
        await this.saveSharedIndex(cloudDocs);
        downloaded = cloudDocs.length;
        console.log(chalk.green(`📥 Downloaded ${downloaded} shared documents`));
      }

      // TODO: Upload docs locali se contributionMode è abilitato
      if (this.config.contributionMode) {
        // Implementazione per upload docs locali
        console.log(chalk.gray('📤 Contribution mode enabled (upload not yet implemented)'));
      }

      console.log(chalk.green(`✅ Sync completed: ${downloaded} downloaded, ${uploaded} uploaded`));
      return { downloaded, uploaded };

    } catch (error: any) {
      console.error(chalk.red(`❌ Sync failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Pubblica un documento nella libreria condivisa
   */
  async publishDoc(doc: DocumentationEntry): Promise<SharedDocEntry> {
    await this.ensureInitialized();
    
    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized');
    }

    console.log(chalk.blue(`📤 Publishing: ${doc.title}`));

    try {
      const sharedDoc: Partial<SharedDocEntry> = {
        title: doc.title,
        url: doc.url,
        content: doc.content.substring(0, 50000), // Limit content size
        category: doc.category,
        tags: doc.tags,
        language: doc.metadata.language,
        word_count: doc.metadata.wordCount,
        access_count: 0,
        popularity_score: 0
      };

      const { data, error } = await this.supabase
        .from('shared_docs')
        .insert([sharedDoc])
        .select()
        .single();

      if (error) throw error;

      console.log(chalk.green(`✅ Published: ${data.title}`));
      return data as SharedDocEntry;

    } catch (error: any) {
      console.error(chalk.red(`❌ Publish failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Cerca nella libreria condivisa
   */
  async searchShared(query: string, category?: string, limit: number = 10): Promise<SharedDocEntry[]> {
    await this.ensureInitialized();
    
    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized');
    }

    try {
      let queryBuilder = this.supabase
        .from('shared_docs')
        .select('*');

      // Filtro per categoria
      if (category) {
        queryBuilder = queryBuilder.eq('category', category);
      }

      // Search in title and content (basic text search)
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%, content.ilike.%${query}%`);

      const { data, error } = await queryBuilder
        .order('popularity_score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];

    } catch (error: any) {
      console.error(chalk.red(`❌ Search failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Ottieni librerie popolari
   */
  async getPopularLibraries(limit: number = 20): Promise<DocsLibrary[]> {
    await this.ensureInitialized();
    
    if (!this.isInitialized || !this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('docs_libraries')
        .select('*')
        .order('installs_count', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];

    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to get popular libraries: ${error.message}`));
      return [];
    }
  }

  /**
   * Installa una libreria di documenti
   */
  async installLibrary(libraryName: string): Promise<SharedDocEntry[]> {
    await this.ensureInitialized();
    
    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized');
    }

    console.log(chalk.blue(`📦 Installing library: ${libraryName}`));

    try {
      // Cerca la libreria per nome
      const { data: library, error: libError } = await this.supabase
        .from('docs_libraries')
        .select('*')
        .eq('name', libraryName)
        .single();

      if (libError) throw libError;
      if (!library) throw new Error(`Library '${libraryName}' not found`);

      // Ottieni i documenti della libreria
      const { data: docs, error: docsError } = await this.supabase
        .from('shared_docs')
        .select('*')
        .in('id', library.doc_ids);

      if (docsError) throw docsError;

      // Incrementa il contatore di installazioni
      await this.supabase
        .from('docs_libraries')
        .update({ installs_count: library.installs_count + 1 })
        .eq('id', library.id);

      console.log(chalk.green(`✅ Installed ${docs?.length || 0} documents from '${libraryName}'`));
      return docs || [];

    } catch (error: any) {
      console.error(chalk.red(`❌ Install failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Salva indice docs condivisi in cache locale
   */
  private async saveSharedIndex(docs: SharedDocEntry[]): Promise<void> {
    try {
      const index = {
        lastSync: new Date().toISOString(),
        totalDocs: docs.length,
        docs: docs.map(doc => ({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          tags: doc.tags,
          language: doc.language,
          word_count: doc.word_count,
          popularity_score: doc.popularity_score,
          url: doc.url
        }))
      };

      await fs.writeFile(this.sharedIndexFile, JSON.stringify(index, null, 2));
      console.log(chalk.gray(`💾 Cached ${docs.length} shared docs locally`));
    } catch (error) {
      console.error('Failed to save shared docs index:', error);
    }
  }

  /**
   * Carica indice docs condivisi dalla cache
   */
  async loadSharedIndex(): Promise<any> {
    try {
      const data = await fs.readFile(this.sharedIndexFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return { lastSync: null, totalDocs: 0, docs: [] };
    }
  }

  /**
   * Verifica se è inizializzato
   */
  isReady(): boolean {
    return this.isInitialized && this.supabase !== null;
  }

  /**
   * Ottieni statistiche cloud
   */
  async getCloudStats(): Promise<{
    totalSharedDocs: number;
    totalLibraries: number;
    lastSync?: string;
  }> {
    const index = await this.loadSharedIndex();

    return {
      totalSharedDocs: index.totalDocs,
      totalLibraries: 0, // TODO: implement
      lastSync: index.lastSync
    };
  }
}

// Singleton instance
let cloudDocsProvider: CloudDocsProvider | null = null;

export function createCloudDocsProvider(config: CloudDocsConfig): CloudDocsProvider {
  if (!cloudDocsProvider) {
    cloudDocsProvider = new CloudDocsProvider(config);
  }
  return cloudDocsProvider;
}

export function getCloudDocsProvider(): CloudDocsProvider | null {
  return cloudDocsProvider;
}