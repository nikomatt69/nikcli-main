import chalk from 'chalk'
import { enhancedSupabaseProvider, type SupabaseDocument } from '../providers/supabase/enhanced-supabase-provider'
import { simpleConfigManager } from './config-manager'
import type { DocumentationEntry } from './documentation-library'

/**
 * Documentation Database Manager
 * Integrates documentation library with Supabase for persistent storage and AI access
 */
export class DocumentationDatabase {
  private useSupabase: boolean = false
  private initialized: boolean = false
  private documentTableName: string = 'documentation'

  constructor() {
    this.documentTableName = simpleConfigManager.getSupabaseConfig().tables.documents
    this.checkSupabaseAvailability()
  }

  /**
   * Check if Supabase is available and healthy
   */
  private async checkSupabaseAvailability(): Promise<void> {
    try {
      const health = await enhancedSupabaseProvider.healthCheck()
      this.useSupabase = health.connected && health.features.database
      this.initialized = true

      if (this.useSupabase) {
        console.log(chalk.green('✓ Documentation database connected (Supabase)'))
      } else {
        console.log(chalk.yellow('⚠️ Documentation database using local storage only'))
      }
    } catch (error) {
      this.useSupabase = false
      this.initialized = true
      console.log(chalk.yellow('⚠️ Documentation database using local storage only'))
    }
  }

  /**
   * Save documentation to database
   */
  async saveDocumentation(entry: DocumentationEntry): Promise<boolean> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      // Local storage only - handled by DocumentationLibrary
      return true
    }

    try {
      // Convert DocumentationEntry to SupabaseDocument format
      const supabaseDoc: Partial<SupabaseDocument> = {
        id: entry.id,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: entry.tags,
        language: entry.metadata.language,
        word_count: entry.metadata.wordCount,
        access_count: entry.accessCount,
        popularity_score: entry.relevance,
        is_public: true, // Default to public for shared docs
        created_at: entry.timestamp.toISOString(),
        updated_at: entry.lastAccessed.toISOString(),
      }

      // Use Supabase's client directly (we need to add this method to the provider)
      const client = (enhancedSupabaseProvider as any).client
      if (client) {
        const { error } = await client.from(this.documentTableName).upsert(supabaseDoc)

        if (error) {
          // If table doesn't exist, disable Supabase saves to prevent spam
          if (error.message.includes('Could not find the table')) {
            this.useSupabase = false
          }
          return false
        }

        return true
      }

      return false
    } catch (error: any) {
      return false
    }
  }

  /**
   * Save multiple documentation entries (batch)
   */
  async saveDocumentationBatch(entries: DocumentationEntry[]): Promise<number> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase || entries.length === 0) {
      return 0
    }

    try {
      const supabaseDocs = entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: entry.tags,
        language: entry.metadata.language,
        word_count: entry.metadata.wordCount,
        access_count: entry.accessCount,
        popularity_score: entry.relevance,
        is_public: true,
        created_at: entry.timestamp.toISOString(),
        updated_at: entry.lastAccessed.toISOString(),
      }))

      const client = (enhancedSupabaseProvider as any).client
      if (client) {
        const { data, error } = await client.from(this.documentTableName).upsert(supabaseDocs)

        if (error) {
          // If table doesn't exist, disable Supabase saves to prevent spam
          if (error.message.includes('Could not find the table')) {
            this.useSupabase = false
          }
          return 0
        }

        const count = Array.isArray(data) ? data.length : entries.length
        return count
      }

      return 0
    } catch (error: any) {
      return 0
    }
  }

  /**
   * Search documentation in database
   */
  async searchDocumentation(
    query: string,
    options?: {
      category?: string
      language?: string
      limit?: number
      threshold?: number
    }
  ): Promise<DocumentationEntry[]> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      return []
    }

    try {
      const results = await enhancedSupabaseProvider.vectorSearchDocuments(query, options)

      // Convert SupabaseDocument to DocumentationEntry
      return results.map((doc) => this.convertToDocumentationEntry(doc))
    } catch (error: any) {
      console.log(chalk.red(`✖ Database search error: ${error.message}`))
      return []
    }
  }

  /**
   * Get documentation by ID
   */
  async getDocumentation(id: string): Promise<DocumentationEntry | null> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      return null
    }

    try {
      const client = (enhancedSupabaseProvider as any).client
      if (!client) return null

      const { data, error } = await client.from(this.documentTableName).select('*').eq('id', id).single()

      if (error || !data) {
        return null
      }

      return this.convertToDocumentationEntry(data)
    } catch (error: any) {
      console.log(chalk.red(`✖ Database get error: ${error.message}`))
      return null
    }
  }

  /**
   * Get all documentation by category
   */
  async getDocumentationByCategory(category: string, limit: number = 50): Promise<DocumentationEntry[]> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      return []
    }

    try {
      const client = (enhancedSupabaseProvider as any).client
      if (!client) return []

      const { data, error } = await client
        .from(this.documentTableName)
        .select('*')
        .eq('category', category)
        .order('popularity_score', { ascending: false })
        .limit(limit)

      if (error || !data) {
        return []
      }

      return data.map((doc: any) => this.convertToDocumentationEntry(doc))
    } catch (error: any) {
      console.log(chalk.red(`✖ Database query error: ${error.message}`))
      return []
    }
  }

  /**
   * Get documentation statistics
   */
  async getStatistics(): Promise<{
    totalDocs: number
    categories: string[]
    languages: string[]
    totalWords: number
  }> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      return {
        totalDocs: 0,
        categories: [],
        languages: [],
        totalWords: 0,
      }
    }

    try {
      const client = (enhancedSupabaseProvider as any).client
      if (!client) {
        return { totalDocs: 0, categories: [], languages: [], totalWords: 0 }
      }

      const { data, error } = await client.from(this.documentTableName).select('category, language, word_count')

      if (error || !data) {
        return { totalDocs: 0, categories: [], languages: [], totalWords: 0 }
      }

      const categories = [...new Set(data.map((doc: any) => doc.category))]
      const languages = [...new Set(data.map((doc: any) => doc.language))]
      const totalWords = data.reduce((sum: number, doc: any) => sum + (doc.word_count || 0), 0)

      return {
        totalDocs: data.length,
        categories: categories as string[],
        languages: languages as string[],
        totalWords,
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ Statistics error: ${error.message}`))
      return { totalDocs: 0, categories: [], languages: [], totalWords: 0 }
    }
  }

  /**
   * Delete documentation by ID
   */
  async deleteDocumentation(id: string): Promise<boolean> {
    if (!this.initialized) {
      await this.checkSupabaseAvailability()
    }

    if (!this.useSupabase) {
      return false
    }

    try {
      const client = (enhancedSupabaseProvider as any).client
      if (!client) return false

      const { error } = await client.from(this.documentTableName).delete().eq('id', id)

      if (error) {
        console.log(chalk.yellow(`⚠️ Delete failed: ${error.message}`))
        return false
      }

      console.log(chalk.green(`✓ Deleted documentation: ${id}`))
      return true
    } catch (error: any) {
      console.log(chalk.red(`✖ Delete error: ${error.message}`))
      return false
    }
  }

  /**
   * Check if database is available
   */
  isDatabaseAvailable(): boolean {
    return this.useSupabase
  }

  /**
   * Convert SupabaseDocument to DocumentationEntry
   */
  private convertToDocumentationEntry(doc: SupabaseDocument): DocumentationEntry {
    return {
      id: doc.id,
      url: '', // URL not stored in SupabaseDocument, would need to be added
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags || [],
      timestamp: new Date(doc.created_at),
      lastAccessed: new Date(doc.updated_at),
      accessCount: doc.access_count || 0,
      relevance: doc.popularity_score || 1.0,
      metadata: {
        wordCount: doc.word_count || 0,
        language: doc.language || 'unknown',
        source: 'database',
        extractedAt: new Date(doc.created_at),
      },
    }
  }
}

// Singleton instance
export const documentationDatabase = new DocumentationDatabase()
