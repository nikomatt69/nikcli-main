import { CoreTool } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';
import chalk from 'chalk';
import { docLibrary } from './documentation-library';

export const documentationSearchTool: CoreTool = tool({
  description: 'Search documentation library and web for technical information, with automatic caching',
  parameters: z.object({
    query: z.string().describe('Search query for documentation'),
    category: z.string().optional().describe('Optional category filter (e.g., "api", "deployment", "testing")'),
    includeWeb: z.boolean().default(true).describe('Include web search if local docs not found'),
    maxResults: z.number().default(5).describe('Maximum number of results to return'),
    addToLibrary: z.boolean().default(true).describe('Automatically add web results to library')
  }),
  execute: async ({ query, category, includeWeb, maxResults, addToLibrary }) => {
    try {
      console.log(chalk.blue(`🔍 Searching documentation for: "${query}"`));

      let results;
      
      if (includeWeb) {
        // Cerca con fallback web
        results = await docLibrary.searchWithWebFallback(query, category);
      } else {
        // Solo ricerca locale
        results = await docLibrary.search(query, category, maxResults);
      }

      if (results.length === 0) {
        return {
          found: false,
          message: `No documentation found for "${query}"`,
          suggestions: [
            'Try different keywords',
            'Check spelling',
            'Use more specific terms',
            'Try searching in a different category'
          ]
        };
      }

      // Formatta risultati
      const formattedResults = results.slice(0, maxResults).map((result, index) => ({
        rank: index + 1,
        title: result.entry.title,
        url: result.entry.url,
        category: result.entry.category,
        score: (result.score * 100).toFixed(1) + '%',
        snippet: result.snippet,
        matchedTerms: result.matchedTerms,
        metadata: {
          wordCount: result.entry.metadata.wordCount,
          language: result.entry.metadata.language,
          accessCount: result.entry.accessCount
        }
      }));

      return {
        found: true,
        query,
        totalResults: results.length,
        results: formattedResults,
        summary: `Found ${results.length} relevant documentation entries for "${query}"`,
        topResult: formattedResults[0]
      };

    } catch (error: any) {
      console.error(chalk.red(`❌ Documentation search failed: ${error.message}`));
      return {
        found: false,
        error: error.message,
        message: 'Documentation search encountered an error'
      };
    }
  }
});

export const addDocumentationTool: CoreTool = tool({
  description: 'Add documentation from URL to the library for future reference',
  parameters: z.object({
    url: z.string().describe('URL of the documentation to add'),
    category: z.string().default('general').describe('Category for the documentation'),
    tags: z.array(z.string()).default([]).describe('Tags for better searchability'),
    description: z.string().optional().describe('Optional description of the documentation')
  }),
  execute: async ({ url, category, tags, description }) => {
    try {
      console.log(chalk.blue(`📖 Adding documentation from: ${url}`));

      const entry = await docLibrary.addDocumentation(url, category, tags);

      return {
        success: true,
        added: {
          id: entry.id,
          title: entry.title,
          url: entry.url,
          category: entry.category,
          tags: entry.tags,
          wordCount: entry.metadata.wordCount,
          language: entry.metadata.language
        },
        message: `Successfully added "${entry.title}" to documentation library`,
        metadata: {
          totalDocs: docLibrary.getStats().totalDocs,
          category: entry.category
        }
      };

    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to add documentation: ${error.message}`));
      return {
        success: false,
        error: error.message,
        message: 'Failed to add documentation to library'
      };
    }
  }
});

export const documentationStatsTool: CoreTool = tool({
  description: 'Get statistics and status of the documentation library',
  parameters: z.object({
    detailed: z.boolean().default(false).describe('Include detailed statistics')
  }),
  execute: async ({ detailed }) => {
    try {
      const stats = docLibrary.getStats();

      const result: any = {
        totalDocs: stats.totalDocs,
        categories: stats.categories,
        totalWords: stats.totalWords,
        avgAccessCount: stats.avgAccessCount,
        languages: stats.languages
      };

      if (detailed) {
        result.detailedStats = {
          byCategory: {},
          byLanguage: {},
          recentAdditions: [],
          mostAccessed: []
        };

        // Aggiungi statistiche dettagliate se richiesto
        const entries = Array.from(docLibrary['docs'].values());
        
        // Per categoria
        for (const category of stats.categories) {
          const categoryEntries = entries.filter(e => e.category === category);
          result.detailedStats.byCategory[category] = {
            count: categoryEntries.length,
            avgWords: categoryEntries.reduce((sum, e) => sum + e.metadata.wordCount, 0) / categoryEntries.length || 0
          };
        }

        // Per lingua
        for (const language of stats.languages) {
          const languageEntries = entries.filter(e => e.metadata.language === language);
          result.detailedStats.byLanguage[language] = {
            count: languageEntries.length,
            avgAccessCount: languageEntries.reduce((sum, e) => sum + e.accessCount, 0) / languageEntries.length || 0
          };
        }
      }

      return {
        success: true,
        stats: result,
        message: `Documentation library contains ${stats.totalDocs} entries across ${stats.categories.length} categories`
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to get documentation statistics'
      };
    }
  }
});

// Export tutti i tools
export const documentationTools = {
  search: documentationSearchTool,
  add: addDocumentationTool,
  stats: documentationStatsTool
};
