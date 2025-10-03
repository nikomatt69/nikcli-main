/**
 * Results Manager for benchmark system
 * Handles local JSON storage, session management, and exports
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import type { BenchmarkSession, BenchmarkComparisonResult } from './types'
import { format } from 'fast-csv'

export class ResultsManager {
	private resultsDir: string
	private sessionsDir: string
	private indexPath: string

	constructor(baseDir = './benchmarks/results') {
		this.resultsDir = baseDir
		this.sessionsDir = path.join(baseDir, 'sessions')
		this.indexPath = path.join(baseDir, 'index.json')
	}

	/**
	 * Initialize results directory structure
	 */
	async initialize(): Promise<void> {
		await fs.mkdir(this.sessionsDir, { recursive: true })
		await fs.mkdir(path.join(this.resultsDir, 'templates'), { recursive: true })
		await fs.mkdir(path.join(this.resultsDir, '../datasets'), { recursive: true })

		// Create index if it doesn't exist
		try {
			await fs.access(this.indexPath)
		} catch {
			await this.saveIndex([])
		}
	}

	/**
	 * Save a benchmark session
	 */
	async saveSession(session: BenchmarkSession): Promise<string> {
		await this.initialize()

		// Create session directory
		const sessionDir = this.getSessionDir(session.id)
		await fs.mkdir(sessionDir, { recursive: true })
		await fs.mkdir(path.join(sessionDir, 'charts'), { recursive: true })

		// Save session metadata
		await fs.writeFile(
			path.join(sessionDir, 'session.json'),
			JSON.stringify(session, null, 2)
		)

		// Save metrics separately for time-series analysis
		await fs.writeFile(
			path.join(sessionDir, 'metrics.json'),
			JSON.stringify(session.metrics, null, 2)
		)

		// Save task results
		await fs.writeFile(
			path.join(sessionDir, 'tasks.json'),
			JSON.stringify(session.tasks, null, 2)
		)

		// Update index
		await this.updateIndex(session)

		return sessionDir
	}

	/**
	 * Load a benchmark session by ID
	 */
	async loadSession(sessionId: string): Promise<BenchmarkSession | null> {
		try {
			const sessionPath = path.join(this.getSessionDir(sessionId), 'session.json')
			const data = await fs.readFile(sessionPath, 'utf-8')
			return JSON.parse(data) as BenchmarkSession
		} catch (error) {
			return null
		}
	}

	/**
	 * Get all sessions from index
	 */
	async getAllSessions(): Promise<BenchmarkSession[]> {
		try {
			const data = await fs.readFile(this.indexPath, 'utf-8')
			return JSON.parse(data) as BenchmarkSession[]
		} catch {
			return []
		}
	}

	/**
	 * Get sessions filtered by template
	 */
	async getSessionsByTemplate(template: string): Promise<BenchmarkSession[]> {
		const all = await this.getAllSessions()
		return all.filter(s => s.template === template)
	}

	/**
	 * Get sessions filtered by model
	 */
	async getSessionsByModel(model: string): Promise<BenchmarkSession[]> {
		const all = await this.getAllSessions()
		return all.filter(s => s.model === model)
	}

	/**
	 * Export session to JSON
	 */
	async exportToJSON(sessionId: string, outputPath: string): Promise<void> {
		const session = await this.loadSession(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}
		await fs.writeFile(outputPath, JSON.stringify(session, null, 2))
	}

	/**
	 * Export session to CSV
	 */
	async exportToCSV(sessionId: string, outputPath: string): Promise<void> {
		const session = await this.loadSession(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		const csvStream = format({ headers: true })
		const writeStream = createWriteStream(outputPath)
		csvStream.pipe(writeStream)

		for (const task of session.tasks) {
			csvStream.write({
				taskId: task.taskId,
				success: task.success,
				executionTime: task.executionTime,
				tokensInput: task.tokensUsed.input,
				tokensOutput: task.tokensUsed.output,
				tokensTotal: task.tokensUsed.total,
				cost: task.cost,
				memoryUsed: task.memoryUsed,
				cpuUsage: task.cpuUsage,
				accuracy: task.accuracy || 0,
				error: task.error || '',
			})
		}

		csvStream.end()

		return new Promise((resolve, reject) => {
			writeStream.on('finish', resolve)
			writeStream.on('error', reject)
		})
	}

	/**
	 * Export session to Markdown
	 */
	async exportToMarkdown(sessionId: string, outputPath: string): Promise<void> {
		const session = await this.loadSession(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		const markdown = this.generateMarkdownReport(session)
		await fs.writeFile(outputPath, markdown)
	}

	/**
	 * Compare two sessions
	 */
	async compareSessions(
		sessionId1: string,
		sessionId2: string
	): Promise<BenchmarkComparisonResult> {
		const session1 = await this.loadSession(sessionId1)
		const session2 = await this.loadSession(sessionId2)

		if (!session1 || !session2) {
			throw new Error('One or both sessions not found')
		}

		const differences = {
			latencyDiff: session1.metrics.latency.avg - session2.metrics.latency.avg,
			tokenDiff: session1.metrics.tokens.total - session2.metrics.tokens.total,
			costDiff: session1.metrics.cost.total - session2.metrics.cost.total,
			successRateDiff: session1.metrics.success.rate - session2.metrics.success.rate,
			accuracyDiff: session1.metrics.accuracy.avg - session2.metrics.accuracy.avg,
		}

		const winner = {
			latency: differences.latencyDiff < 0 ? session1.model : session2.model,
			tokens: differences.tokenDiff < 0 ? session1.model : session2.model,
			cost: differences.costDiff < 0 ? session1.model : session2.model,
			successRate: differences.successRateDiff > 0 ? session1.model : session2.model,
			accuracy: differences.accuracyDiff > 0 ? session1.model : session2.model,
			overall: this.determineOverallWinner([session1, session2]),
		}

		return {
			sessions: [session1, session2],
			differences,
			winner,
		}
	}

	/**
	 * Delete a session
	 */
	async deleteSession(sessionId: string): Promise<void> {
		const sessionDir = this.getSessionDir(sessionId)
		await fs.rm(sessionDir, { recursive: true, force: true })

		// Update index
		const sessions = await this.getAllSessions()
		const filtered = sessions.filter(s => s.id !== sessionId)
		await this.saveIndex(filtered)
	}

	/**
	 * Get session directory path
	 */
	private getSessionDir(sessionId: string): string {
		return path.join(this.sessionsDir, sessionId)
	}

	/**
	 * Update the index with session metadata
	 */
	private async updateIndex(session: BenchmarkSession): Promise<void> {
		const sessions = await this.getAllSessions()
		const existing = sessions.findIndex(s => s.id === session.id)

		if (existing >= 0) {
			sessions[existing] = session
		} else {
			sessions.push(session)
		}

		await this.saveIndex(sessions)
	}

	/**
	 * Save the session index
	 */
	private async saveIndex(sessions: BenchmarkSession[]): Promise<void> {
		await fs.writeFile(this.indexPath, JSON.stringify(sessions, null, 2))
	}

	/**
	 * Generate markdown report from session
	 */
	private generateMarkdownReport(session: BenchmarkSession): string {
		const m = session.metrics
		return `# Benchmark Report: ${session.id}

## Overview
- **Template**: ${session.template}
- **Model**: ${session.model}
- **Status**: ${session.status}
- **Started**: ${session.startTime}
- **Ended**: ${session.endTime || 'In Progress'}
- **Duration**: ${m.timing.duration ? `${(m.timing.duration / 1000).toFixed(2)}s` : 'N/A'}

## Results Summary
- **Total Tasks**: ${session.totalTasks}
- **Completed**: ${session.completedTasks}
- **Failed**: ${session.failedTasks}
- **Success Rate**: ${(m.success.rate * 100).toFixed(2)}%

## Performance Metrics

### Latency
- **Average**: ${m.latency.avg.toFixed(2)}ms
- **Median (P50)**: ${m.latency.p50.toFixed(2)}ms
- **P95**: ${m.latency.p95.toFixed(2)}ms
- **P99**: ${m.latency.p99.toFixed(2)}ms
- **Min**: ${m.latency.min.toFixed(2)}ms
- **Max**: ${m.latency.max.toFixed(2)}ms

### Token Usage
- **Total Tokens**: ${m.tokens.total.toLocaleString()}
- **Input Tokens**: ${m.tokens.totalInput.toLocaleString()}
- **Output Tokens**: ${m.tokens.totalOutput.toLocaleString()}
- **Average per Task**: ${m.tokens.avgPerTask.toFixed(0)}

### Cost
- **Total Cost**: $${m.cost.total.toFixed(4)}
- **Average per Task**: $${m.cost.avgPerTask.toFixed(4)}

### Accuracy
- **Average**: ${(m.accuracy.avg * 100).toFixed(2)}%
- **Min**: ${(m.accuracy.min * 100).toFixed(2)}%
- **Max**: ${(m.accuracy.max * 100).toFixed(2)}%

### Resource Usage
- **Memory Peak**: ${this.formatBytes(m.resources.memoryPeak)}
- **Memory Average**: ${this.formatBytes(m.resources.memoryAvg)}
- **CPU Peak**: ${m.resources.cpuPeak.toFixed(2)}%
- **CPU Average**: ${m.resources.cpuAvg.toFixed(2)}%

### Errors
- **Total Errors**: ${m.errors.total}
- **Error Rate**: ${(m.errors.rate * 100).toFixed(2)}%
${Object.entries(m.errors.byType).length > 0 ? '\n**By Type**:\n' + Object.entries(m.errors.byType).map(([type, count]) => `- ${type}: ${count}`).join('\n') : ''}

## Task Details

| Task ID | Success | Time (ms) | Tokens | Cost | Accuracy |
|---------|---------|-----------|--------|------|----------|
${session.tasks.slice(0, 50).map(t => `| ${t.taskId} | ${t.success ? '✅' : '❌'} | ${t.executionTime.toFixed(2)} | ${t.tokensUsed.total} | $${t.cost.toFixed(4)} | ${t.accuracy ? (t.accuracy * 100).toFixed(2) + '%' : 'N/A'} |`).join('\n')}
${session.tasks.length > 50 ? `\n*... and ${session.tasks.length - 50} more tasks*` : ''}
`
	}

	/**
	 * Format bytes to human readable
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B'
		const k = 1024
		const sizes = ['B', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
	}

	/**
	 * Determine overall winner based on weighted scores
	 */
	private determineOverallWinner(sessions: [BenchmarkSession, BenchmarkSession]): string {
		const [s1, s2] = sessions
		let score1 = 0
		let score2 = 0

		// Success rate (40% weight)
		score1 += s1.metrics.success.rate * 40
		score2 += s2.metrics.success.rate * 40

		// Accuracy (30% weight)
		score1 += s1.metrics.accuracy.avg * 30
		score2 += s2.metrics.accuracy.avg * 30

		// Cost efficiency (15% weight) - inverted
		const maxCost = Math.max(s1.metrics.cost.total, s2.metrics.cost.total)
		score1 += (1 - s1.metrics.cost.total / maxCost) * 15
		score2 += (1 - s2.metrics.cost.total / maxCost) * 15

		// Latency (15% weight) - inverted
		const maxLatency = Math.max(s1.metrics.latency.avg, s2.metrics.latency.avg)
		score1 += (1 - s1.metrics.latency.avg / maxLatency) * 15
		score2 += (1 - s2.metrics.latency.avg / maxLatency) * 15

		return score1 > score2 ? s1.model : s2.model
	}
}

