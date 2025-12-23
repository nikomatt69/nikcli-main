import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { createOpenAI, openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import chalk from 'chalk'
import { z } from 'zod/v3';
import { webSearch } from '@exalabs/ai-sdk'
import { modelProvider } from '../ai/model-provider'
import { configManager } from './config-manager'

const execAsync = promisify(exec)

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  relevance: number
}

interface WebSynthesisResult {
  answer: string
  sources: Array<{ title: string; url: string; snippet?: string }>
}

export class WebSearchProvider {
  // Native OpenAI web search tool (web_search_preview) when supported
  getNativeWebSearchTool() {
    if (!this.supportsNativeOpenAIWebSearch()) return null

    // The .tools.webSearchPreview property only exists on the default 'openai' export,
    // not on instances created by createOpenAI(). Use the default export for OpenAI provider.
    try {
      const current = configManager.getCurrentModel()
      const models = configManager.get('models')
      const cfg = models?.[current]
      if (!cfg) return null

      // Only use native tool for OpenAI provider (not OpenRouter, as it requires custom baseURL)
      if (cfg.provider === 'openai') {
        const apiKey = configManager.getApiKey(current)
        if (!apiKey) return null

        // Check if the default openai export has the webSearchPreview tool
        if (openai?.tools?.webSearchPreview) {
          return openai.tools.webSearchPreview({})
        }
      }

      // For OpenRouter or other providers, return null to fall back to custom tool
      return null
    } catch (_error) {
      return null
    }
  }

  // Web search tool using AI SDK
  getWebSearchTool() {
    return tool({
      description: 'Search the web for current information, documentation, or solutions',
      inputSchema: z.object({
        query: z.string().describe('Search query to find relevant information'),
        maxResults: z.number().default(5).describe('Maximum number of results to return'),
        searchType: z
          .enum(['general', 'technical', 'documentation', 'stackoverflow'])
          .default('general')
          .describe('Type of search to perform'),
        mode: z
          .enum(['results', 'answer'])
          .default('results')
          .describe('Return raw results or an AI-synthesized answer with citations'),
        includeContent: z.boolean().default(false).describe('Fetch page content to improve synthesis quality'),
        maxContentBytes: z.number().default(200000).describe('Maximum number of bytes to fetch per page for synthesis'),
      }),
      execute: async ({ query, maxResults, searchType, mode, includeContent, maxContentBytes }) => {
        try {
          console.log(chalk.blue(`🔍 Searching web for: "${query}" (${searchType})`))

          // Use different search strategies based on type
          let searchResults: WebSearchResult[] = []

          switch (searchType) {
            case 'technical':
              searchResults = await this.searchTechnical(query, maxResults)
              break
            case 'documentation':
              searchResults = await this.searchDocumentation(query, maxResults)
              break
            case 'stackoverflow':
              searchResults = await this.searchStackOverflow(query, maxResults)
              break
            default:
              searchResults = await this.searchGeneral(query, maxResults)
          }

          if (mode === 'answer') {
            const synthesis = await this.synthesizeAnswer(query, searchResults, {
              includeContent: !!includeContent,
              maxContentBytes: maxContentBytes ?? 200000,
              take: Math.max(1, Math.min(maxResults ?? 5, 5)),
            })

            return {
              query,
              searchType,
              mode,
              results: searchResults,
              answer: synthesis.answer,
              sources: synthesis.sources,
              totalFound: searchResults.length,
              searchTime: new Date().toISOString(),
            }
          }

          return {
            query,
            searchType,
            mode,
            results: searchResults,
            totalFound: searchResults.length,
            searchTime: new Date().toISOString(),
          }
        } catch (error: any) {
          return {
            error: `Web search failed: ${error.message}`,
            query,
            searchType,
          }
        }
      },
    });
  }

  private supportsNativeOpenAIWebSearch(): boolean {
    try {
      const current = configManager.getCurrentModel()
      const models = configManager.get('models')
      const cfg = models?.[current]
      if (!cfg) return false

      // Only OpenAI provider supports web_search_preview natively via the default export
      // OpenRouter requires custom baseURL, so native tool is not available
      if (cfg.provider === 'openai') {
        // Check if the default openai export has the webSearchPreview tool
        return !!openai?.tools?.webSearchPreview
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * Build an OpenAI-compatible provider for tool usage (OpenAI or OpenRouter baseURL).
   */
  private getOpenAICompatibleProvider() {
    const current = configManager.getCurrentModel()
    const models = configManager.get('models')
    const cfg = models?.[current]
    if (!cfg) return null

    const getApiKey = (name?: string) => configManager.getApiKey(name || current)

    try {
      if (cfg.provider === 'openai') {
        const apiKey = getApiKey()
        if (!apiKey) return null
        return createOpenAI({ apiKey })
      }

      if (cfg.provider === 'openrouter') {
        let apiKey = getApiKey()
        if (!apiKey) {
          apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
        }
        if (!apiKey) return null

        return createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.mintlify.app',
            'X-Title': 'NikCLI',
          },
        })
      }
    } catch (_error) {
      return null
    }

    return null
  }

  /**
   * Get Exa API key from config manager or environment variable
   */
  private getExaApiKey(): string | null {
    try {
      // Try config manager first
      const apiKey = configManager.getApiKey('exa')
      if (apiKey) return apiKey

      // Fallback to environment variable
      return process.env.EXA_API_KEY || null
    } catch {
      return null
    }
  }

  /**
   * Check if Exa is available (API key configured)
   */
  private isExaAvailable(): boolean {
    return !!this.getExaApiKey()
  }

  /**
   * Search using Exa AI SDK tool as fallback
   */
  private async searchWithExa(query: string, maxResults: number): Promise<WebSearchResult[]> {
    try {
      const apiKey = this.getExaApiKey()
      if (!apiKey) {
        return []
      }

      // Ensure EXA_API_KEY is set in environment for the tool to work
      // The @exalabs/ai-sdk tool reads from process.env.EXA_API_KEY
      const originalApiKey = process.env.EXA_API_KEY
      if (!process.env.EXA_API_KEY) {
        process.env.EXA_API_KEY = apiKey
      }

      try {
        // Create Exa webSearch tool with configuration
        const exaSearchTool = webSearch({
          numResults: maxResults,
          type: 'neural', // Use neural search for better results
        })

        // Execute the tool directly - the tool's execute method accepts { query: string }
        if (!exaSearchTool?.execute) {
          throw new Error('Exa search tool execute method is not available')
        }
        const result = await (exaSearchTool.execute as any)({ query }, undefined)

        // Transform Exa results to WebSearchResult format
        const results: WebSearchResult[] = []

        // Handle different possible result structures
        let items: any[] = []

        if (Array.isArray(result)) {
          items = result
        } else if (result && typeof result === 'object') {
          // Try common property names
          const resultAny = result as any
          items = resultAny.results || resultAny.items || resultAny.data || []

          // If result itself looks like a single item, wrap it
          if (resultAny.url || resultAny.title) {
            items = [resultAny]
          }
        }

        items.forEach((item: any, index: number) => {
          if (item && (item.url || item.link)) {
            results.push({
              title: item.title || item.name || `Result ${index + 1}`,
              url: item.url || item.link || '',
              snippet: item.text || item.snippet || item.description || item.excerpt || '',
              relevance: 1 - index * 0.1,
            })
          }
        })

        return results
      } finally {
        // Restore original API key if we set it
        if (originalApiKey === undefined) {
          delete process.env.EXA_API_KEY
        } else if (originalApiKey !== process.env.EXA_API_KEY) {
          process.env.EXA_API_KEY = originalApiKey
        }
      }
    } catch (error: any) {
      console.warn(chalk.yellow(`Exa search failed: ${error.message}`))
      return []
    }
  }

  // General web search using curl and search engines
  private async searchGeneral(query: string, maxResults: number): Promise<WebSearchResult[]> {
    try {
      // Use DuckDuckGo for privacy-friendly search
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const { stdout } = await execAsync(
        `curl -s -A "Mozilla/5.0" "${searchUrl}" | grep -o 'href="[^"]*" class="result__url"' | head -${maxResults}`
      )

      const results: WebSearchResult[] = []
      const lines = stdout.split('\n').filter((line) => line.trim())

      lines.forEach((line, index) => {
        const urlMatch = line.match(/href="([^"]*)"/)
        if (urlMatch) {
          results.push({
            title: `Result ${index + 1}`,
            url: urlMatch[1],
            snippet: `Found result for: ${query}`,
            relevance: 1 - index * 0.1,
          })
        }
      })

      return results
    } catch (_error) {
      console.warn(chalk.yellow('DuckDuckGo search failed, trying Exa fallback...'))

      // Try Exa as fallback if available
      if (this.isExaAvailable()) {
        const exaResults = await this.searchWithExa(query, maxResults)
        if (exaResults.length > 0) {
          console.log(chalk.green(`✓ Exa fallback returned ${exaResults.length} results`))
          return exaResults
        }
      }

      // Final fallback to manual search links
      return this.getFallbackResults(query, maxResults)
    }
  }

  // Technical search focusing on developer resources
  private async searchTechnical(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const technicalQuery = `${query} site:github.com OR site:stackoverflow.com OR site:dev.to OR site:medium.com`
    return this.searchGeneral(technicalQuery, maxResults)
  }

  // Documentation search
  private async searchDocumentation(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const docQuery = `${query} site:docs.npmjs.com OR site:developer.mozilla.org OR site:docs.python.org OR site:docs.oracle.com`
    return this.searchGeneral(docQuery, maxResults)
  }

  // Stack Overflow specific search
  private async searchStackOverflow(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const soQuery = `${query} site:stackoverflow.com`
    return this.searchGeneral(soQuery, maxResults)
  }

  // Fallback results when search fails
  private getFallbackResults(query: string, maxResults: number): WebSearchResult[] {
    return [
      {
        title: `Search results for: ${query}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Manual search link for: ${query}`,
        relevance: 1.0,
      },
      {
        title: `Stack Overflow search`,
        url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Search Stack Overflow for: ${query}`,
        relevance: 0.9,
      },
      {
        title: `GitHub search`,
        url: `https://github.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Search GitHub repositories for: ${query}`,
        relevance: 0.8,
      },
    ].slice(0, maxResults)
  }

  // Use AISDK via our modelProvider to synthesize an answer with citations
  private async synthesizeAnswer(
    query: string,
    results: WebSearchResult[],
    options: { includeContent: boolean; maxContentBytes: number; take: number }
  ): Promise<WebSynthesisResult> {
    const top = results.slice(0, options.take)
    const sources: Array<{ title: string; url: string; snippet?: string }> = []

    if (options.includeContent) {
      for (const r of top) {
        const content = await this.fetchPageText(r.url, options.maxContentBytes ?? 200000)
        sources.push({ title: r.title, url: r.url, snippet: content ? content.slice(0, 2000) : r.snippet })
      }
    } else {
      for (const r of top) {
        sources.push({ title: r.title, url: r.url, snippet: r.snippet })
      }
    }

    const citations = sources
      .map((s, i) => `[#${i + 1}] ${s.title}\n${s.url}\n${(s.snippet || '').slice(0, 500)}`)
      .join('\n\n')

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a helpful research assistant. Provide a concise, factual answer. Include inline numeric citations like [#1], [#2] that refer to the provided sources. If unsure, say so.',
      },
      {
        role: 'user' as const,
        content: `Query: ${query}\n\nSources:\n${citations}\n\nTask: Compose a concise answer (bulleted if helpful), and list the cited sources at the end as: [#n] URL.`,
      },
    ]

    const answer = await modelProvider.generateResponse({ messages, temperature: 0.2 })

    return { answer, sources }
  }

  // Fetch page content (best-effort) and return plain text
  private async fetchPageText(url: string, maxBytes: number): Promise<string> {
    try {
      // Note: default fetch redirect is 'follow'; omit explicit typing to stay compatible with current libs
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NikCLI' } as any })
      if (!res.ok) return ''
      const reader = res.body?.getReader?.()
      if (!reader) {
        const text = await res.text()
        return this.htmlToText(text).slice(0, maxBytes)
      }
      let received = 0
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.byteLength
          if (received >= maxBytes) break
        }
      }
      const text = new TextDecoder('utf-8').decode(this.concatUint8(chunks))
      return this.htmlToText(text).slice(0, maxBytes)
    } catch {
      return ''
    }
  }

  private htmlToText(html: string): string {
    // naive HTML to text: strip tags and collapse whitespace
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private concatUint8(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.byteLength
    }
    return out
  }
}
