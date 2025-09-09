import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger';
import { BackgroundAgentInstance } from './background-agent-service';

/**
 * Background Agent Communication System
 * Handles inter-agent communication and coordination
 */
export class BackgroundAgentCommunication extends EventEmitter {
  private static instance: BackgroundAgentCommunication;
  private messageQueue: Map<string, CommunicationMessage[]> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // topic -> agentIds
  private agentTopics: Map<string, Set<string>> = new Map(); // agentId -> topics
  private messageHistory: CommunicationMessage[] = [];
  private maxHistorySize = 1000;

  private constructor() {
    super();
  }

  public static getInstance(): BackgroundAgentCommunication {
    if (!BackgroundAgentCommunication.instance) {
      BackgroundAgentCommunication.instance = new BackgroundAgentCommunication();
    }
    return BackgroundAgentCommunication.instance;
  }

  /**
   * Subscribe an agent to a topic
   */
  public subscribe(agentId: string, topic: string): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(agentId);

    if (!this.agentTopics.has(agentId)) {
      this.agentTopics.set(agentId, new Set());
    }
    this.agentTopics.get(agentId)!.add(topic);

    logger.logService('debug', 'background-agent-communication', `Agent ${agentId} subscribed to topic: ${topic}`);
  }

  /**
   * Unsubscribe an agent from a topic
   */
  public unsubscribe(agentId: string, topic: string): void {
    const topicSubscribers = this.subscriptions.get(topic);
    if (topicSubscribers) {
      topicSubscribers.delete(agentId);
      if (topicSubscribers.size === 0) {
        this.subscriptions.delete(topic);
      }
    }

    const agentTopics = this.agentTopics.get(agentId);
    if (agentTopics) {
      agentTopics.delete(topic);
      if (agentTopics.size === 0) {
        this.agentTopics.delete(agentId);
      }
    }

    logger.logService('debug', 'background-agent-communication', `Agent ${agentId} unsubscribed from topic: ${topic}`);
  }

  /**
   * Publish a message to a topic
   */
  public async publish(topic: string, message: any, fromAgentId: string): Promise<void> {
    const communicationMessage: CommunicationMessage = {
      id: nanoid(),
      topic,
      fromAgentId,
      message,
      timestamp: new Date(),
      delivered: false
    };

    // Add to message history
    this.messageHistory.push(communicationMessage);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }

    // Get subscribers for this topic
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers || subscribers.size === 0) {
      logger.logService('debug', 'background-agent-communication', `No subscribers for topic: ${topic}`);
      return;
    }

    // Queue message for each subscriber
    for (const agentId of subscribers) {
      if (agentId !== fromAgentId) { // Don't send to self
        if (!this.messageQueue.has(agentId)) {
          this.messageQueue.set(agentId, []);
        }
        this.messageQueue.get(agentId)!.push(communicationMessage);
      }
    }

    logger.logService('debug', 'background-agent-communication', `Published message to topic ${topic} for ${subscribers.size} subscribers`);

    // Emit event for real-time processing
    this.emit('message-published', communicationMessage);
  }

  /**
   * Get pending messages for an agent
   */
  public getMessages(agentId: string): CommunicationMessage[] {
    const messages = this.messageQueue.get(agentId) || [];
    return [...messages]; // Return copy
  }

  /**
   * Mark messages as delivered
   */
  public markDelivered(agentId: string, messageIds: string[]): void {
    const messages = this.messageQueue.get(agentId);
    if (!messages) return;

    for (const messageId of messageIds) {
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex !== -1) {
        messages[messageIndex].delivered = true;
        messages.splice(messageIndex, 1); // Remove delivered message
      }
    }

    // Update history
    for (const message of this.messageHistory) {
      if (messageIds.includes(message.id)) {
        message.delivered = true;
      }
    }
  }

  /**
   * Send a direct message to a specific agent
   */
  public async sendDirectMessage(toAgentId: string, message: any, fromAgentId: string): Promise<void> {
    const communicationMessage: CommunicationMessage = {
      id: nanoid(),
      topic: 'direct',
      fromAgentId,
      toAgentId,
      message,
      timestamp: new Date(),
      delivered: false
    };

    // Add to message history
    this.messageHistory.push(communicationMessage);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }

    // Queue message for recipient
    if (!this.messageQueue.has(toAgentId)) {
      this.messageQueue.set(toAgentId, []);
    }
    this.messageQueue.get(toAgentId)!.push(communicationMessage);

    logger.logService('debug', 'background-agent-communication', `Sent direct message from ${fromAgentId} to ${toAgentId}`);

    // Emit event for real-time processing
    this.emit('direct-message-sent', communicationMessage);
  }

  /**
   * Broadcast a message to all agents
   */
  public async broadcast(message: any, fromAgentId: string, excludeSelf: boolean = true): Promise<void> {
    const allAgents = Array.from(this.agentTopics.keys());
    const recipients = excludeSelf ? allAgents.filter(id => id !== fromAgentId) : allAgents;

    for (const agentId of recipients) {
      await this.sendDirectMessage(agentId, message, fromAgentId);
    }

    logger.logService('debug', 'background-agent-communication', `Broadcasted message to ${recipients.length} agents`);
  }

  /**
   * Get communication statistics
   */
  public getStats(): CommunicationStats {
    const totalMessages = this.messageHistory.length;
    const deliveredMessages = this.messageHistory.filter(msg => msg.delivered).length;
    const pendingMessages = Array.from(this.messageQueue.values()).reduce((sum, messages) => sum + messages.length, 0);
    const totalSubscriptions = Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.size, 0);

    return {
      totalMessages,
      deliveredMessages,
      pendingMessages,
      totalSubscriptions,
      activeTopics: this.subscriptions.size,
      activeAgents: this.agentTopics.size,
      deliveryRate: totalMessages > 0 ? deliveredMessages / totalMessages : 0
    };
  }

  /**
   * Get message history for a specific topic
   */
  public getTopicHistory(topic: string, limit: number = 100): CommunicationMessage[] {
    return this.messageHistory
      .filter(msg => msg.topic === topic)
      .slice(-limit);
  }

  /**
   * Get message history for a specific agent
   */
  public getAgentHistory(agentId: string, limit: number = 100): CommunicationMessage[] {
    return this.messageHistory
      .filter(msg => msg.fromAgentId === agentId || msg.toAgentId === agentId)
      .slice(-limit);
  }

  /**
   * Clean up communication data for a specific agent
   */
  public cleanupAgent(agentId: string): void {
    // Remove from all topics
    const topics = this.agentTopics.get(agentId);
    if (topics) {
      for (const topic of topics) {
        this.unsubscribe(agentId, topic);
      }
    }

    // Clear message queue
    this.messageQueue.delete(agentId);

    // Remove from agent topics
    this.agentTopics.delete(agentId);

    logger.logService('debug', 'background-agent-communication', `Cleaned up communication data for agent: ${agentId}`);
  }

  /**
   * Get active topics
   */
  public getActiveTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get subscribers for a topic
   */
  public getTopicSubscribers(topic: string): string[] {
    const subscribers = this.subscriptions.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * Get topics for an agent
   */
  public getAgentTopics(agentId: string): string[] {
    const topics = this.agentTopics.get(agentId);
    return topics ? Array.from(topics) : [];
  }
}

/**
 * Communication Message Interface
 */
export interface CommunicationMessage {
  id: string;
  topic: string;
  fromAgentId: string;
  toAgentId?: string;
  message: any;
  timestamp: Date;
  delivered: boolean;
}

/**
 * Communication Statistics Interface
 */
export interface CommunicationStats {
  totalMessages: number;
  deliveredMessages: number;
  pendingMessages: number;
  totalSubscriptions: number;
  activeTopics: number;
  activeAgents: number;
  deliveryRate: number;
}

/**
 * Background Agent Communication Manager
 * Provides higher-level communication patterns and coordination
 */
export class BackgroundAgentCommunicationManager {
  private communication: BackgroundAgentCommunication;
  private coordinationPatterns: Map<string, CoordinationPattern> = new Map();

  constructor() {
    this.communication = BackgroundAgentCommunication.getInstance();
    this.setupCoordinationPatterns();
  }

  /**
   * Setup common coordination patterns
   */
  private setupCoordinationPatterns(): void {
    // File change coordination
    this.coordinationPatterns.set('file-change', {
      name: 'File Change Coordination',
      description: 'Coordinates file changes between file watcher and other agents',
      topics: ['file-changes', 'code-analysis', 'security-scan'],
      workflow: [
        { step: 'file-watcher', action: 'detect-change', topic: 'file-changes' },
        { step: 'code-analyzer', action: 'analyze-file', topic: 'code-analysis' },
        { step: 'security-scanner', action: 'scan-file', topic: 'security-scan' }
      ]
    });

    // Dependency update coordination
    this.coordinationPatterns.set('dependency-update', {
      name: 'Dependency Update Coordination',
      description: 'Coordinates dependency updates and related tasks',
      topics: ['dependency-updates', 'security-scan', 'test-run'],
      workflow: [
        { step: 'dependency-monitor', action: 'detect-update', topic: 'dependency-updates' },
        { step: 'security-scanner', action: 'scan-dependencies', topic: 'security-scan' },
        { step: 'test-runner', action: 'run-tests', topic: 'test-run' }
      ]
    });

    // Build coordination
    this.coordinationPatterns.set('build-coordination', {
      name: 'Build Coordination',
      description: 'Coordinates build processes and related tasks',
      topics: ['build-start', 'build-complete', 'deploy-ready'],
      workflow: [
        { step: 'build-monitor', action: 'start-build', topic: 'build-start' },
        { step: 'test-runner', action: 'run-tests', topic: 'test-run' },
        { step: 'build-monitor', action: 'complete-build', topic: 'build-complete' }
      ]
    });
  }

  /**
   * Start coordination for a specific pattern
   */
  public async startCoordination(patternName: string, initiatorAgentId: string, data: any): Promise<void> {
    const pattern = this.coordinationPatterns.get(patternName);
    if (!pattern) {
      throw new Error(`Unknown coordination pattern: ${patternName}`);
    }

    logger.logService('info', 'background-agent-communication-manager', `Starting coordination pattern: ${patternName}`, {
      initiatorAgentId,
      pattern: pattern.name
    });

    // Subscribe initiator to all topics in the pattern
    for (const topic of pattern.topics) {
      this.communication.subscribe(initiatorAgentId, topic);
    }

    // Start the workflow
    await this.executeWorkflowStep(pattern.workflow[0], initiatorAgentId, data);
  }

  /**
   * Execute a workflow step
   */
  private async executeWorkflowStep(step: WorkflowStep, agentId: string, data: any): Promise<void> {
    const message = {
      action: step.action,
      data,
      timestamp: new Date(),
      workflowStep: step.step
    };

    await this.communication.publish(step.topic, message, agentId);
  }

  /**
   * Get available coordination patterns
   */
  public getCoordinationPatterns(): CoordinationPattern[] {
    return Array.from(this.coordinationPatterns.values());
  }

  /**
   * Create a custom coordination pattern
   */
  public createCoordinationPattern(
    name: string,
    description: string,
    topics: string[],
    workflow: WorkflowStep[]
  ): void {
    const pattern: CoordinationPattern = {
      name,
      description,
      topics,
      workflow
    };

    this.coordinationPatterns.set(name, pattern);
    logger.logService('info', 'background-agent-communication-manager', `Created coordination pattern: ${name}`);
  }
}

/**
 * Coordination Pattern Interface
 */
export interface CoordinationPattern {
  name: string;
  description: string;
  topics: string[];
  workflow: WorkflowStep[];
}

/**
 * Workflow Step Interface
 */
export interface WorkflowStep {
  step: string;
  action: string;
  topic: string;
}

// Export singleton instances
export const backgroundAgentCommunication = BackgroundAgentCommunication.getInstance();
export const backgroundAgentCommunicationManager = new BackgroundAgentCommunicationManager();