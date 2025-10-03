/**
 * PNG Chart Exporter
 * Generates static PNG charts using chartjs-node-canvas
 * Falls back gracefully if native canvas binding is unavailable
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { BenchmarkSession } from '../types'
import { advancedUI } from '../../ui/advanced-cli-ui'

export class PNGExporter {
    private width = 1200
    private height = 600
    // Using any to avoid hard dependency on types when module is not installed
    private chartJSNodeCanvas: any | null = null
    private available: boolean = false

    constructor(width = 1200, height = 600) {
        this.width = width
        this.height = height

        try {
            // Dynamically require to avoid crashing when native canvas isn't present
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require('chartjs-node-canvas')
            const ChartJSNodeCanvas = mod.ChartJSNodeCanvas || mod.default?.ChartJSNodeCanvas || mod.default
            this.chartJSNodeCanvas = new ChartJSNodeCanvas({
                width,
                height,
                backgroundColour: '#0a0a0a',
            })
            this.available = true
        } catch (_err) {
            this.available = false
            advancedUI.logWarning(
                'PNG export disabled: native canvas binding not available. Skipping chart image generation.'
            )
        }
    }

    /**
     * Export all charts for a session
     */
    async exportAll(session: BenchmarkSession, outputDir: string): Promise<void> {
        if (!this.available || !this.chartJSNodeCanvas) return
        await fs.mkdir(outputDir, { recursive: true })

        await Promise.all([
            this.exportLatencyChart(session, path.join(outputDir, 'latency.png')),
            this.exportSuccessChart(session, path.join(outputDir, 'success-rate.png')),
            this.exportTokensChart(session, path.join(outputDir, 'tokens.png')),
            this.exportResourcesChart(session, path.join(outputDir, 'resources.png')),
            this.exportAccuracyChart(session, path.join(outputDir, 'accuracy.png')),
        ])
    }

    /**
     * Export latency line chart
     */
    async exportLatencyChart(session: BenchmarkSession, outputPath: string): Promise<void> {
        const m = session.metrics

        const configuration: any = {
            type: 'line',
            data: {
                labels: m.latency.values.map((_, i) => (i + 1).toString()),
                datasets: [
                    {
                        label: 'Latency (ms)',
                        data: m.latency.values,
                        borderColor: '#00d9ff',
                        backgroundColor: 'rgba(0, 217, 255, 0.1)',
                        tension: 0.4,
                        fill: true,
                    },
                    {
                        label: 'P95',
                        data: new Array(m.latency.values.length).fill(m.latency.p95),
                        borderColor: '#ff4444',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                ],
            },
            options: {
                ...this.getBaseOptions(),
                plugins: {
                    title: {
                        display: true,
                        text: 'Latency Over Time',
                        color: '#e0e0e0',
                        font: { size: 24, weight: 'bold' },
                    },
                    legend: {
                        labels: { color: '#e0e0e0', font: { size: 14 } },
                    },
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Latency (ms)', color: '#e0e0e0' },
                        ticks: { color: '#e0e0e0' },
                        grid: { color: '#333' },
                    },
                    x: {
                        title: { display: true, text: 'Task Number', color: '#e0e0e0' },
                        ticks: { color: '#e0e0e0', maxTicksLimit: 20 },
                        grid: { color: '#333' },
                    },
                },
            },
        }

        if (!this.chartJSNodeCanvas) return
        const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration)
        await fs.writeFile(outputPath, buffer)
    }

    /**
     * Export success rate pie chart
     */
    async exportSuccessChart(session: BenchmarkSession, outputPath: string): Promise<void> {
        const m = session.metrics

        const configuration: any = {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [
                    {
                        data: [m.success.passed, m.success.failed],
                        backgroundColor: ['#00ff88', '#ff4444'],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Success Rate: ${(m.success.rate * 100).toFixed(2)}%`,
                        color: '#e0e0e0',
                        font: { size: 24, weight: 'bold' },
                    },
                    legend: {
                        position: 'bottom',
                        labels: { color: '#e0e0e0', font: { size: 16 }, padding: 20 },
                    },
                },
            },
        }

        if (!this.chartJSNodeCanvas) return
        const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration)
        await fs.writeFile(outputPath, buffer)
    }

    /**
     * Export tokens bar chart
     */
    async exportTokensChart(session: BenchmarkSession, outputPath: string): Promise<void> {
        const m = session.metrics

        const configuration: any = {
            type: 'bar',
            data: {
                labels: ['Input Tokens', 'Output Tokens'],
                datasets: [
                    {
                        label: 'Tokens',
                        data: [m.tokens.totalInput, m.tokens.totalOutput],
                        backgroundColor: ['#00d9ff', '#00ff88'],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                ...this.getBaseOptions(),
                plugins: {
                    title: {
                        display: true,
                        text: `Token Usage: ${m.tokens.total.toLocaleString()} Total`,
                        color: '#e0e0e0',
                        font: { size: 24, weight: 'bold' },
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Token Count', color: '#e0e0e0' },
                        ticks: { color: '#e0e0e0' },
                        grid: { color: '#333' },
                    },
                    x: {
                        ticks: { color: '#e0e0e0' },
                        grid: { display: false },
                    },
                },
            },
        }

        if (!this.chartJSNodeCanvas) return
        const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration)
        await fs.writeFile(outputPath, buffer)
    }

    /**
     * Export resources radar chart
     */
    async exportResourcesChart(session: BenchmarkSession, outputPath: string): Promise<void> {
        const m = session.metrics

        const configuration: any = {
            type: 'radar',
            data: {
                labels: ['Memory Peak (MB)', 'Memory Avg (MB)', 'CPU Peak (%)', 'CPU Avg (%)'],
                datasets: [
                    {
                        label: 'Resource Usage',
                        data: [
                            (m.resources.memoryPeak / 1024 / 1024).toFixed(2),
                            (m.resources.memoryAvg / 1024 / 1024).toFixed(2),
                            m.resources.cpuPeak.toFixed(2),
                            m.resources.cpuAvg.toFixed(2),
                        ],
                        backgroundColor: 'rgba(0, 217, 255, 0.2)',
                        borderColor: '#00d9ff',
                        borderWidth: 2,
                        pointBackgroundColor: '#00d9ff',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#00d9ff',
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Resource Usage',
                        color: '#e0e0e0',
                        font: { size: 24, weight: 'bold' },
                    },
                    legend: {
                        labels: { color: '#e0e0e0', font: { size: 14 } },
                    },
                },
                scales: {
                    r: {
                        angleLines: { color: '#333' },
                        grid: { color: '#333' },
                        pointLabels: { color: '#e0e0e0', font: { size: 12 } },
                        ticks: { color: '#e0e0e0', backdropColor: 'transparent' },
                    },
                },
            },
        }

        if (!this.chartJSNodeCanvas) return
        const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration)
        await fs.writeFile(outputPath, buffer)
    }

    /**
     * Export accuracy histogram
     */
    async exportAccuracyChart(session: BenchmarkSession, outputPath: string): Promise<void> {
        const m = session.metrics

        // Create histogram bins
        const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
        const counts = new Array(bins.length - 1).fill(0)

        for (const value of m.accuracy.values) {
            for (let i = 0; i < bins.length - 1; i++) {
                if (value >= bins[i] && value < bins[i + 1]) {
                    counts[i]++
                    break
                }
            }
        }

        const configuration: any = {
            type: 'bar',
            data: {
                labels: ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'],
                datasets: [
                    {
                        label: 'Task Count',
                        data: counts,
                        backgroundColor: [
                            '#ff4444',
                            '#ff8844',
                            '#ffbb44',
                            '#88ff44',
                            '#00ff88',
                        ],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                ...this.getBaseOptions(),
                plugins: {
                    title: {
                        display: true,
                        text: `Accuracy Distribution (Avg: ${(m.accuracy.avg * 100).toFixed(2)}%)`,
                        color: '#e0e0e0',
                        font: { size: 24, weight: 'bold' },
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Number of Tasks', color: '#e0e0e0' },
                        ticks: { color: '#e0e0e0', stepSize: 1 },
                        grid: { color: '#333' },
                    },
                    x: {
                        title: { display: true, text: 'Accuracy Range', color: '#e0e0e0' },
                        ticks: { color: '#e0e0e0' },
                        grid: { display: false },
                    },
                },
            },
        }

        const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration)
        await fs.writeFile(outputPath, buffer)
    }

    /**
     * Get base chart options
     */
    private getBaseOptions(): any {
        return {
            responsive: true,
            animation: false,
        }
    }
}

