import DocumentationDependencyEvaluator from './evaluation-engine.js';

async function runEvaluation() {
  const projectPath = '/Volumes/SSD/Documents/Personal/nikcli-main';

  console.log(
    '🔍 Starting Documentation Quality and Dependency Management Evaluation...\n',
  );

  try {
    const evaluator = new DocumentationDependencyEvaluator(projectPath);
    const result = await evaluator.evaluate();

    // Display results
    console.log('📊 EVALUATION RESULTS');
    console.log('=====================\n');

    console.log(`Overall Score: ${result.overallScore.toFixed(1)}/100`);
    console.log(
      `Documentation Score: ${result.documentationScore.toFixed(1)}/100`,
    );
    console.log(`Dependency Score: ${result.dependencyScore.toFixed(1)}/100`);
    console.log(`Risk Level: ${result.riskLevel.toUpperCase()}\n`);

    console.log('📋 DETAILED BREAKDOWN');
    console.log('=====================\n');

    // Documentation breakdown
    console.log('Documentation Analysis:');
    Object.entries(result.criteria.documentation).forEach(([key, criteria]) => {
      console.log(
        `  ${key.toUpperCase()}: ${criteria.score.toFixed(1)}/100 (Weight: ${criteria.weight * 100}%)`,
      );
      criteria.comments.forEach((comment) => {
        console.log(`    • ${comment}`);
      });
      console.log();
    });

    // Dependency breakdown
    console.log('Dependency Analysis:');
    Object.entries(result.criteria.dependencies).forEach(([key, criteria]) => {
      console.log(
        `  ${key.toUpperCase()}: ${criteria.score.toFixed(1)}/100 (Weight: ${criteria.weight * 100}%)`,
      );
      criteria.comments.forEach((comment) => {
        console.log(`    • ${comment}`);
      });
      console.log();
    });

    console.log('🎯 RECOMMENDATIONS');
    console.log('===================\n');

    result.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });

    // Generate improvement priority
    console.log('\n📈 IMPROVEMENT PRIORITY');
    console.log('========================\n');

    const improvements = [
      ...Object.entries(result.criteria.documentation)
        .filter(([_, criteria]) => criteria.score < 70)
        .map(([key, criteria]) => ({
          type: 'Documentation',
          area: key,
          score: criteria.score,
          impact: 'High',
        })),
      ...Object.entries(result.criteria.dependencies)
        .filter(([_, criteria]) => criteria.score < 70)
        .map(([key, criteria]) => ({
          type: 'Dependency',
          area: key,
          score: criteria.score,
          impact: 'High',
        })),
    ];

    if (improvements.length > 0) {
      improvements
        .sort((a, b) => a.score - b.score)
        .forEach((improvement, index) => {
          console.log(
            `${index + 1}. ${improvement.type} - ${improvement.area} (Score: ${improvement.score.toFixed(1)})`,
          );
        });
    } else {
      console.log(
        '✅ All areas are performing well! Consider minor optimizations.',
      );
    }

    // Write results to file
    const fs = require('fs');
    const reportPath =
      '/Volumes/SSD/Documents/Personal/nikcli-main/evaluation/evaluation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.error('❌ Evaluation failed:', error.message);
    process.exit(1);
  }
}

runEvaluation();
