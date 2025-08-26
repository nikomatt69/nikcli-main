import { CoreTool } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';
import chalk from 'chalk';
import { docLibrary } from '../core/documentation-library';
import { docsContextManager } from '../context/docs-context-manager';
import { getCloudDocsProvider } from '../core/cloud-docs-provider';

// Types for smart docs search results to avoid never[] inference
type DocSearchResult = {
  title: string;
  category: string;
  url: string;
  tags: string[];
  score: string;
  snippet: string;
  source: 'local' | 'shared';
};

type LoadedDocInfo = {
  title: string;
  category: string;
  source: string;
  summary: string;
};

type SmartDocsResults = {
  found: boolean;
  localResults: DocSearchResult[];
  sharedResults: DocSearchResult[];
  loadedToContext: LoadedDocInfo[];
  suggestions: string[];
  summary: string;
};

/**
 * Smart Documentation Tool per gli agenti AI
 * Permette agli agenti di cercare e caricare automaticamente documentazione
 */
export const smartDocsSearchTool: CoreTool = tool({
  description: 'Search and load documentation automatically when you need information about specific technologies, frameworks, or implementation details',
  parameters: z.object({
    query: z.string().describe('What you are looking for (e.g., "react hooks", "nodejs authentication", "express middleware")'),
    autoLoad: z.boolean().default(true).describe('Automatically load relevant documentation into context'),
    maxResults: z.number().default(3).describe('Maximum number of documents to find'),
    category: z.string().optional().describe('Specific category to search in (frontend, backend, api, etc.)'),
    urgency: z.enum(['low', 'medium', 'high']).default('medium').describe('How critical this information is for the current task')
  }),
  execute: async ({ query, autoLoad, maxResults, category, urgency }) => {
    try {
      console.log(chalk.blue(`🤖 Agent searching docs: "${query}"`));

      const results: SmartDocsResults = {
        found: false,
        localResults: [],
        sharedResults: [],
        loadedToContext: [],
        suggestions: [],
        summary: ''
      };

      // 1. Search in local documentation
      try {
        const localDocs = await docLibrary.search(query, category, maxResults);
        results.localResults = localDocs.map(result => ({
          title: result.entry.title,
          category: result.entry.category,
          url: result.entry.url,
          tags: result.entry.tags,
          score: (result.score * 100).toFixed(1) + '%',
          snippet: result.snippet?.substring(0, 200) || '',
          source: 'local'
        }));

        if (localDocs.length > 0) {
          results.found = true;
        }
      } catch (error) {
        console.error('Local docs search failed:', error);
      }

      // 2. Search in shared/cloud documentation if available
      const cloudProvider = getCloudDocsProvider();
      if (cloudProvider && results.localResults.length < maxResults) {
        try {
          const remainingSlots = maxResults - results.localResults.length;
          const cloudDocs = await cloudProvider.searchShared(query, category, remainingSlots);

          results.sharedResults = cloudDocs.map(doc => ({
            title: doc.title,
            category: doc.category,
            url: doc.url,
            tags: doc.tags,
            score: (doc.popularity_score * 100).toFixed(1) + '%',
            snippet: doc.content.substring(0, 200) + '...',
            source: 'shared'
          }));

          if (cloudDocs.length > 0) {
            results.found = true;
          }
        } catch (error) {
          console.error('Cloud docs search failed:', error);
        }
      }

      // 3. Auto-load relevant documents if requested and urgency is medium/high
      if (autoLoad && results.found && (urgency === 'medium' || urgency === 'high')) {
        try {
          const docsToLoad: any[] = [];

          // Load top local results
          results.localResults.slice(0, 2).forEach(doc => {
            docsToLoad.push(doc.title);
          });

          // Load top shared results if not enough local results
          if (docsToLoad.length < 2) {
            results.sharedResults.slice(0, 2 - docsToLoad.length).forEach(doc => {
              docsToLoad.push(doc.title);
            });
          }

          if (docsToLoad.length > 0) {
            const loadedDocs = await docsContextManager.loadDocs(docsToLoad);
            results.loadedToContext = loadedDocs.map(doc => ({
              title: doc.title,
              category: doc.category,
              source: doc.source,
              summary: doc.summary || ''
            }));

            console.log(chalk.green(`🤖 Auto-loaded ${loadedDocs.length} docs for agent context`));
          }
        } catch (error) {
          console.error('Auto-load failed:', error);
        }
      }

      // 4. Generate suggestions for additional searches
      if (results.found) {
        const allTags = [
          ...results.localResults.flatMap(r => r.tags),
          ...results.sharedResults.flatMap(r => r.tags)
        ];
        const uniqueTags = [...new Set(allTags)];
        results.suggestions = uniqueTags.slice(0, 5);
      }

      // 5. Create summary for agent
      const totalFound = results.localResults.length + results.sharedResults.length;
      const loaded = results.loadedToContext.length;

      if (!results.found) {
        results.summary = `No documentation found for "${query}". Consider:
1. Using different keywords or more specific terms
2. Adding documentation with /doc-add <url>
3. Checking available categories with /doc-list`;
      } else {
        results.summary = `Found ${totalFound} relevant documentation entries for "${query}".
${loaded > 0 ? `✅ ${loaded} documents automatically loaded into context and ready to use.` : ''}
${results.suggestions.length > 0 ? `\n💡 Related topics: ${results.suggestions.join(', ')}` : ''}

Available documentation:
${[...results.localResults, ...results.sharedResults].map((doc, i) =>
          `${i + 1}. ${doc.title} (${doc.category}) - ${doc.score} match`
        ).join('\n')}`;
      }

      return {
        success: true,
        query,
        found: results.found,
        totalResults: totalFound,
        results: {
          local: results.localResults,
          shared: results.sharedResults,
          loaded: results.loadedToContext
        },
        suggestions: results.suggestions,
        summary: results.summary,
        contextUpdated: results.loadedToContext.length > 0
      };

    } catch (error: any) {
      console.error(chalk.red(`❌ Agent docs search failed: ${error.message}`));
      return {
        success: false,
        error: error.message,
        query,
        found: false,
        summary: `Documentation search failed: ${error.message}`
      };
    }
  }
});

/**
 * Smart Documentation Loading Tool
 * Carica documenti specifici nel contesto dell'agente
 */
export const smartDocsLoadTool: CoreTool = tool({
  description: 'Load specific documentation into AI context when you need detailed reference material',
  parameters: z.object({
    docNames: z.array(z.string()).describe('Names or identifiers of documents to load'),
    replace: z.boolean().default(false).describe('Replace current context or add to existing'),
    priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority level for context loading')
  }),
  execute: async ({ docNames, replace }) => {
    try {
      console.log(chalk.blue(`🤖 Agent loading docs: ${docNames.join(', ')}`));

      // Clear existing context if replace is true
      if (replace) {
        await docsContextManager.unloadDocs();
        console.log(chalk.gray('🤖 Cleared existing documentation context'));
      }

      // Load requested documents
      const loadedDocs = await docsContextManager.loadDocs(docNames);
      const stats = docsContextManager.getContextStats();

      const result = {
        success: true,
        loaded: loadedDocs.length,
        failed: docNames.length - loadedDocs.length,
        contextStats: {
          totalDocs: stats.loadedCount,
          totalWords: stats.totalWords,
          utilization: Math.round(stats.utilizationPercent),
          categories: stats.categories
        },
        loadedDocs: loadedDocs.map(doc => ({
          title: doc.title,
          category: doc.category,
          source: doc.source,
          wordCount: doc.content.split(' ').length,
          summary: doc.summary || ''
        }))
      };

      const summary = `Successfully loaded ${result.loaded} documents into context.
Context now contains ${result.contextStats.totalDocs} documents (${result.contextStats.totalWords.toLocaleString()} words, ${result.contextStats.utilization}% capacity).
Categories: ${result.contextStats.categories.join(', ')}

Loaded documents:
${result.loadedDocs.map((doc, i) =>
        `${i + 1}. ${doc.title} (${doc.category}) - ${doc.wordCount.toLocaleString()} words`
      ).join('\n')}`;

      return {
        ...result,
        summary
      };

    } catch (error: any) {
      console.error(chalk.red(`❌ Agent docs loading failed: ${error.message}`));
      return {
        success: false,
        error: error.message,
        summary: `Failed to load documentation: ${error.message}`
      };
    }
  }
});

/**
 * Smart Documentation Context Tool
 * Mostra lo stato attuale del contesto documentazione
 */
export const smartDocsContextTool: CoreTool = tool({
  description: 'Check what documentation is currently loaded in context and get suggestions',
  parameters: z.object({
    includeContent: z.boolean().default(false).describe('Include actual content snippets in response'),
    suggestForQuery: z.string().optional().describe('Get suggestions for a specific query or task')
  }),
  execute: async ({ includeContent, suggestForQuery }) => {
    try {
      const stats = docsContextManager.getContextStats();
      const loadedDocs = docsContextManager.getLoadedDocs();

      const result = {
        hasContext: stats.loadedCount > 0,
        stats: {
          totalDocs: stats.loadedCount,
          totalWords: stats.totalWords,
          utilization: Math.round(stats.utilizationPercent),
          categories: stats.categories,
          sources: stats.sources
        },
        documents: loadedDocs.map(doc => ({
          title: doc.title,
          category: doc.category,
          source: doc.source,
          tags: doc.tags,
          wordCount: doc.content.split(' ').length,
          loadedAt: doc.loadedAt.toISOString(),
          summary: doc.summary || '',
          ...(includeContent ? {
            contentPreview: doc.content.substring(0, 500) + '...'
          } : {})
        })),
        suggestions: [] as string[]
      };

      // Generate suggestions if query provided
      if (suggestForQuery) {
        try {
          const suggestions = await docsContextManager.suggestDocs(suggestForQuery, 5);
          result.suggestions = suggestions;
        } catch (error) {
          console.error('Failed to generate suggestions:', error);
        }
      }

      let summary = '';
      if (!result.hasContext) {
        summary = 'No documentation currently loaded in context. Use the documentation search tool to find and load relevant docs.';
      } else {
        summary = `Documentation context: ${result.stats.totalDocs} documents loaded (${result.stats.totalWords.toLocaleString()} words, ${result.stats.utilization}% capacity)

Current documents:
${result.documents.map((doc, i) =>
          `${i + 1}. ${doc.title} (${doc.category}) - ${doc.wordCount.toLocaleString()} words`
        ).join('\n')}

Categories: ${result.stats.categories.join(', ')}
Sources: Local: ${result.stats.sources.local}, Cloud: ${result.stats.sources.shared}`;

        if (result.suggestions.length > 0) {
          summary += `\n\n💡 Related documentation suggestions: ${result.suggestions.join(', ')}`;
        }
      }

      return {
        success: true,
        ...result,
        summary
      };

    } catch (error: any) {
      console.error(chalk.red(`❌ Agent context check failed: ${error.message}`));
      return {
        success: false,
        error: error.message,
        summary: `Failed to check documentation context: ${error.message}`
      };
    }
  }
});

// Export all smart docs tools
export const smartDocsTools = {
  search: smartDocsSearchTool,
  load: smartDocsLoadTool,
  context: smartDocsContextTool
};