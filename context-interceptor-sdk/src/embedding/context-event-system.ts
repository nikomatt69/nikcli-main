import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { PatternGroupManager } from './pattern-group-manager';

export interface ContextEvent {
  type: 'query' | 'response' | 'document_indexed' | 'conversation_update';
  timestamp: Date;
  data: {
    text: string;
    metadata: Record<string, any>;
    conversationId?: string;
  };
}

export interface PatternCandidate {
  texts: string[];
  metadata: Record<string, any>;
  frequency: number;
  source: 'conversation' | 'query' | 'document';
}

export class ContextEventSystem extends EventEmitter {
  private logger: Logger;
  private groupManager: PatternGroupManager;
  private eventBuffer: ContextEvent[] = [];
  private patternCandidates = new Map<string, PatternCandidate>();
  private isProcessing = false;
  private processingInterval: Timer | null = null;

  private readonly BUFFER_SIZE = 20; // Process after 20 events
  private readonly PROCESSING_INTERVAL = 5000; // Process every 5 seconds
  private readonly MIN_FREQUENCY = 2; // Minimum frequency to create pattern

  constructor(groupManager: PatternGroupManager, logger: Logger) {
    super();
    this.groupManager = groupManager;
    this.logger = logger;

    // Start background processing
    this.startBackgroundProcessing();
  }

  /**
   * Record a context event
   */
  recordEvent(event: ContextEvent): void {
    this.eventBuffer.push(event);
    this.emit('event_recorded', event);

    this.logger.debug('Context event recorded', {
      type: event.type,
      bufferSize: this.eventBuffer.length,
    });

    // Trigger processing if buffer is full
    if (this.eventBuffer.length >= this.BUFFER_SIZE && !this.isProcessing) {
      this.processEvents().catch((error) => {
        this.logger.error('Event processing error', { error });
      });
    }
  }

  /**
   * Start background processing
   */
  private startBackgroundProcessing(): void {
    this.processingInterval = setInterval(() => {
      if (this.eventBuffer.length > 0 && !this.isProcessing) {
        this.processEvents().catch((error) => {
          this.logger.error('Background processing error', { error });
        });
      }
    }, this.PROCESSING_INTERVAL);

    this.logger.info('Context event system started');
  }

  /**
   * Stop background processing
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.logger.info('Context event system stopped');
  }

  /**
   * Process buffered events
   */
  private async processEvents(): Promise<void> {
    if (this.isProcessing || this.eventBuffer.length === 0) return;

    this.isProcessing = true;
    this.logger.debug('Processing context events', {
      eventCount: this.eventBuffer.length,
    });

    try {
      const events = this.eventBuffer.splice(0, this.BUFFER_SIZE);

      // Step 1: Extract pattern candidates
      this.extractPatternCandidates(events);

      // Step 2: Create pattern groups from candidates
      await this.createPatternGroups();

      // Step 3: Update existing groups
      await this.updateExistingGroups(events);

      this.emit('processing_complete', {
        eventsProcessed: events.length,
        candidatesCount: this.patternCandidates.size,
      });

      this.logger.info('Event processing complete', {
        eventsProcessed: events.length,
        candidatesCount: this.patternCandidates.size,
      });
    } catch (error) {
      this.logger.error('Event processing failed', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Extract pattern candidates from events
   */
  private extractPatternCandidates(events: ContextEvent[]): void {
    for (const event of events) {
      const key = this.generateCandidateKey(event.data.text);
      const existing = this.patternCandidates.get(key);

      if (existing) {
        // Update existing candidate
        existing.texts.push(event.data.text);
        existing.frequency++;
        existing.metadata = { ...existing.metadata, ...event.data.metadata };
      } else {
        // Create new candidate
        this.patternCandidates.set(key, {
          texts: [event.data.text],
          metadata: event.data.metadata,
          frequency: 1,
          source: this.mapEventTypeToSource(event.type),
        });
      }
    }
  }

  /**
   * Create pattern groups from candidates
   */
  private async createPatternGroups(): Promise<void> {
    const readyCandidates = Array.from(this.patternCandidates.entries()).filter(
      ([_, candidate]) => candidate.frequency >= this.MIN_FREQUENCY
    );

    for (const [key, candidate] of readyCandidates) {
      try {
        // Find similar existing group
        const characteristics = this.inferCharacteristics(candidate);
        const existingGroup = await this.groupManager.findBestGroup(candidate.texts[0], characteristics);

        if (existingGroup && existingGroup.characteristics.domain === characteristics.domain) {
          // Add to existing group
          this.logger.debug('Adding patterns to existing group', {
            groupId: existingGroup.id,
            patternCount: candidate.texts.length,
          });
          // Note: Would need to implement addPatternsToGroup method
        } else {
          // Create new group
          const patterns = candidate.texts.map((text) => ({
            text,
            metadata: candidate.metadata,
            frequency: Math.ceil(candidate.frequency / candidate.texts.length),
          }));

          const group = await this.groupManager.createGroup(patterns);

          this.logger.info('Pattern group created from events', {
            groupId: group.id,
            cacheKey: group.cacheKey,
            patternCount: patterns.length,
            characteristics: group.characteristics,
          });

          this.emit('group_created', group);
        }

        // Remove processed candidate
        this.patternCandidates.delete(key);
      } catch (error) {
        this.logger.error('Failed to create pattern group', { error, key });
      }
    }
  }

  /**
   * Update existing groups with event data
   */
  private async updateExistingGroups(events: ContextEvent[]): Promise<void> {
    for (const event of events) {
      const characteristics = this.inferCharacteristicsFromEvent(event);
      const group = await this.groupManager.findBestGroup(event.data.text, characteristics);

      if (group) {
        await this.groupManager.updateGroupUsage(group.id, event.data.text);
      }
    }
  }

  /**
   * Generate candidate key from text
   */
  private generateCandidateKey(text: string): string {
    // Normalize text and create key
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/).slice(0, 5).join('_');
    return words.substring(0, 50);
  }

  /**
   * Map event type to source
   */
  private mapEventTypeToSource(type: ContextEvent['type']): PatternCandidate['source'] {
    switch (type) {
      case 'query':
      case 'response':
        return 'query';
      case 'conversation_update':
        return 'conversation';
      case 'document_indexed':
        return 'document';
      default:
        return 'query';
    }
  }

  /**
   * Infer characteristics from candidate
   */
  private inferCharacteristics(candidate: PatternCandidate): {
    domain?: string;
    intent?: string;
    complexity?: 'simple' | 'medium' | 'complex';
  } {
    const text = candidate.texts.join(' ');
    const avgLength = candidate.texts.reduce((sum, t) => sum + t.length, 0) / candidate.texts.length;

    return {
      domain: candidate.metadata.domain,
      intent: candidate.metadata.intent,
      complexity: avgLength < 100 ? 'simple' : avgLength < 300 ? 'medium' : 'complex',
    };
  }

  /**
   * Infer characteristics from event
   */
  private inferCharacteristicsFromEvent(event: ContextEvent): {
    domain?: string;
    intent?: string;
  } {
    return {
      domain: event.data.metadata.domain,
      intent: event.data.metadata.intent,
    };
  }

  /**
   * Get system statistics
   */
  getStats(): {
    bufferSize: number;
    candidatesCount: number;
    isProcessing: boolean;
    groupStats: ReturnType<PatternGroupManager['getStats']>;
  } {
    return {
      bufferSize: this.eventBuffer.length,
      candidatesCount: this.patternCandidates.size,
      isProcessing: this.isProcessing,
      groupStats: this.groupManager.getStats(),
    };
  }
}

export const createContextEventSystem = (groupManager: PatternGroupManager, logger: Logger) => {
  return new ContextEventSystem(groupManager, logger);
};

