// TODO: Consider refactoring for reduced complexity
interface EvaluationCriteria {
  documentation: {
    readme: { score: number; weight: number; comments: string[] };
    apiDocs: { score: number; weight: number; comments: string[] };
    codeComments: { score: number; weight: number; comments: string[] };
    examples: { score: number; weight: number; comments: string[] };
    guides: { score: number; weight: number; comments: string[] };
    changelog: { score: number; weight: number; comments: string[] };
  };
  dependencies: {
    vulnerabilities: { score: number; weight: number; comments: string[] };
    outdated: { score: number; weight: number; comments: string[] };
    unused: { score: number; weight: number; comments: string[] };
    peerDeps: { score: number; weight: number; comments: string[] };
    licenseCompliance: { score: number; weight: number; comments: string[] };
  };
}

interface EvaluationResult {
  overallScore: number;
  documentationScore: number;
  dependencyScore: number;
  criteria: EvaluationCriteria;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class DocumentationDependencyEvaluator {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Main evaluation method that orchestrates all checks
   */
  async evaluate(): Promise<EvaluationResult> {
    const criteria: EvaluationCriteria = {
      documentation: {
        readme: await this.evaluateReadme(),
        apiDocs: await this.evaluateApiDocs(),
        codeComments: await this.evaluateCodeComments(),
        examples: await this.evaluateExamples(),
        guides: await this.evaluateGuides(),
        changelog: await this.evaluateChangelog(),
      },
      dependencies: {
        vulnerabilities: await this.evaluateVulnerabilities(),
        outdated: await this.evaluateOutdated(),
        unused: await this.evaluateUnused(),
        peerDeps: await this.evaluatePeerDeps(),
        licenseCompliance: await this.evaluateLicenseCompliance(),
      },
    };

    const scores = this.calculateScores(criteria);
    const recommendations = this.generateRecommendations(criteria);
    const riskLevel = this.assessRiskLevel(scores);

    return {
      overallScore: scores.overall,
      documentationScore: scores.documentation,
      dependencyScore: scores.dependency,
      criteria,
      recommendations,
      riskLevel,
    };
  }

  /**
   * Documentation Evaluation Methods
   */
  private async evaluateReadme() {
    const readmeFiles = ['README.md', 'README.mdx', 'readme.md', 'Readme.md'];
    const comments: string[] = [];
    let score = 0;

    // Check for README existence and basic structure
    try {
      const readmePath = readmeFiles
        .map((f) => require('path').join(this.projectPath, f))
        .find((f) => require('fs').existsSync(f));

      if (readmePath) {
        const content = require('fs').readFileSync(readmePath, 'utf8');
        score = 20; // Basic existence

        if (content.length > 500) {
          score += 15; // Substantial content
          comments.push('README has substantial content');
        }
        if (
          content.includes('## Installation') ||
          content.includes('install')
        ) {
          score += 15; // Installation instructions
          comments.push('Contains installation instructions');
        }
        if (content.includes('## Usage') || content.includes('## Examples')) {
          score += 15; // Usage examples
          comments.push('Contains usage examples');
        }
        if (content.includes('## API') || content.includes('## Reference')) {
          score += 10; // API reference
          comments.push('Contains API reference');
        }
        if (
          content.includes('## Contributing') ||
          content.includes('## License')
        ) {
          score += 10; // Contributing/licensing info
          comments.push('Contains contributing/licensing information');
        }
        if (content.includes('[![') || content.includes('![Alt text]')) {
          score += 5; // Has images/screenshots
          comments.push('Contains visual elements');
        }
      } else {
        comments.push('No README file found');
      }
    } catch (error) {
      comments.push(`Error reading README: ${error.message}`);
    }

    return { score: Math.min(score, 90), weight: 0.25, comments };
  }

  private async evaluateApiDocs() {
    const comments: string[] = [];
    let score = 0;
    const docsPaths = ['docs', 'doc', 'documentation', 'api', 'src/docs'];
    const hasDocsFolder = docsPaths.some((path) =>
      require('fs').existsSync(require('path').join(this.projectPath, path)),
    );

    if (hasDocsFolder) {
      score += 30;
      comments.push('Has dedicated documentation folder');

      // Check for common documentation patterns
      const docsContent = await this.scanDocumentationFiles();
      if (docsContent.length > 0) {
        score += 30;
        comments.push('Contains multiple documentation files');

        if (
          docsContent.some(
            (f: { name: string } | string) => typeof f === 'string' ? f.includes('api') || f.includes('reference') : f.name.includes('api') || f.name.includes('reference'),
          )
        ) {
          score += 15;
          comments.push('Has API reference documentation');
        }
        if (
          docsContent.some(
            (f: { name: string } | string) => typeof f === 'string' ? f.includes('guide') || f.includes('tutorial') : f.name.includes('guide') || f.name.includes('tutorial'),
          )
        ) {
          score += 15;
          comments.push('Has guides/tutorials');
        }
      }
    } else {
      comments.push('No dedicated documentation folder found');
    }

    return { score: Math.min(score, 90), weight: 0.25, comments };
  }

  private async evaluateCodeComments() {
    const comments: string[] = [];
    let score = 0;

    try {
      // Scan TypeScript/JavaScript files for comments
      const fileTypes = ['.ts', '.tsx', '.js', '.jsx'];
      const sourceFiles = this.findSourceFiles(fileTypes);

      if (sourceFiles.length === 0) {
        comments.push('No source files found for comment analysis');
        return { score: 0, weight: 0.15, comments };
      }

      let totalLines = 0;
      let commentLines = 0;
      let documentedFunctions = 0;
      let totalFunctions = 0;

      for (const file of sourceFiles) {
        const content = require('fs').readFileSync(file, 'utf8');
        const lines = content.split('\n');
        totalLines += lines.length;

        // Count comment lines
        const commentRegex = /\/\/.*|\/\*[\s\S]*?\*\//g;
        const matches = content.match(commentRegex);
        if (matches) commentLines += matches.length;

        // Count functions and their documentation
        const functionRegex =
          /(export\s+)?(?:async\s+)?(?:function|const\s+.*\s*=\s*(?:async\s*)?\()\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/;
        const functionMatches = content.match(functionRegex);
        if (functionMatches) {
          totalFunctions += functionMatches.length;
          // Simple heuristic: if there are JSDoc comments before functions
          const jsDocRegex = /\/\*\*[\s\S]*?\*\//g;
          const jsDocMatches = content.match(jsDocRegex);
          if (jsDocMatches) documentedFunctions += jsDocMatches.length;
        }
      }

      const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;
      const functionDocRatio =
        totalFunctions > 0 ? documentedFunctions / totalFunctions : 0;

      if (commentRatio > 0.1) {
        score += 20;
        comments.push(
          `Good comment ratio: ${(commentRatio * 100).toFixed(1)}%`,
        );
      }
      if (commentRatio > 0.2) {
        score += 15;
        comments.push('Excellent comment ratio');
      }
      if (functionDocRatio > 0.5) {
        score += 25;
        comments.push('Well documented functions');
      }
      if (totalFunctions > 0 && functionDocRatio === 0) {
        comments.push('No function documentation found');
      }
    } catch (error) {
      comments.push(`Error analyzing code comments: ${error.message}`);
    }

    return { score: Math.min(score, 60), weight: 0.15, comments };
  }

  private async evaluateExamples() {
    const comments: string[] = [];
    let score = 0;
    const examplePaths = ['examples', 'examples', 'demo', 'samples'];

    for (const path of examplePaths) {
      if (
        require('fs').existsSync(require('path').join(this.projectPath, path))
      ) {
        score += 40;
        comments.push(`Found examples folder: ${path}`);
        break;
      }
    }

    // Check for inline examples in README or docs
    try {
      const readmePath = require('path').join(this.projectPath, 'README.md');
      if (require('fs').existsSync(readmePath)) {
        const readmeContent = require('fs').readFileSync(readmePath, 'utf8');
        if (readmeContent.includes('```') || readmeContent.includes('code')) {
          score += 25;
          comments.push('README contains code examples');
        }
      }
    } catch (error) {
      // Ignore errors
    }

    // Check for package.json scripts that might be examples
    try {
      const packagePath = require('path').join(
        this.projectPath,
        'package.json',
      );
      if (require('fs').existsSync(packagePath)) {
        const packageJson = JSON.parse(
          require('fs').readFileSync(packagePath, 'utf8'),
        );
        const exampleScripts = Object.keys(packageJson.scripts || {}).filter(
          (script) =>
            script.includes('example') ||
            script.includes('demo') ||
            script.includes('sample'),
        );
        if (exampleScripts.length > 0) {
          score += 20;
          comments.push(`Found example scripts: ${exampleScripts.join(', ')}`);
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return { score: Math.min(score, 85), weight: 0.15, comments };
  }

  private async evaluateGuides() {
    const comments: string[] = [];
    let score = 0;

    // Check for common guide files
    const guideFiles = [
      'CONTRIBUTING.md',
      'CONTRIBUTING.mdx',
      'INSTALLATION.md',
      'INSTALLATION.mdx',
      'DEPLOYMENT.md',
      'DEPLOYMENT.mdx',
      'GETTING_STARTED.md',
      'GETTING_STARTED.mdx',
      'TROUBLESHOOTING.md',
      'TROUBLESHOOTING.mdx',
    ];

    for (const file of guideFiles) {
      const filePath = require('path').join(this.projectPath, file);
      if (require('fs').existsSync(filePath)) {
        score += 20;
        comments.push(`Found guide file: ${file}`);
      }
    }

    // Check for comprehensive docs structure
    const docsPaths = ['docs', 'documentation', 'guides'];
    const hasDocsStructure = docsPaths.some((path) =>
      require('fs').existsSync(require('path').join(this.projectPath, path)),
    );

    if (hasDocsStructure) {
      const docsFiles = this.findSourceFiles(
        ['.md', '.mdx', '.rst', '.txt'],
        'docs',
      );
      if (docsFiles.length > 3) {
        score += 25;
        comments.push('Comprehensive documentation structure found');
      } else if (docsFiles.length > 1) {
        score += 15;
        comments.push('Basic documentation structure found');
      }
    }

    return { score: Math.min(score, 100), weight: 0.15, comments };
  }

  private async evaluateChangelog() {
    const changelogFiles = [
      'CHANGELOG.md',
      'CHANGELOG.mdx',
      'CHANGES.md',
      'HISTORY.md',
      'NEWS.md',
    ];
    const comments: string[] = [];
    let score = 0;

    for (const file of changelogFiles) {
      const filePath = require('path').join(this.projectPath, file);
      if (require('fs').existsSync(filePath)) {
        score = 40; // Basic changelog exists
        comments.push(`Found changelog: ${file}`);

        try {
          const content = require('fs').readFileSync(filePath, 'utf8');
          if (content.includes('## [') || content.includes('###')) {
            score += 30; // Well structured with versions
            comments.push('Well structured with version releases');
          }
          if (content.length > 1000) {
            score += 20; // Substantial content
            comments.push('Substantial changelog content');
          }
          if (
            content.includes('### Added') ||
            content.includes('### Fixed') ||
            content.includes('### Changed')
          ) {
            score += 10; // Uses standard categories
            comments.push('Uses standard change categories');
          }
        } catch (error) {
          comments.push(`Error reading changelog: ${error.message}`);
        }
        break;
      }
    }

    if (score === 0) {
      comments.push('No changelog file found');
    }

    return { score: Math.min(score, 100), weight: 0.05, comments };
  }

  /**
   * Dependency Evaluation Methods
   */
  private async evaluateVulnerabilities() {
    const comments: string[] = [];
    let score = 100; // Start with perfect score, deduct for issues

    try {
      // This would normally use npm audit or similar
      // For now, we'll simulate based on common patterns
      const packageJson = require('path').join(
        this.projectPath,
        'package.json',
      );
      if (require('fs').existsSync(packageJson)) {
        const content = JSON.parse(
          require('fs').readFileSync(packageJson, 'utf8'),
        );
        const dependencies = {
          ...content.dependencies,
          ...content.devDependencies,
        };

        // Check for known vulnerable patterns
        const vulnerablePatterns = [
          {
            pattern: 'lodash@^3',
            reason: 'Lodash 3.x has known vulnerabilities',
          },
          {
            pattern: 'underscore@^1.8',
            reason: 'Underscore 1.8 has known vulnerabilities',
          },
        ];

        for (const dep of Object.keys(dependencies)) {
          const version = dependencies[dep];
          for (const vuln of vulnerablePatterns) {
            if (
              dep === vuln.pattern.split('@')[0] &&
              version.startsWith(vuln.pattern.split('@')[1])
            ) {
              score -= 30;
              comments.push(
                `Vulnerable dependency: ${dep}@${version} - ${vuln.reason}`,
              );
            }
          }
        }
      }
    } catch (error) {
      comments.push(`Error checking vulnerabilities: ${error.message}`);
      score = 50; // Penalty for inability to check
    }

    if (score === 100) {
      comments.push('No known vulnerabilities detected');
    }

    return { score: Math.max(score, 0), weight: 0.3, comments };
  }

  private async evaluateOutdated() {
    const comments: string[] = [];
    let score = 80; // Start with good score

    try {
      // Simulate outdated check - in real implementation, this would check npm registry
      const packageJson = require('path').join(
        this.projectPath,
        'package.json',
      );
      if (require('fs').existsSync(packageJson)) {
        const content = JSON.parse(
          require('fs').readFileSync(packageJson, 'utf8'),
        );
        const dependencies = {
          ...content.dependencies,
          ...content.devDependencies,
        };

        // Check for patterns that typically indicate outdated packages
        const potentiallyOutdated: string[] = [];
        for (const [dep, version] of Object.entries(dependencies)) {
          if (typeof version === 'string' && version.includes('^') && !version.includes('latest')) {
            // Heuristic: if version is very old or has car et range without exact version
            potentiallyOutdated.push(dep);
          }
        }
      }
    } catch (error) {
      comments.push(`Error checking outdated dependencies: ${error.message}`);
      score = 60;
    }

    return { score: Math.max(score, 0), weight: 0.25, comments };
  }

  private async evaluateUnused() {
    const comments: string[] = [];
    let score = 90; // Start with good score

    try {
      const packageJson = require('path').join(
        this.projectPath,
        'package.json',
      );
      if (require('fs').existsSync(packageJson)) {
        const content = JSON.parse(
          require('fs').readFileSync(packageJson, 'utf8'),
        );
        const dependencies = Object.keys({
          ...content.dependencies,
          ...content.devDependencies,
        });

        // This is a simplified check - in reality, you'd need to analyze imports
        // Check for common dev dependencies that might be unused
        const devTools = ['webpack', 'babel', 'eslint', 'prettier'];
        const sourceFiles = this.findSourceFiles([
          '.ts',
          '.tsx',
          '.js',
          '.jsx',
        ]);

        if (sourceFiles.length === 0) {
          comments.push('No source files found to analyze usage');
          score = 50;
        } else {
          // Simple heuristic: check if build tools are referenced in config files
          const configFiles = this.findSourceFiles([
            '.json',
            '.config.js',
            '.config.ts',
            'rc',
          ]);
          const hasConfigForTools = devTools.some((tool) =>
            configFiles.some((file) => {
              const content = require('fs').readFileSync(file, 'utf8');
              return (
                content.includes(tool) ||
                content.includes(tool.replace('webpack', 'webpack-dev-server'))
              );
            }),
          );

          if (!hasConfigForTools && content.devDependencies) {
            score -= 20;
            comments.push(
              'Some dev dependencies may be unused based on config analysis',
            );
          } else {
            comments.push(
              'Dev dependencies appear to have corresponding configuration',
            );
          }
        }
      }
    } catch (error) {
      comments.push(`Error checking unused dependencies: ${error.message}`);
      score = 70;
    }

    return { score: Math.max(score, 0), weight: 0.15, comments };
  }

  private async evaluatePeerDeps() {
    const comments: string[] = [];
    let score = 80; // Start with good score

    try {
      const packageJson = require('path').join(
        this.projectPath,
        'package.json',
      );
      if (require('fs').existsSync(packageJson)) {
        const content = JSON.parse(
          require('fs').readFileSync(packageJson, 'utf8'),
        );

        if (content.peerDependencies) {
          const peerDeps = Object.keys(content.peerDependencies);
          comments.push(`Found ${peerDeps.length} peer dependencies`);

          if (peerDeps.length > 0) {
            // Check if peer dependencies conflict with regular dependencies
            const regularDeps = Object.keys({
              ...content.dependencies,
              ...content.devDependencies,
            });
            const conflicts = peerDeps.filter((dep) =>
              regularDeps.includes(dep),
            );

            if (conflicts.length > 0) {
              score -= 25;
              comments.push(
                `Peer dependency conflicts: ${conflicts.join(', ')}`,
              );
            } else {
              score += 10;
              comments.push('No peer dependency conflicts detected');
            }
          }
        } else {
          comments.push('No peer dependencies defined');
        }
      }
    } catch (error) {
      comments.push(`Error checking peer dependencies: ${error.message}`);
      score = 60;
    }

    return { score: Math.max(score, 0), weight: 0.1, comments };
  }

  private async evaluateLicenseCompliance() {
    const comments: string[] = [];
    let score = 70; // Start with decent score

    try {
      const licenseFiles = [
        'LICENSE',
        'LICENSE.md',
        'LICENSE.txt',
        'LICENSE-MIT',
        'LICENSE-APACHE',
        'COPYING',
      ];
      const hasLicenseFile = licenseFiles.some((license) =>
        require('fs').existsSync(
          require('path').join(this.projectPath, license),
        ),
      );

      if (hasLicenseFile) {
        score += 20;
        comments.push('License file found');

        // Check package.json for license field
        const packageJson = require('path').join(
          this.projectPath,
          'package.json',
        );
        if (require('fs').existsSync(packageJson)) {
          const content = JSON.parse(
            require('fs').readFileSync(packageJson, 'utf8'),
          );
          if (content.license) {
            score += 10;
            comments.push(
              `License declared in package.json: ${content.license}`,
            );
          } else {
            comments.push('No license field in package.json');
          }
        }
      } else {
        comments.push('No license file found');
        score -= 20;
      }

      // Check for third-party license compliance (this would need npm license checking)
      // For now, just note that it would be checked
      comments.push(
        'Third-party license compliance check needed (requires npm-license-checker)',
      );
    } catch (error) {
      comments.push(`Error checking license compliance: ${error.message}`);
      score = 50;
    }

    return { score: Math.max(score, 0), weight: 0.2, comments };
  }

  /**
   * Helper Methods
   */
  private async scanDocumentationFiles() {
    const docsPaths = ['docs', 'documentation', 'api', 'doc'];
    const files: string[] = [];

    for (const path of docsPaths) {
      const fullPath = require('path').join(this.projectPath, path);
      if (require('fs').existsSync(fullPath)) {
        const docsFiles = this.findSourceFiles(
          ['.md', '.mdx', '.rst', '.txt'],
          path,
        );
        files.push(...(docsFiles as string[]));
      }
    }

    return files;
  }

  private findSourceFiles(
    extensions: string[],
    subdirectory: string = '',
  ): string[] {
    const files: string[] = [];
    const searchPath = subdirectory
      ? require('path').join(this.projectPath, subdirectory)
      : this.projectPath;

    const searchDir = (dir: string) => {
      try {
        const items = require('fs').readdirSync(dir);
        for (const item of items) {
          const fullPath = require('path').join(dir, item);
          const stat = require('fs').statSync(fullPath);

          if (
            stat.isDirectory() &&
            !item.startsWith('.') &&
            item !== 'node_modules'
          ) {
            searchDir(fullPath);
          } else if (
            stat.isFile() &&
            extensions.some((ext) => item.endsWith(ext))
          ) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Ignore errors for inaccessible directories
      }
    };

    searchDir(searchPath);
    return files;
  }

  private calculateScores(criteria: EvaluationCriteria) {
    // Documentation score
    const docScores = Object.values(criteria.documentation).map(
      (c) => c.score * c.weight,
    );
    const documentation = docScores.reduce((sum, score) => sum + score, 0);

    // Dependency score
    const depScores = Object.values(criteria.dependencies).map(
      (c) => c.score * c.weight,
    );
    const dependency = depScores.reduce((sum, score) => sum + score, 0);

    // Overall score (weighted average)
    const overall = documentation * 0.4 + dependency * 0.6;

    return { documentation, dependency, overall };
  }

  private generateRecommendations(criteria: EvaluationCriteria): string[] {
    const recommendations: string[] = [];

    // Documentation recommendations
    if (criteria.documentation.readme.score < 50) {
      recommendations.push(
        'Improve README with installation, usage, and API documentation',
      );
    }
    if (criteria.documentation.apiDocs.score < 30) {
      recommendations.push('Create comprehensive API documentation');
    }
    if (criteria.documentation.codeComments.score < 30) {
      recommendations.push('Add more code comments and JSDoc documentation');
    }
    if (criteria.documentation.examples.score < 40) {
      recommendations.push('Add code examples and usage demonstrations');
    }
    if (criteria.documentation.guides.score < 40) {
      recommendations.push(
        'Create comprehensive guides for installation, deployment, and troubleshooting',
      );
    }
    if (criteria.documentation.changelog.score < 40) {
      recommendations.push(
        'Maintain a detailed changelog with version releases',
      );
    }

    // Dependency recommendations
    if (criteria.dependencies.vulnerabilities.score < 70) {
      recommendations.push('Address security vulnerabilities in dependencies');
    }
    if (criteria.dependencies.outdated.score < 60) {
      recommendations.push(
        'Update outdated dependencies to latest stable versions',
      );
    }
    if (criteria.dependencies.unused.score < 60) {
      recommendations.push(
        'Remove unused dependencies to reduce bundle size and maintenance overhead',
      );
    }
    if (criteria.dependencies.licenseCompliance.score < 60) {
      recommendations.push(
        'Ensure proper license compliance and documentation',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Documentation and dependencies are well maintained',
      );
    }

    return recommendations;
  }

  private assessRiskLevel(scores: {
    documentation: number;
    dependency: number;
    overall: number;
  }): 'low' | 'medium' | 'high' | 'critical' {
    if (scores.overall >= 80) return 'low';
    if (scores.overall >= 60) return 'medium';
    if (scores.overall >= 40) return 'high';
    return 'critical';
  }
}

export default DocumentationDependencyEvaluator;
