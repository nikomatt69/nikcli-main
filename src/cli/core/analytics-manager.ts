import { CoreMessage } from 'ai';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface AnalyticsEvent {
    timestamp: Date;
    eventType: 'query' | 'response' | 'tool_call' | 'error' | 'cache_hit' | 'performance';
    sessionId: string;
    userId?: string;
    data: any;
    metadata?: any;
}

export interface AnalyticsSummary {
    totalQueries: number;
    averageResponseTime: number;
    cacheHitRate: number;
    errorRate: number;
    mostUsedTools: Record<string, number>;
    popularQueries: string[];
    performanceTrends: any[];
}

export class AnalyticsManager {
    private events: AnalyticsEvent[] = [];
    private analyticsFile: string;
    private maxEvents: number = 10000;

    constructor(workingDirectory: string = process.cwd()) {
        this.analyticsFile = join(workingDirectory, '.nikcli-analytics.json');
        this.loadAnalytics();
    }

    // Track an analytics event
    trackEvent(event: Omit<AnalyticsEvent, 'timestamp'>): void {
        const fullEvent: AnalyticsEvent = {
            ...event,
            timestamp: new Date()
        };

        this.events.push(fullEvent);

        // Keep only recent events
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }

        // Save periodically
        if (this.events.length % 100 === 0) {
            this.saveAnalytics();
        }
    }

    // Track a query
    trackQuery(sessionId: string, query: string, metadata?: any): void {
        this.trackEvent({
            eventType: 'query',
            sessionId,
            data: { query: query.substring(0, 200) }, // Truncate for privacy
            metadata
        });
    }

    // Track a response
    trackResponse(sessionId: string, response: string, processingTime: number, metadata?: any): void {
        this.trackEvent({
            eventType: 'response',
            sessionId,
            data: {
                responseLength: response.length,
                processingTime,
                hasCode: response.includes('```'),
                hasStructuredContent: response.includes('**') || response.includes('1.') || response.includes('•')
            },
            metadata
        });
    }

    // Track tool calls
    trackToolCall(sessionId: string, toolName: string, success: boolean, duration: number): void {
        this.trackEvent({
            eventType: 'tool_call',
            sessionId,
            data: { toolName, success, duration }
        });
    }

    // Track cache hits
    trackCacheHit(sessionId: string, cacheType: string, tokensSaved: number): void {
        this.trackEvent({
            eventType: 'cache_hit',
            sessionId,
            data: { cacheType, tokensSaved }
        });
    }

    // Track performance metrics
    trackPerformance(sessionId: string, metrics: any): void {
        this.trackEvent({
            eventType: 'performance',
            sessionId,
            data: metrics
        });
    }

    // Get analytics summary
    getSummary(): AnalyticsSummary {
        const recentEvents = this.events.filter(e =>
            e.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        );

        const queries = recentEvents.filter(e => e.eventType === 'query');
        const responses = recentEvents.filter(e => e.eventType === 'response');
        const toolCalls = recentEvents.filter(e => e.eventType === 'tool_call');
        const cacheHits = recentEvents.filter(e => e.eventType === 'cache_hit');
        const errors = recentEvents.filter(e => e.eventType === 'error');

        // Calculate tool usage
        const toolUsage: Record<string, number> = {};
        toolCalls.forEach(event => {
            const toolName = event.data.toolName;
            toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
        });

        // Get popular queries
        const queryTexts = queries.map(e => e.data.query);
        const queryFrequency: Record<string, number> = {};
        queryTexts.forEach(query => {
            queryFrequency[query] = (queryFrequency[query] || 0) + 1;
        });

        const popularQueries = Object.entries(queryFrequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([query]) => query);

        return {
            totalQueries: queries.length,
            averageResponseTime: responses.length > 0
                ? responses.reduce((sum, e) => sum + e.data.processingTime, 0) / responses.length
                : 0,
            cacheHitRate: cacheHits.length / (queries.length || 1),
            errorRate: errors.length / (queries.length || 1),
            mostUsedTools: toolUsage,
            popularQueries,
            performanceTrends: this.getPerformanceTrends()
        };
    }

    // Get performance trends
    private getPerformanceTrends(): any[] {
        const performanceEvents = this.events.filter(e => e.eventType === 'performance');
        return performanceEvents.slice(-10).map(e => ({
            timestamp: e.timestamp,
            ...e.data
        }));
    }

    // Generate insights
    generateInsights(): string[] {
        const summary = this.getSummary();
        const insights: string[] = [];

        if (summary.cacheHitRate < 0.3) {
            insights.push('Low cache hit rate - consider expanding cache coverage');
        }

        if (summary.averageResponseTime > 5000) {
            insights.push('High response times - consider optimizing context size');
        }

        if (summary.errorRate > 0.1) {
            insights.push('High error rate - review error patterns');
        }

        const mostUsedTool = Object.entries(summary.mostUsedTools)
            .sort(([, a], [, b]) => b - a)[0];

        if (mostUsedTool) {
            insights.push(`Most used tool: ${mostUsedTool[0]} (${mostUsedTool[1]} times)`);
        }

        return insights;
    }

    // Save analytics to file
    private saveAnalytics(): void {
        try {
            const data = {
                events: this.events,
                lastUpdated: new Date().toISOString()
            };
            writeFileSync(this.analyticsFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('Failed to save analytics:', error);
        }
    }

    // Load analytics from file
    private loadAnalytics(): void {
        try {
            if (existsSync(this.analyticsFile)) {
                const data = JSON.parse(readFileSync(this.analyticsFile, 'utf-8'));
                this.events = data.events.map((e: any) => ({
                    ...e,
                    timestamp: new Date(e.timestamp)
                }));
            }
        } catch (error) {
            console.warn('Failed to load analytics:', error);
        }
    }

    // Export analytics report
    exportReport(): string {
        const summary = this.getSummary();
        const insights = this.generateInsights();

        return `# NikCLI Analytics Report
Generated: ${new Date().toISOString()}

## Summary
- Total Queries: ${summary.totalQueries}
- Average Response Time: ${summary.averageResponseTime.toFixed(0)}ms
- Cache Hit Rate: ${(summary.cacheHitRate * 100).toFixed(1)}%
- Error Rate: ${(summary.errorRate * 100).toFixed(1)}%

## Most Used Tools
${Object.entries(summary.mostUsedTools)
                .sort(([, a], [, b]) => b - a)
                .map(([tool, count]) => `- ${tool}: ${count} times`)
                .join('\n')}

## Popular Queries
${summary.popularQueries.map(q => `- "${q}"`).join('\n')}

## Insights
${insights.map(insight => `- ${insight}`).join('\n')}

## Performance Trends
${summary.performanceTrends.map(trend =>
                    `- ${trend.timestamp.toISOString()}: ${JSON.stringify(trend)}`
                ).join('\n')}`;
    }
}
