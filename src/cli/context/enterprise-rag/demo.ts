import chalk from 'chalk'
import { enterpriseRAGSystem, type RAGQuery, type QueryContext } from './enterprise-rag-system'

// Enterprise RAG System Demo
// Demonstrates the capabilities of the Enterprise RAG Architecture

async function demonstrateEnterpriseRAG() {
  console.log(chalk.blue.bold('🚀 Enterprise RAG System Demo'))
  console.log(chalk.gray('=' .repeat(50)))

  try {
    // 1. Basic Query Processing
    console.log(chalk.blue('\n📝 1. Basic Query Processing'))
    
    const query: RAGQuery = {
      text: 'How do I implement authentication in this project?',
      context: {
        agentId: 'demo-agent',
        sessionId: 'demo-session-1',
        workspacePath: process.cwd(),
        timestamp: new Date(),
      },
      options: {
        maxResults: 5,
        threshold: 0.3,
        useCache: true,
        useDistributed: true,
      },
    }

    const results = await enterpriseRAGSystem.processQuery(query)
    console.log(chalk.green(`✓ Found ${results.length} relevant results`))
    
    results.forEach((result, index) => {
      console.log(chalk.gray(`  ${index + 1}. [${result.source}] ${result.content.substring(0, 100)}... (score: ${result.score.toFixed(2)})`))
    })

    // 2. System Health Check
    console.log(chalk.blue('\n🏥 2. System Health Check'))
    
    const health = await enterpriseRAGSystem.getSystemHealth()
    console.log(chalk.green(`✓ System Status: ${health.overall}`))
    
    Object.entries(health.components).forEach(([component, status]) => {
      const statusColor = status.status === 'healthy' ? chalk.green : 
                         status.status === 'degraded' ? chalk.yellow : chalk.red
      console.log(chalk.gray(`  ${component}: ${statusColor(status.status)} - ${status.message}`))
    })

    // 3. System Statistics
    console.log(chalk.blue('\n📊 3. System Statistics'))
    
    const stats = enterpriseRAGSystem.getSystemStats()
    console.log(chalk.gray(`  Total Queries: ${stats.totalQueries}`))
    console.log(chalk.gray(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`))
    console.log(chalk.gray(`  Average Response Time: ${stats.averageResponseTime.toFixed(0)}ms`))
    console.log(chalk.gray(`  Distributed Nodes: ${stats.distributedNodes}`))
    console.log(chalk.gray(`  Context Count: ${stats.contextCount}`))

    // 4. System Optimization
    console.log(chalk.blue('\n🔧 4. System Optimization'))
    
    await enterpriseRAGSystem.optimizeSystem()
    console.log(chalk.green('✓ System optimization completed'))

    // 5. Advanced Query with Different Options
    console.log(chalk.blue('\n🎯 5. Advanced Query Processing'))
    
    const advancedQuery: RAGQuery = {
      text: 'What are the main components of the RAG system?',
      context: {
        agentId: 'demo-agent',
        sessionId: 'demo-session-2',
        workspacePath: process.cwd(),
        timestamp: new Date(),
      },
      options: {
        maxResults: 3,
        threshold: 0.5,
        useCache: false, // Force fresh results
        useDistributed: true,
      },
    }

    const advancedResults = await enterpriseRAGSystem.processQuery(advancedQuery)
    console.log(chalk.green(`✓ Found ${advancedResults.length} high-quality results`))
    
    advancedResults.forEach((result, index) => {
      console.log(chalk.gray(`  ${index + 1}. [${result.source}] ${result.content.substring(0, 150)}... (score: ${result.score.toFixed(2)})`))
    })

    // 6. Performance Comparison
    console.log(chalk.blue('\n⚡ 6. Performance Analysis'))
    
    const performanceQueries = [
      'authentication implementation',
      'database connection setup',
      'API endpoint configuration',
      'error handling patterns',
      'testing strategies',
    ]

    const startTime = Date.now()
    const performanceResults = await Promise.all(
      performanceQueries.map(async (queryText) => {
        const perfQuery: RAGQuery = {
          text: queryText,
          context: {
            agentId: 'perf-test',
            sessionId: 'perf-session',
            workspacePath: process.cwd(),
            timestamp: new Date(),
          },
          options: { maxResults: 2, useCache: true },
        }
        return await enterpriseRAGSystem.processQuery(perfQuery)
      })
    )
    const totalTime = Date.now() - startTime

    console.log(chalk.green(`✓ Processed ${performanceQueries.length} queries in ${totalTime}ms`))
    console.log(chalk.gray(`  Average time per query: ${(totalTime / performanceQueries.length).toFixed(0)}ms`))
    console.log(chalk.gray(`  Total results: ${performanceResults.reduce((sum, results) => sum + results.length, 0)}`))

    // 7. Final System Health
    console.log(chalk.blue('\n🏁 7. Final System Health'))
    
    const finalHealth = await enterpriseRAGSystem.getSystemHealth()
    const finalStats = enterpriseRAGSystem.getSystemStats()
    
    console.log(chalk.green(`✓ Final Status: ${finalHealth.overall}`))
    console.log(chalk.gray(`  Total Queries Processed: ${finalStats.totalQueries}`))
    console.log(chalk.gray(`  Final Cache Hit Rate: ${(finalStats.cacheHitRate * 100).toFixed(1)}%`))
    console.log(chalk.gray(`  Average Response Time: ${finalStats.averageResponseTime.toFixed(0)}ms`))

    console.log(chalk.green.bold('\n🎉 Enterprise RAG System Demo Completed Successfully!'))

  } catch (error) {
    console.error(chalk.red('❌ Demo failed:'), error)
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateEnterpriseRAG().catch(console.error)
}

export { demonstrateEnterpriseRAG }
