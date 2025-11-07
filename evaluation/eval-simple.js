// TODO: Consider refactoring for reduced complexity
const fs = require('fs');
const path = require('path');

class SimpleEvaluation {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.results = {
      documentation: {},
      dependencies: {},
      recommendations: [],
      scores: {},
    };
  }

  async evaluate() {
    console.log(
      '🔍 Starting Documentation Quality and Dependency Management Evaluation...\n',
    );

    await this.evaluateDocumentation();
    await this.evaluateDependencies();
    this.generateRecommendations();
    this.calculateOverallScores();
    this.displayResults();
    this.saveResults();
  }

  async evaluateDocumentation() {
    console.log('📚 Evaluating Documentation Quality...\n');

    // Check for README files
    const readmeFiles = ['README.md', 'README.mdx', 'readme.md', 'Readme.md'];
    let hasReadme = false;
    let readmeContent = '';

    for (const readme of readmeFiles) {
      const readmePath = path.join(this.projectPath, readme);
      if (fs.existsSync(readmePath)) {
        hasReadme = true;
        readmeContent = fs.readFileSync(readmePath, 'utf8');
        break;
      }
    }

    if (hasReadme) {
      const score = this.evaluateReadme(readmeContent);
      this.results.documentation.readme = score;
    } else {
      this.results.documentation.readme = {
        score: 0,
        comments: ['No README file found'],
      };
    }

    // Check for NIKOCLI.md
    const nikocliPath = path.join(this.projectPath, 'NIKOCLI.md');
    if (fs.existsSync(nikocliPath)) {
      const content = fs.readFileSync(nikocliPath, 'utf8');
      const score = this.evaluateNikocliDoc(content);
      this.results.documentation.commandReference = score;
    } else {
      this.results.documentation.commandReference = {
        score: 0,
        comments: ['No NIKOCLI.md found'],
      };
    }

    // Check for web-ui README
    const webReadmePath = path.join(this.projectPath, 'web-ui', 'README.md');
    if (fs.existsSync(webReadmePath)) {
      const content = fs.readFileSync(webReadmePath, 'utf8');
      const score = this.evaluateWebReadme(content);
      this.results.documentation.webReadme = score;
    } else {
      this.results.documentation.webReadme = {
        score: 0,
        comments: ['No web-ui README found'],
      };
    }

    // Check for database documentation
    const dbReadmePath = path.join(this.projectPath, 'database', 'README.md');
    if (fs.existsSync(dbReadmePath)) {
      const content = fs.readFileSync(dbReadmePath, 'utf8');
      const score = this.evaluateDbReadme(content);
      this.results.documentation.databaseDoc = score;
    } else {
      this.results.documentation.databaseDoc = {
        score: 0,
        comments: ['No database README found'],
      };
    }

    // Check for existing analysis reports
    const analysisFiles = [
      'DEPENDENCY_AUDIT_SUMMARY.md',
      'CURRENT_STATE_OPTIMIZATION_ANALYSIS.md',
      'BUILD_ANALYSIS_REPORT.md',
      'OPTIMIZATION_ACTION_PLAN.md',
    ];

    let foundReports = 0;
    const reportComments = [];

    for (const file of analysisFiles) {
      const filePath = path.join(this.projectPath, file);
      if (fs.existsSync(filePath)) {
        foundReports++;
        const content = fs.readFileSync(filePath, 'utf8');
        const wordCount = content.split(/\s+/).length;
        reportComments.push(`Found ${file} (${wordCount} words)`);
      }
    }

    if (foundReports > 0) {
      this.results.documentation.analysisReports = {
        score: Math.min(90, foundReports * 15 + 20),
        comments: [`Found ${foundReports} analysis reports`, ...reportComments],
      };
    } else {
      this.results.documentation.analysisReports = {
        score: 0,
        comments: ['No analysis reports found'],
      };
    }
  }

  evaluateReadme(content) {
    const comments = [];
    let score = 0;

    if (content.length > 500) {
      score += 15;
      comments.push('Substantial README content');
    }

    if (content.includes('## Installation') || content.includes('install')) {
      score += 15;
      comments.push('Contains installation instructions');
    }

    if (content.includes('## Usage') || content.includes('## Examples')) {
      score += 15;
      comments.push('Contains usage examples');
    }

    if (content.includes('## API') || content.includes('## Reference')) {
      score += 10;
      comments.push('Contains API reference');
    }

    if (content.includes('## Contributing') || content.includes('## License')) {
      score += 10;
      comments.push('Contains contributing/licensing information');
    }

    if (content.includes('[![') || content.includes('![Alt text]')) {
      score += 5;
      comments.push('Contains visual elements');
    }

    return { score: Math.min(score, 90), comments };
  }

  evaluateNikocliDoc(content) {
    const comments = [];
    let score = 0;

    // Check for comprehensive command documentation
    if (
      content.includes('/agent') &&
      content.includes('Commands (Alphabetical)')
    ) {
      score += 30;
      comments.push('Comprehensive command reference found');
    }

    if (content.includes('Features') || content.includes('Examples')) {
      score += 20;
      comments.push('Contains feature documentation and examples');
    }

    if (content.includes('##') && (content.match(/##/g) || []).length > 5) {
      score += 20;
      comments.push('Well-structured with multiple sections');
    }

    if (content.includes('Provider') || content.includes('All (adapts')) {
      score += 15;
      comments.push('Documented provider compatibility');
    }

    if (content.length > 3000) {
      score += 10;
      comments.push('Substantial documentation content');
    }

    return { score: Math.min(score, 95), comments };
  }

  evaluateWebReadme(content) {
    const comments = [];
    let score = 0;

    if (content.includes('## Features')) {
      score += 20;
      comments.push('Features section found');
    }

    if (content.includes('## Tech Stack')) {
      score += 20;
      comments.push('Tech stack documented');
    }

    if (
      content.includes('## Getting Started') ||
      content.includes('## Installation')
    ) {
      score += 20;
      comments.push('Installation guide found');
    }

    if (content.includes('## Project Structure')) {
      score += 15;
      comments.push('Project structure documented');
    }

    if (content.includes('```')) {
      score += 10;
      comments.push('Contains code examples');
    }

    return { score: Math.min(score, 85), comments };
  }

  evaluateDbReadme(content) {
    const comments = [];
    let score = 0;

    if (content.includes('## Overview')) {
      score += 15;
      comments.push('Database overview provided');
    }

    if (content.includes('## Setup')) {
      score += 20;
      comments.push('Setup instructions found');
    }

    if (content.includes('Functions') || content.includes('Tables')) {
      score += 20;
      comments.push('Database functions/tables documented');
    }

    if (content.includes('SQL') || content.includes('```sql')) {
      score += 15;
      comments.push('Contains SQL examples');
    }

    if (content.includes('## Usage')) {
      score += 10;
      comments.push('Usage examples provided');
    }

    return { score: Math.min(score, 80), comments };
  }

  async evaluateDependencies() {
    console.log('📦 Evaluating Dependency Management...\n');

    // Read package.json
    const packagePath = path.join(this.projectPath, 'package.json');
    if (!fs.existsSync(packagePath)) {
      this.results.dependencies = {
        packageJson: { score: 0, comments: ['No package.json found'] },
      };
      return;
    }

    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);

    // Evaluate package.json structure
    const pkgScore = this.evaluatePackageJson(packageJson);
    this.results.dependencies.packageJson = pkgScore;

    // Check for known issues from existing reports
    const auditComments = [];
    let auditScore = 70; // Base score

    // Read existing audit summary
    const auditPath = path.join(
      this.projectPath,
      'DEPENDENCY_AUDIT_SUMMARY.md',
    );
    if (fs.existsSync(auditPath)) {
      const auditContent = fs.readFileSync(auditPath, 'utf8');

      if (auditContent.includes('CRITICAL SECURITY ISSUES')) {
        auditScore -= 30;
        auditComments.push('CRITICAL security issues identified in audit');
      }

      if (auditContent.includes('3 (CRITICAL)')) {
        auditScore -= 15;
        auditComments.push('3 critical security vulnerabilities found');
      }

      if (auditContent.includes('127 dependencies')) {
        auditComments.push('High dependency count (127 total)');
      }

      if (auditContent.includes('18 (HIGH)')) {
        auditScore -= 10;
        auditComments.push('18 outdated packages identified');
      }
    } else {
      auditComments.push('No dependency audit report found');
    }

    this.results.dependencies.audit = {
      score: Math.max(auditScore, 0),
      comments: auditComments,
    };

    // Check for lockfile
    const lockfiles = ['package-lock.json', 'yarn.lock', 'bun.lock'];
    let hasLockfile = false;

    for (const lock of lockfiles) {
      const lockPath = path.join(this.projectPath, lock);
      if (fs.existsSync(lockPath)) {
        hasLockfile = true;
        break;
      }
    }

    this.results.dependencies.lockfile = {
      score: hasLockfile ? 100 : 30,
      comments: hasLockfile ? ['Lockfile present'] : ['No lockfile found'],
    };
  }

  evaluatePackageJson(packageJson) {
    const comments = [];
    let score = 0;

    // Check required fields
    if (packageJson.name) {
      score += 10;
      comments.push('Name field present');
    }

    if (packageJson.version) {
      score += 10;
      comments.push('Version field present');
    }

    if (packageJson.description) {
      score += 10;
      comments.push('Description present');
    }

    if (packageJson.license) {
      score += 10;
      comments.push('License specified');
    }

    if (packageJson.scripts) {
      score += 15;
      const scriptCount = Object.keys(packageJson.scripts).length;
      comments.push(`${scriptCount} scripts defined`);
    }

    if (packageJson.dependencies || packageJson.devDependencies) {
      score += 15;
      const depCount = Object.keys(packageJson.dependencies || {}).length;
      const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
      comments.push(`${depCount} production + ${devDepCount} dev dependencies`);
    }

    // Check for engines
    if (packageJson.engines) {
      score += 10;
      comments.push('Engine requirements specified');
    }

    // Check for bin field (CLI tools)
    if (packageJson.bin) {
      score += 10;
      comments.push('CLI binary configured');
    }

    return { score: Math.min(score, 100), comments };
  }

  generateRecommendations() {
    const recommendations = [];

    // Documentation recommendations
    if (this.results.documentation.readme?.score < 70) {
      recommendations.push(
        'Improve main README with installation, usage, and API documentation',
      );
    }

    if (this.results.documentation.commandReference?.score < 70) {
      recommendations.push(
        'Enhance NIKOCLI.md command reference with more examples',
      );
    }

    if (this.results.documentation.analysisReports?.score < 70) {
      recommendations.push(
        'Create or update analysis and optimization reports',
      );
    }

    // Dependency recommendations
    if (this.results.dependencies.audit?.score < 60) {
      recommendations.push(
        'Address critical security vulnerabilities in dependencies',
      );
    }

    if (this.results.dependencies.lockfile?.score < 100) {
      recommendations.push(
        'Ensure proper lockfile management for reproducible builds',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Documentation and dependencies are well maintained',
      );
    }

    this.results.recommendations = recommendations;
  }

  calculateOverallScores() {
    // Calculate documentation score
    const docScores = Object.values(this.results.documentation).map(
      (item) => item.score,
    );
    const documentationScore =
      docScores.reduce((sum, score) => sum + score, 0) / docScores.length;

    // Calculate dependency score
    const depScores = Object.values(this.results.dependencies).map(
      (item) => item.score,
    );
    const dependencyScore =
      depScores.reduce((sum, score) => sum + score, 0) / depScores.length;

    // Calculate overall score
    const overallScore = documentationScore * 0.6 + dependencyScore * 0.4;

    this.results.scores = {
      documentation: documentationScore,
      dependencies: dependencyScore,
      overall: overallScore,
      riskLevel:
        overallScore >= 80 ? 'LOW' : overallScore >= 60 ? 'MEDIUM' : 'HIGH',
    };
  }

  displayResults() {
    console.log('📊 EVALUATION RESULTS');
    console.log('=====================\n');

    console.log(`Overall Score: ${this.results.scores.overall.toFixed(1)}/100`);
    console.log(
      `Documentation Score: ${this.results.scores.documentation.toFixed(1)}/100`,
    );
    console.log(
      `Dependency Score: ${this.results.scores.dependencies.toFixed(1)}/100`,
    );
    console.log(`Risk Level: ${this.results.scores.riskLevel}\n`);

    console.log('📋 DETAILED BREAKDOWN');
    console.log('=====================\n');

    // Documentation breakdown
    console.log('Documentation Analysis:');
    Object.entries(this.results.documentation).forEach(([key, data]) => {
      console.log(`  ${key.toUpperCase()}: ${data.score.toFixed(1)}/100`);
      data.comments.forEach((comment) => {
        console.log(`    • ${comment}`);
      });
      console.log();
    });

    // Dependency breakdown
    console.log('Dependency Analysis:');
    Object.entries(this.results.dependencies).forEach(([key, data]) => {
      console.log(`  ${key.toUpperCase()}: ${data.score.toFixed(1)}/100`);
      data.comments.forEach((comment) => {
        console.log(`    • ${comment}`);
      });
      console.log();
    });

    console.log('🎯 RECOMMENDATIONS');
    console.log('===================\n');

    this.results.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }

  saveResults() {
    const reportPath = path.join(
      this.projectPath,
      'evaluation',
      'evaluation-report.json',
    );

    // Create directory if it doesn't exist
    const evalDir = path.dirname(reportPath);
    if (!fs.existsSync(evalDir)) {
      fs.mkdirSync(evalDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

// Run the evaluation
const projectPath = '/Volumes/SSD/Documents/Personal/nikcli-main';
const evaluator = new SimpleEvaluation(projectPath);
evaluator.evaluate().catch((error) => {
  console.error('❌ Evaluation failed:', error.message);
  process.exit(1);
});
