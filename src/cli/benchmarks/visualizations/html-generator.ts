/**
 * HTML Report Generator
 * Generates interactive HTML reports with Chart.js visualizations
 */

import fs from 'node:fs/promises'
import type { BenchmarkSession } from '../types'

export class HTMLGenerator {
  /**
   * Generate complete HTML report
   */
  async generateReport(session: BenchmarkSession, outputPath: string): Promise<void> {
    const html = this.buildHTML(session)
    await fs.writeFile(outputPath, html, 'utf-8')
  }

  /**
   * Build complete HTML document
   */
  private buildHTML(session: BenchmarkSession): string {
    const m = session.metrics

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benchmark Report - ${session.id}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #00d9ff; margin-bottom: 10px; font-size: 2.5em; }
        h2 { color: #00d9ff; margin: 30px 0 15px; font-size: 1.8em; border-bottom: 2px solid #00d9ff; padding-bottom: 10px; }
        h3 { color: #00bfff; margin: 20px 0 10px; font-size: 1.3em; }
        .header { background: #1a1a1a; padding: 30px; border-radius: 10px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 20px; }
        .meta-item { background: #2a2a2a; padding: 15px; border-radius: 5px; border-left: 3px solid #00d9ff; }
        .meta-label { color: #888; font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px; }
        .meta-value { color: #fff; font-size: 1.2em; font-weight: 600; margin-top: 5px; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 0.9em; font-weight: 600; }
        .status.completed { background: #00ff88; color: #000; }
        .status.running { background: #0088ff; color: #fff; }
        .status.failed { background: #ff4444; color: #fff; }
        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 30px; margin: 30px 0; }
        .chart-container { background: #1a1a1a; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .chart-wrapper { position: relative; height: 350px; }
        table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 10px; overflow: hidden; margin: 20px 0; }
        th { background: #2a2a2a; color: #00d9ff; padding: 15px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 0.85em; letter-spacing: 1px; }
        td { padding: 15px; border-top: 1px solid #2a2a2a; }
        tr:hover { background: #222; }
        .success { color: #00ff88; }
        .failure { color: #ff4444; }
        .metric-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); padding: 25px; border-radius: 10px; border: 1px solid #333; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .metric-card-title { color: #888; font-size: 0.9em; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .metric-card-value { color: #00d9ff; font-size: 2.5em; font-weight: 700; }
        .metric-card-unit { color: #666; font-size: 0.9em; margin-left: 5px; }
        .footer { text-align: center; margin-top: 50px; padding: 20px; color: #666; font-size: 0.9em; border-top: 1px solid #333; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Benchmark Report</h1>
            <p style="color: #888; margin-top: 10px;">Session: <code style="background: #2a2a2a; padding: 5px 10px; border-radius: 3px;">${session.id}</code></p>
            <div class="metadata">
                <div class="meta-item">
                    <div class="meta-label">Template</div>
                    <div class="meta-value">${session.template}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Model</div>
                    <div class="meta-value">${session.model}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Status</div>
                    <div class="meta-value"><span class="status ${session.status}">${session.status}</span></div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Duration</div>
                    <div class="meta-value">${m.timing.duration ? (m.timing.duration / 1000).toFixed(2) + 's' : 'N/A'}</div>
                </div>
            </div>
        </div>

        <h2>📊 Performance Overview</h2>
        <div class="metric-cards">
            <div class="metric-card">
                <div class="metric-card-title">Success Rate</div>
                <div class="metric-card-value">${(m.success.rate * 100).toFixed(1)}<span class="metric-card-unit">%</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-card-title">Avg Latency</div>
                <div class="metric-card-value">${m.latency.avg.toFixed(0)}<span class="metric-card-unit">ms</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-card-title">Total Tokens</div>
                <div class="metric-card-value">${(m.tokens.total / 1000).toFixed(1)}<span class="metric-card-unit">K</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-card-title">Total Cost</div>
                <div class="metric-card-value">$${m.cost.total.toFixed(3)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-card-title">Accuracy</div>
                <div class="metric-card-value">${(m.accuracy.avg * 100).toFixed(1)}<span class="metric-card-unit">%</span></div>
            </div>
            <div class="metric-card">
                <div class="metric-card-title">Error Rate</div>
                <div class="metric-card-value">${(m.errors.rate * 100).toFixed(1)}<span class="metric-card-unit">%</span></div>
            </div>
        </div>

        <h2>📈 Visualizations</h2>
        <div class="charts-grid">
            <div class="chart-container">
                <h3>Latency Distribution</h3>
                <div class="chart-wrapper"><canvas id="latencyChart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Success vs Failures</h3>
                <div class="chart-wrapper"><canvas id="successChart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Token Usage</h3>
                <div class="chart-wrapper"><canvas id="tokensChart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Resource Usage</h3>
                <div class="chart-wrapper"><canvas id="resourcesChart"></canvas></div>
            </div>
        </div>

        <h2>📋 Detailed Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Task ID</th>
                    <th>Status</th>
                    <th>Time (ms)</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Accuracy</th>
                </tr>
            </thead>
            <tbody>
                ${session.tasks
                  .map(
                    (t) => `
                <tr>
                    <td><code>${t.taskId}</code></td>
                    <td class="${t.success ? 'success' : 'failure'}">${t.success ? '✓ Pass' : '✗ Fail'}</td>
                    <td>${t.executionTime.toFixed(2)}</td>
                    <td>${t.tokensUsed.total.toLocaleString()}</td>
                    <td>$${t.cost.toFixed(4)}</td>
                    <td>${t.accuracy ? (t.accuracy * 100).toFixed(1) + '%' : 'N/A'}</td>
                </tr>
                `
                  )
                  .join('')}
            </tbody>
        </table>

        <div class="footer">
            <p>Generated by NikCLI Benchmark System</p>
            <p>Report generated at ${new Date().toISOString()}</p>
        </div>
    </div>

    <script>
        const chartConfig = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } }
            },
            scales: {
                y: { ticks: { color: '#e0e0e0' }, grid: { color: '#333' } },
                x: { ticks: { color: '#e0e0e0' }, grid: { color: '#333' } }
            }
        };

        // Latency chart
        new Chart(document.getElementById('latencyChart'), {
            type: 'line',
            data: {
                labels: ${JSON.stringify(m.latency.values.map((_, i) => i + 1))},
                datasets: [{
                    label: 'Latency (ms)',
                    data: ${JSON.stringify(m.latency.values)},
                    borderColor: '#00d9ff',
                    backgroundColor: 'rgba(0, 217, 255, 0.1)',
                    tension: 0.4
                }]
            },
            options: chartConfig
        });

        // Success chart
        new Chart(document.getElementById('successChart'), {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [${m.success.passed}, ${m.success.failed}],
                    backgroundColor: ['#00ff88', '#ff4444']
                }]
            },
            options: { ...chartConfig, scales: undefined }
        });

        // Tokens chart
        new Chart(document.getElementById('tokensChart'), {
            type: 'bar',
            data: {
                labels: ['Input', 'Output'],
                datasets: [{
                    label: 'Tokens',
                    data: [${m.tokens.totalInput}, ${m.tokens.totalOutput}],
                    backgroundColor: ['#00d9ff', '#00ff88']
                }]
            },
            options: chartConfig
        });

        // Resources chart
        new Chart(document.getElementById('resourcesChart'), {
            type: 'radar',
            data: {
                labels: ['Memory Peak', 'Memory Avg', 'CPU Peak', 'CPU Avg'],
                datasets: [{
                    label: 'Resource Usage',
                    data: [
                        ${(m.resources.memoryPeak / 1024 / 1024).toFixed(2)},
                        ${(m.resources.memoryAvg / 1024 / 1024).toFixed(2)},
                        ${m.resources.cpuPeak.toFixed(2)},
                        ${m.resources.cpuAvg.toFixed(2)}
                    ],
                    backgroundColor: 'rgba(0, 217, 255, 0.2)',
                    borderColor: '#00d9ff'
                }]
            },
            options: { ...chartConfig, scales: { r: { ticks: { color: '#e0e0e0' }, grid: { color: '#333' } } } }
        });
    </script>
</body>
</html>`
  }
}
