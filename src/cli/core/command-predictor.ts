import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

// 📊 Command Prediction Schemas
const CommandEntry = z.object({
    command: z.string(),
    timestamp: z.number(),
    context: z.object({
        directory: z.string().optional(),
        gitBranch: z.string().optional(),
        openFiles: z.array(z.string()).optional(),
        projectType: z.string().optional()
    }).optional(),
    success: z.boolean().default(true),
    executionTime: z.number().optional(),
    frequency: z.number().default(1)
});

const CommandPattern = z.object({
    pattern: z.string(),
    commands: z.array(z.string()),
    confidence: z.number(),
    lastUsed: z.number(),
    context: z.string().optional()
});

const PredictionResult = z.object({
    command: z.string(),
    confidence: z.number(),
    reason: z.string(),
    category: z.enum(['recent', 'frequent', 'contextual', 'pattern', 'similar']),
    estimated_time: z.number().optional(),
    requires_approval: z.boolean().default(false)
});

type CommandEntry = z.infer<typeof CommandEntry>;
type CommandPattern = z.infer<typeof CommandPattern>;
type PredictionResult = z.infer<typeof PredictionResult>;

export class CommandPredictor {
    private commandHistory: CommandEntry[] = [];
    private commandPatterns: CommandPattern[] = [];
    private historyFile: string;
    private patternsFile: string;
    private maxHistorySize = 1000;
    private maxPatterns = 100;

    constructor() {
        const configDir = join(homedir(), '.nikcli');
        this.historyFile = join(configDir, 'command-history.json');
        this.patternsFile = join(configDir, 'command-patterns.json');
        
        this.loadHistory();
        this.loadPatterns();
        this.startPatternLearning();
    }

    /**
     * 🎯 Predict next commands based on current input and context
     */
    predictCommands(
        partialInput: string,
        context?: {
            directory?: string;
            gitBranch?: string;
            openFiles?: string[];
            projectType?: string;
        }
    ): PredictionResult[] {
        const predictions: PredictionResult[] = [];

        // 1. Recent commands prediction
        const recentPredictions = this.predictFromRecent(partialInput, context);
        predictions.push(...recentPredictions);

        // 2. Frequent commands prediction
        const frequentPredictions = this.predictFromFrequency(partialInput, context);
        predictions.push(...frequentPredictions);

        // 3. Contextual predictions
        const contextualPredictions = this.predictFromContext(partialInput, context);
        predictions.push(...contextualPredictions);

        // 4. Pattern-based predictions
        const patternPredictions = this.predictFromPatterns(partialInput, context);
        predictions.push(...patternPredictions);

        // 5. Similarity-based predictions
        const similarPredictions = this.predictFromSimilarity(partialInput, context);
        predictions.push(...similarPredictions);

        // Deduplicate and sort by confidence
        const uniquePredictions = this.deduplicateAndRank(predictions);

        return uniquePredictions.slice(0, 5); // Return top 5 predictions
    }

    /**
     * 📈 Learn from command execution
     */
    recordCommand(
        command: string,
        context?: {
            directory?: string;
            gitBranch?: string;
            openFiles?: string[];
            projectType?: string;
        },
        success: boolean = true,
        executionTime?: number
    ): void {
        const entry: CommandEntry = {
            command,
            timestamp: Date.now(),
            context,
            success,
            executionTime,
            frequency: 1
        };

        // Check if command already exists recently
        const existingIndex = this.commandHistory.findIndex(
            (h, index) => h.command === command && index < 10 // Recent 10 commands
        );

        if (existingIndex >= 0) {
            // Update frequency for recent duplicate
            this.commandHistory[existingIndex].frequency++;
            this.commandHistory[existingIndex].timestamp = Date.now();
        } else {
            // Add new command
            this.commandHistory.unshift(entry);
        }

        // Maintain history size
        if (this.commandHistory.length > this.maxHistorySize) {
            this.commandHistory = this.commandHistory.slice(0, this.maxHistorySize);
        }

        // Update patterns
        this.updatePatterns(command, context);

        // Save to file
        this.saveHistory();
    }

    /**
     * 🔄 Get command suggestions for autocomplete
     */
    getSuggestions(
        partialInput: string,
        limit: number = 10
    ): string[] {
        const predictions = this.predictCommands(partialInput);
        return predictions
            .filter(p => p.command.toLowerCase().startsWith(partialInput.toLowerCase()))
            .slice(0, limit)
            .map(p => p.command);
    }

    /**
     * 📊 Get command statistics
     */
    getCommandStats(): {
        totalCommands: number;
        uniqueCommands: number;
        mostFrequent: { command: string; count: number }[];
        recentActivity: CommandEntry[];
    } {
        const commandCounts = new Map<string, number>();
        
        this.commandHistory.forEach(entry => {
            const count = commandCounts.get(entry.command) || 0;
            commandCounts.set(entry.command, count + entry.frequency);
        });

        const mostFrequent = Array.from(commandCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([command, count]) => ({ command, count }));

        return {
            totalCommands: this.commandHistory.length,
            uniqueCommands: commandCounts.size,
            mostFrequent,
            recentActivity: this.commandHistory.slice(0, 20)
        };
    }

    // Prediction Methods

    private predictFromRecent(
        partialInput: string,
        context?: any
    ): PredictionResult[] {
        const recentCommands = this.commandHistory.slice(0, 20);
        const predictions: PredictionResult[] = [];

        recentCommands.forEach((entry, index) => {
            if (this.matchesPartialInput(entry.command, partialInput)) {
                const recencyScore = Math.max(0.1, 1 - (index / 20));
                const contextScore = this.calculateContextMatch(entry.context, context);
                const confidence = (recencyScore * 0.7 + contextScore * 0.3);

                if (confidence > 0.3) {
                    predictions.push({
                        command: entry.command,
                        confidence,
                        reason: `Recent command (${index + 1} commands ago)`,
                        category: 'recent',
                        estimated_time: entry.executionTime,
                        requires_approval: this.requiresApproval(entry.command)
                    });
                }
            }
        });

        return predictions;
    }

    private predictFromFrequency(
        partialInput: string,
        context?: any
    ): PredictionResult[] {
        const commandFrequency = new Map<string, { count: number; entry: CommandEntry }>();

        this.commandHistory.forEach(entry => {
            if (this.matchesPartialInput(entry.command, partialInput)) {
                const existing = commandFrequency.get(entry.command);
                if (existing) {
                    existing.count += entry.frequency;
                } else {
                    commandFrequency.set(entry.command, { count: entry.frequency, entry });
                }
            }
        });

        const maxCount = Math.max(...Array.from(commandFrequency.values()).map(v => v.count));
        const predictions: PredictionResult[] = [];

        commandFrequency.forEach(({ count, entry }, command) => {
            const frequencyScore = count / maxCount;
            const contextScore = this.calculateContextMatch(entry.context, context);
            const confidence = (frequencyScore * 0.8 + contextScore * 0.2);

            if (confidence > 0.4) {
                predictions.push({
                    command,
                    confidence,
                    reason: `Frequently used (${count} times)`,
                    category: 'frequent',
                    estimated_time: entry.executionTime,
                    requires_approval: this.requiresApproval(command)
                });
            }
        });

        return predictions;
    }

    private predictFromContext(
        partialInput: string,
        context?: any
    ): PredictionResult[] {
        if (!context) return [];

        const predictions: PredictionResult[] = [];
        const contextualCommands = this.commandHistory.filter(entry => {
            if (!entry.context) return false;
            return this.calculateContextMatch(entry.context, context) > 0.7;
        });

        contextualCommands.forEach(entry => {
            if (this.matchesPartialInput(entry.command, partialInput)) {
                const contextScore = this.calculateContextMatch(entry.context, context);
                
                predictions.push({
                    command: entry.command,
                    confidence: contextScore,
                    reason: `Contextually relevant (${this.getContextDescription(context)})`,
                    category: 'contextual',
                    estimated_time: entry.executionTime,
                    requires_approval: this.requiresApproval(entry.command)
                });
            }
        });

        return predictions;
    }

    private predictFromPatterns(
        partialInput: string,
        context?: any
    ): PredictionResult[] {
        const predictions: PredictionResult[] = [];

        this.commandPatterns.forEach(pattern => {
            if (this.matchesPartialInput(pattern.pattern, partialInput)) {
                pattern.commands.forEach(command => {
                    if (this.matchesPartialInput(command, partialInput)) {
                        const ageScore = Math.max(0.1, 1 - ((Date.now() - pattern.lastUsed) / (7 * 24 * 60 * 60 * 1000)));
                        const confidence = pattern.confidence * ageScore;

                        if (confidence > 0.3) {
                            predictions.push({
                                command,
                                confidence,
                                reason: `Pattern match: ${pattern.pattern}`,
                                category: 'pattern',
                                requires_approval: this.requiresApproval(command)
                            });
                        }
                    }
                });
            }
        });

        return predictions;
    }

    private predictFromSimilarity(
        partialInput: string,
        context?: any
    ): PredictionResult[] {
        const predictions: PredictionResult[] = [];
        const inputWords = partialInput.toLowerCase().split(' ');

        this.commandHistory.forEach(entry => {
            const commandWords = entry.command.toLowerCase().split(' ');
            const similarity = this.calculateSimilarity(inputWords, commandWords);

            if (similarity > 0.5) {
                const contextScore = this.calculateContextMatch(entry.context, context);
                const confidence = (similarity * 0.6 + contextScore * 0.4);

                if (confidence > 0.3) {
                    predictions.push({
                        command: entry.command,
                        confidence,
                        reason: `Similar to input (${Math.round(similarity * 100)}% match)`,
                        category: 'similar',
                        estimated_time: entry.executionTime,
                        requires_approval: this.requiresApproval(entry.command)
                    });
                }
            }
        });

        return predictions;
    }

    // Helper Methods

    private matchesPartialInput(command: string, partialInput: string): boolean {
        if (!partialInput.trim()) return true;
        return command.toLowerCase().includes(partialInput.toLowerCase()) ||
               command.toLowerCase().startsWith(partialInput.toLowerCase());
    }

    private calculateContextMatch(entryContext?: any, currentContext?: any): number {
        if (!entryContext || !currentContext) return 0.5;

        let matches = 0;
        let total = 0;

        // Directory match
        if (entryContext.directory && currentContext.directory) {
            total++;
            if (entryContext.directory === currentContext.directory) matches++;
        }

        // Git branch match
        if (entryContext.gitBranch && currentContext.gitBranch) {
            total++;
            if (entryContext.gitBranch === currentContext.gitBranch) matches++;
        }

        // Project type match
        if (entryContext.projectType && currentContext.projectType) {
            total++;
            if (entryContext.projectType === currentContext.projectType) matches++;
        }

        // Open files match
        if (entryContext.openFiles && currentContext.openFiles) {
            total++;
            const commonFiles = entryContext.openFiles.filter((file: string) =>
                currentContext.openFiles?.includes(file)
            );
            if (commonFiles.length > 0) matches += commonFiles.length / Math.max(entryContext.openFiles.length, currentContext.openFiles.length);
        }

        return total > 0 ? matches / total : 0.5;
    }

    private calculateSimilarity(words1: string[], words2: string[]): number {
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    private requiresApproval(command: string): boolean {
        const dangerousCommands = ['rm', 'delete', 'drop', 'truncate', 'destroy', 'kill'];
        return dangerousCommands.some(dangerous => command.toLowerCase().includes(dangerous));
    }

    private getContextDescription(context: any): string {
        const parts = [];
        if (context.projectType) parts.push(context.projectType);
        if (context.gitBranch) parts.push(`branch: ${context.gitBranch}`);
        if (context.directory) parts.push(`dir: ${context.directory.split('/').pop()}`);
        return parts.join(', ') || 'current context';
    }

    private deduplicateAndRank(predictions: PredictionResult[]): PredictionResult[] {
        const commandMap = new Map<string, PredictionResult>();

        predictions.forEach(prediction => {
            const existing = commandMap.get(prediction.command);
            if (!existing || prediction.confidence > existing.confidence) {
                commandMap.set(prediction.command, prediction);
            }
        });

        return Array.from(commandMap.values())
            .sort((a, b) => b.confidence - a.confidence);
    }

    // Pattern Learning

    private updatePatterns(command: string, context?: any): void {
        // Extract command pattern (first word or command prefix)
        const commandParts = command.split(' ');
        const pattern = commandParts[0];

        // Find or create pattern
        let existingPattern = this.commandPatterns.find(p => p.pattern === pattern);
        
        if (!existingPattern) {
            existingPattern = {
                pattern,
                commands: [],
                confidence: 0.1,
                lastUsed: Date.now(),
                context: context?.projectType
            };
            this.commandPatterns.push(existingPattern);
        }

        // Update pattern
        if (!existingPattern.commands.includes(command)) {
            existingPattern.commands.push(command);
        }
        existingPattern.confidence = Math.min(1.0, existingPattern.confidence + 0.1);
        existingPattern.lastUsed = Date.now();

        // Maintain patterns size
        if (this.commandPatterns.length > this.maxPatterns) {
            this.commandPatterns = this.commandPatterns
                .sort((a, b) => b.lastUsed - a.lastUsed)
                .slice(0, this.maxPatterns);
        }

        this.savePatterns();
    }

    private startPatternLearning(): void {
        // Analyze existing history for patterns
        const commandGroups = new Map<string, string[]>();

        this.commandHistory.forEach(entry => {
            const pattern = entry.command.split(' ')[0];
            if (!commandGroups.has(pattern)) {
                commandGroups.set(pattern, []);
            }
            commandGroups.get(pattern)!.push(entry.command);
        });

        commandGroups.forEach((commands, pattern) => {
            if (commands.length > 2) { // Only patterns with multiple occurrences
                const uniqueCommands = [...new Set(commands)];
                const confidence = Math.min(1.0, uniqueCommands.length / 10);

                this.commandPatterns.push({
                    pattern,
                    commands: uniqueCommands,
                    confidence,
                    lastUsed: Date.now()
                });
            }
        });
    }

    // Persistence Methods

    private loadHistory(): void {
        try {
            if (existsSync(this.historyFile)) {
                const data = readFileSync(this.historyFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.commandHistory = parsed.map((entry: any) => CommandEntry.parse(entry));
            }
        } catch (error) {
            console.warn(chalk.yellow('Failed to load command history:', error));
            this.commandHistory = [];
        }
    }

    private saveHistory(): void {
        try {
            const dir = this.historyFile.substring(0, this.historyFile.lastIndexOf('/'));
            if (!existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.historyFile, JSON.stringify(this.commandHistory, null, 2));
        } catch (error) {
            console.warn(chalk.yellow('Failed to save command history:', error));
        }
    }

    private loadPatterns(): void {
        try {
            if (existsSync(this.patternsFile)) {
                const data = readFileSync(this.patternsFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.commandPatterns = parsed.map((pattern: any) => CommandPattern.parse(pattern));
            }
        } catch (error) {
            console.warn(chalk.yellow('Failed to load command patterns:', error));
            this.commandPatterns = [];
        }
    }

    private savePatterns(): void {
        try {
            const dir = this.patternsFile.substring(0, this.patternsFile.lastIndexOf('/'));
            if (!existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.patternsFile, JSON.stringify(this.commandPatterns, null, 2));
        } catch (error) {
            console.warn(chalk.yellow('Failed to save command patterns:', error));
        }
    }

    /**
     * 🧹 Clear history and patterns
     */
    public clearHistory(): void {
        this.commandHistory = [];
        this.commandPatterns = [];
        this.saveHistory();
        this.savePatterns();
    }

    /**
     * 📤 Export data for analysis
     */
    public exportData(): { history: CommandEntry[]; patterns: CommandPattern[] } {
        return {
            history: this.commandHistory,
            patterns: this.commandPatterns
        };
    }
}

export const commandPredictor = new CommandPredictor();