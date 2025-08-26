import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { getCloudDocsProvider } from './cloud-docs-provider';
import { randomBytes } from 'crypto';

export interface FeedbackEntry {
  id: string;
  type: 'doc_gap' | 'success' | 'error' | 'usage' | 'suggestion';
  timestamp: string;
  concept: string;
  context: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  frequency: 'first-time' | 'occasional' | 'frequent' | 'blocking';
  metadata: {
    userAction?: string;
    resolution?: string;
    sources?: string[];
    sessionId?: string;
    agentType?: string;
    duration?: number;
    toolName?: string;
    searchQuery?: string;
    resultCount?: string;
    requestedConcept?: string;
    urgency?: string;
    errorType?: string;
    qualityScore?: string;
    frequency?: number;
    operation?: string;
    [key: string]: any; // Permettere proprietà aggiuntive
  };
  status: 'pending' | 'resolved' | 'acknowledged';
  anonymized: boolean;
}

export interface FeedbackConfig {
  enabled: boolean;
  autoSubmit: boolean;
  anonymousMode: boolean;
  batchSize: number;
  submitInterval: number; // minutes
  keepLocal: boolean;
}

export class FeedbackSystem {
  private feedbackDir: string;
  private feedbackFile: string;
  private configFile: string;
  private config: FeedbackConfig;
  private pendingFeedback: FeedbackEntry[] = [];
  private lastSubmit: Date = new Date();

  constructor(cacheDir: string = './.nikcli') {
    this.feedbackDir = path.join(os.homedir(), '.nikcli', 'feedback');
    this.feedbackFile = path.join(this.feedbackDir, 'feedback.json');
    this.configFile = path.join(this.feedbackDir, 'feedback-config.json');
    
    this.config = {
      enabled: true,
      autoSubmit: true,
      anonymousMode: true,
      batchSize: 10,
      submitInterval: 60, // 1 hour
      keepLocal: true
    };

    this.ensureFeedbackDir();
    this.loadConfig();
    this.loadPendingFeedback();
  }

  private ensureFeedbackDir(): void {
    if (!fsSync.existsSync(this.feedbackDir)) {
      fsSync.mkdirSync(this.feedbackDir, { recursive: true });
    }
  }

  private loadConfig(): void {
    try {
      if (fsSync.existsSync(this.configFile)) {
        const data = fsSync.readFileSync(this.configFile, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
    } catch (error) {
      console.debug('Could not load feedback config, using defaults');
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save feedback config:', error);
    }
  }

  private loadPendingFeedback(): void {
    try {
      if (fsSync.existsSync(this.feedbackFile)) {
        const data = fsSync.readFileSync(this.feedbackFile, 'utf-8');
        this.pendingFeedback = JSON.parse(data);
      }
    } catch (error) {
      console.debug('Could not load pending feedback, starting fresh');
      this.pendingFeedback = [];
    }
  }

  private async savePendingFeedback(): Promise<void> {
    try {
      await fs.writeFile(this.feedbackFile, JSON.stringify(this.pendingFeedback, null, 2));
    } catch (error) {
      console.error('Failed to save pending feedback:', error);
    }
  }

  /**
   * Report documentation gap
   */
  async reportDocGap(
    concept: string,
    context: string,
    impact: 'low' | 'medium' | 'high' | 'critical',
    frequency: 'first-time' | 'occasional' | 'frequent' | 'blocking',
    metadata: {
      sources?: string[];
      agentType?: string;
      sessionId?: string;
      toolName?: string;
      searchQuery?: string;
      resultCount?: string;
      requestedConcept?: string;
      urgency?: string;
      errorType?: string;
      qualityScore?: string;
      frequency?: number;
      operation?: string;
      duration?: number;
      [key: string]: any;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const feedback: FeedbackEntry = {
      id: this.generateId(),
      type: 'doc_gap',
      timestamp: new Date().toISOString(),
      concept,
      context,
      impact,
      frequency,
      metadata,
      status: 'pending',
      anonymized: this.config.anonymousMode
    };

    this.pendingFeedback.push(feedback);
    await this.savePendingFeedback();

    // Feedback interno - solo debug log
    console.debug(`Internal agent feedback: Doc gap for ${concept} (${impact} impact)`);

    // Auto-submit if conditions are met
    if (this.shouldAutoSubmit()) {
      await this.submitPendingFeedback();
    }
  }

  /**
   * Report successful resolution
   */
  async reportSuccess(
    concept: string,
    context: string,
    resolution: string,
    metadata: {
      agentType?: string;
      sessionId?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const feedback: FeedbackEntry = {
      id: this.generateId(),
      type: 'success',
      timestamp: new Date().toISOString(),
      concept,
      context,
      impact: 'low',
      frequency: 'first-time',
      metadata: { ...metadata, resolution },
      status: 'resolved',
      anonymized: this.config.anonymousMode
    };

    this.pendingFeedback.push(feedback);
    await this.savePendingFeedback();

    if (this.shouldAutoSubmit()) {
      await this.submitPendingFeedback();
    }
  }

  /**
   * Report usage patterns
   */
  async reportUsage(
    action: string,
    context: string,
    metadata: {
      agentType?: string;
      sessionId?: string;
      duration?: number;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const feedback: FeedbackEntry = {
      id: this.generateId(),
      type: 'usage',
      timestamp: new Date().toISOString(),
      concept: action,
      context,
      impact: 'low',
      frequency: 'first-time',
      metadata: { ...metadata, userAction: action },
      status: 'acknowledged',
      anonymized: this.config.anonymousMode
    };

    this.pendingFeedback.push(feedback);
    
    // Usage data is submitted in batches without saving locally
    if (this.shouldAutoSubmit()) {
      await this.submitPendingFeedback();
    }
  }

  /**
   * Submit pending feedback to cloud
   */
  async submitPendingFeedback(): Promise<{ submitted: number; failed: number }> {
    if (!this.config.enabled || this.pendingFeedback.length === 0) {
      return { submitted: 0, failed: 0 };
    }

    const cloudProvider = getCloudDocsProvider();
    if (!cloudProvider) {
      console.debug('Cloud provider not available, keeping feedback local');
      return { submitted: 0, failed: 0 };
    }

    // Feedback interno - silent submission
    console.debug(`Submitting ${this.pendingFeedback.length} internal feedback entries`);

    let submitted = 0;
    let failed = 0;

    try {
      // Submit in batches
      const batches = this.chunkArray(this.pendingFeedback, this.config.batchSize);
      
      for (const batch of batches) {
        try {
          await this.submitFeedbackBatch(batch);
          submitted += batch.length;
          
          // Remove submitted feedback if not keeping local
          if (!this.config.keepLocal) {
            this.pendingFeedback = this.pendingFeedback.filter(
              f => !batch.find(b => b.id === f.id)
            );
          } else {
            // Mark as submitted
            batch.forEach(b => {
              const local = this.pendingFeedback.find(f => f.id === b.id);
              if (local) local.status = 'acknowledged';
            });
          }
        } catch (error) {
          console.debug('Batch submission failed:', error);
          failed += batch.length;
        }
      }

      await this.savePendingFeedback();
      this.lastSubmit = new Date();

      // Internal logging only
      if (submitted > 0) {
        console.debug(`Internal: Submitted ${submitted} feedback entries for agent learning`);
      }
      if (failed > 0) {
        console.debug(`Internal: Failed to submit ${failed} feedback entries`);
      }

    } catch (error) {
      console.debug('Feedback submission failed:', error);
      failed = this.pendingFeedback.length;
    }

    return { submitted, failed };
  }

  private async submitFeedbackBatch(batch: FeedbackEntry[]): Promise<void> {
    const cloudProvider = getCloudDocsProvider();
    if (!cloudProvider) throw new Error('Cloud provider not available');

    // For now, store feedback in a special feedback table
    // TODO: Create feedback table in Supabase schema
    const anonymizedBatch = batch.map(f => this.anonymizeFeedback(f));
    
    // This would be implemented as a Supabase function
    // await cloudProvider.submitFeedback(anonymizedBatch);
    
    // For now, just log success
    console.debug(`Would submit ${batch.length} feedback entries to cloud`);
  }

  private anonymizeFeedback(feedback: FeedbackEntry): FeedbackEntry {
    if (!this.config.anonymousMode) return feedback;

    return {
      ...feedback,
      metadata: {
        ...feedback.metadata,
        sessionId: feedback.metadata.sessionId ? 'anonymous' : undefined,
        userAction: feedback.metadata.userAction
      },
      anonymized: true
    };
  }

  private shouldAutoSubmit(): boolean {
    if (!this.config.autoSubmit) return false;
    
    // Submit if we have enough feedback
    if (this.pendingFeedback.length >= this.config.batchSize) return true;
    
    // Submit if enough time has passed
    const timeSinceLastSubmit = Date.now() - this.lastSubmit.getTime();
    const intervalMs = this.config.submitInterval * 60 * 1000;
    
    return timeSinceLastSubmit >= intervalMs && this.pendingFeedback.length > 0;
  }

  private generateId(): string {
    return `feedback_${Date.now()}_${randomBytes(6).toString('base64url')}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get feedback statistics
   */
  getStats(): {
    total: number;
    pending: number;
    byType: Record<string, number>;
    byImpact: Record<string, number>;
    recent: number;
  } {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const stats = {
      total: this.pendingFeedback.length,
      pending: this.pendingFeedback.filter(f => f.status === 'pending').length,
      byType: {} as Record<string, number>,
      byImpact: {} as Record<string, number>,
      recent: this.pendingFeedback.filter(f => new Date(f.timestamp).getTime() > dayAgo).length
    };

    this.pendingFeedback.forEach(f => {
      stats.byType[f.type] = (stats.byType[f.type] || 0) + 1;
      stats.byImpact[f.impact] = (stats.byImpact[f.impact] || 0) + 1;
    });

    return stats;
  }

  /**
   * Configure feedback system
   */
  async configure(newConfig: Partial<FeedbackConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
    
    console.log(chalk.green('✅ Feedback configuration updated'));
    console.log(chalk.gray(`   Enabled: ${this.config.enabled}`));
    console.log(chalk.gray(`   Auto-submit: ${this.config.autoSubmit}`));
    console.log(chalk.gray(`   Anonymous: ${this.config.anonymousMode}`));
  }

  /**
   * Get most frequent gaps for recommendations
   */
  getTopGaps(limit: number = 10): Array<{
    concept: string;
    count: number;
    avgImpact: string;
    lastSeen: string;
  }> {
    const gaps = this.pendingFeedback.filter(f => f.type === 'doc_gap');
    const grouped = new Map<string, FeedbackEntry[]>();

    gaps.forEach(gap => {
      if (!grouped.has(gap.concept)) {
        grouped.set(gap.concept, []);
      }
      grouped.get(gap.concept)!.push(gap);
    });

    const result = Array.from(grouped.entries())
      .map(([concept, entries]) => {
        const impacts = entries.map(e => e.impact);
        const avgImpact = this.calculateAverageImpact(impacts);
        const lastSeen = Math.max(...entries.map(e => new Date(e.timestamp).getTime()));

        return {
          concept,
          count: entries.length,
          avgImpact,
          lastSeen: new Date(lastSeen).toISOString()
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return result;
  }

  private calculateAverageImpact(impacts: string[]): string {
    const weights = { low: 1, medium: 2, high: 3, critical: 4 };
    const avgWeight = impacts.reduce((sum, impact) => sum + weights[impact as keyof typeof weights], 0) / impacts.length;
    
    if (avgWeight >= 3.5) return 'critical';
    if (avgWeight >= 2.5) return 'high';
    if (avgWeight >= 1.5) return 'medium';
    return 'low';
  }
}

// Singleton instance
export const feedbackSystem = new FeedbackSystem();