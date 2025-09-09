import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger';
import { UniversalAgent } from '../universal-agent';
import { BackgroundAgentInstance } from '../../services/background-agent-service';

/**
 * Security Scanner Agent
 * Scans code for security vulnerabilities and best practices
 */
export class SecurityScannerAgent extends EventEmitter {
  private instance: BackgroundAgentInstance;
  private agent: UniversalAgent;
  private isRunning = false;
  private scanCache: Map<string, { hash: string; lastScanned: Date; vulnerabilities: any[] }> = new Map();
  private scanQueue: string[] = [];
  private isScanning = false;

  constructor(instance: BackgroundAgentInstance, agent: UniversalAgent) {
    super();
    this.instance = instance;
    this.agent = agent;
  }

  /**
   * Start the security scanner
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      await logger.logService('warn', 'security-scanner-agent', 'Security scanner is already running');
      return;
    }

    try {
      this.isRunning = true;
      
      // Initialize scan cache
      await this.initializeScanCache();

      // Start scan loop
      this.startScanLoop();

      await logger.logService('info', 'security-scanner-agent', 'Started security scanner', {
        agentId: this.instance.id,
        workingDirectory: this.instance.config.workingDirectory
      });

      this.emit('started');

    } catch (error: any) {
      await logger.logService('error', 'security-scanner-agent', 'Failed to start security scanner', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Stop the security scanner
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      await logger.logService('warn', 'security-scanner-agent', 'Security scanner is not running');
      return;
    }

    try {
      this.isRunning = false;
      this.scanQueue = [];

      await logger.logService('info', 'security-scanner-agent', 'Stopped security scanner', {
        agentId: this.instance.id
      });

      this.emit('stopped');

    } catch (error: any) {
      await logger.logService('error', 'security-scanner-agent', 'Failed to stop security scanner', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Get current status
   */
  public getStatus(): { 
    isRunning: boolean; 
    isScanning: boolean; 
    queueLength: number; 
    scannedFiles: number; 
    vulnerabilities: number;
    lastActivity?: Date 
  } {
    const vulnerabilities = Array.from(this.scanCache.values())
      .reduce((total, file) => total + file.vulnerabilities.length, 0);

    return {
      isRunning: this.isRunning,
      isScanning: this.isScanning,
      queueLength: this.scanQueue.length,
      scannedFiles: this.scanCache.size,
      vulnerabilities,
      lastActivity: this.instance.lastActivity
    };
  }

  /**
   * Queue a file for security scan
   */
  public async queueFile(filePath: string): Promise<void> {
    if (!this.scanQueue.includes(filePath)) {
      this.scanQueue.push(filePath);
      await logger.logService('debug', 'security-scanner-agent', `Queued file for security scan: ${filePath}`, {
        agentId: this.instance.id
      });
    }
  }

  /**
   * Scan a specific file for security issues
   */
  public async scanFile(filePath: string): Promise<any> {
    try {
      const fullPath = path.resolve(this.instance.config.workingDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = this.hashContent(content);
      
      // Check if file needs scanning
      const cached = this.scanCache.get(fullPath);
      if (cached && cached.hash === hash) {
        await logger.logService('debug', 'security-scanner-agent', `File unchanged, using cached scan: ${filePath}`, {
          agentId: this.instance.id
        });
        return cached.vulnerabilities;
      }

      // Perform security scan
      const vulnerabilities = await this.performSecurityScan(fullPath, content, path.extname(filePath));

      // Cache results
      this.scanCache.set(fullPath, {
        hash,
        lastScanned: new Date(),
        vulnerabilities
      });

      this.instance.lastActivity = new Date();
      this.emit('file-scanned', { filePath, vulnerabilities });

      return vulnerabilities;

    } catch (error: any) {
      await logger.logService('error', 'security-scanner-agent', `Failed to scan file: ${filePath}`, {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  private async initializeScanCache(): Promise<void> {
    this.scanCache.clear();

    const { workingDirectory } = this.instance.config;
    const codeFiles = await this.findCodeFiles(workingDirectory);

    for (const file of codeFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const hash = this.hashContent(content);
        
        this.scanCache.set(file, {
          hash,
          lastScanned: new Date(0), // Mark as needing scan
          vulnerabilities: []
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    await logger.logService('info', 'security-scanner-agent', `Initialized scan cache with ${this.scanCache.size} files`, {
      agentId: this.instance.id
    });
  }

  private async findCodeFiles(workingDirectory: string): Promise<string[]> {
    const { glob } = await import('globby');
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.py',
      '**/*.java',
      '**/*.cpp',
      '**/*.c',
      '**/*.h',
      '**/*.php',
      '**/*.rb',
      '**/*.go'
    ];

    const files = await glob(patterns, {
      cwd: workingDirectory,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**'
      ]
    });

    return files.map(file => path.resolve(workingDirectory, file));
  }

  private startScanLoop(): void {
    const interval = this.instance.config.interval || 60000; // Default 1 minute

    setInterval(async () => {
      if (!this.isRunning || this.isScanning) {
        return;
      }

      await this.processScanQueue();
    }, interval);
  }

  private async processScanQueue(): Promise<void> {
    if (this.scanQueue.length === 0) {
      return;
    }

    this.isScanning = true;

    try {
      const filePath = this.scanQueue.shift()!;
      await this.scanFile(filePath);
    } catch (error: any) {
      await logger.logService('error', 'security-scanner-agent', 'Failed to process scan queue', {
        error: error.message,
        agentId: this.instance.id
      });
    } finally {
      this.isScanning = false;
    }
  }

  private async performSecurityScan(filePath: string, content: string, extension: string): Promise<any[]> {
    const taskId = nanoid();
    
    await logger.logService('info', 'security-scanner-agent', `Performing security scan: ${filePath}`, {
      filePath,
      taskId,
      agentId: this.instance.id
    });

    // Create security scan task
    const task = {
      id: taskId,
      type: 'security-scan',
      title: `Security Scan: ${path.basename(filePath)}`,
      description: `Scan for security vulnerabilities in ${filePath}`,
      priority: 'high' as const,
      status: 'pending' as const,
      data: {
        filePath,
        content,
        extension,
        scanType: 'comprehensive'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0
    };

    // Execute scan with universal agent
    const result = await this.agent.executeTask(task);

    // Extract security vulnerabilities
    const vulnerabilities = this.extractSecurityVulnerabilities(content, extension, filePath);

    await logger.logService('info', 'security-scanner-agent', `Security scan completed: ${filePath}`, {
      filePath,
      taskId,
      status: result.status,
      vulnerabilitiesFound: vulnerabilities.length,
      agentId: this.instance.id
    });

    return vulnerabilities;
  }

  private extractSecurityVulnerabilities(content: string, extension: string, filePath: string): any[] {
    const vulnerabilities: any[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for hardcoded secrets
      if (this.containsHardcodedSecret(line)) {
        vulnerabilities.push({
          type: 'hardcoded-secret',
          severity: 'critical',
          message: 'Hardcoded secret detected',
          line: lineNumber,
          column: line.indexOf('=') + 1,
          recommendation: 'Use environment variables or secure configuration management'
        });
      }

      // Check for SQL injection vulnerabilities
      if (this.containsSQLInjection(line)) {
        vulnerabilities.push({
          type: 'sql-injection',
          severity: 'high',
          message: 'Potential SQL injection vulnerability',
          line: lineNumber,
          column: 1,
          recommendation: 'Use parameterized queries or prepared statements'
        });
      }

      // Check for XSS vulnerabilities
      if (this.containsXSSVulnerability(line)) {
        vulnerabilities.push({
          type: 'xss',
          severity: 'high',
          message: 'Potential XSS vulnerability',
          line: lineNumber,
          column: 1,
          recommendation: 'Sanitize user input and use proper escaping'
        });
      }

      // Check for unsafe eval usage
      if (line.includes('eval(') || line.includes('Function(')) {
        vulnerabilities.push({
          type: 'code-injection',
          severity: 'high',
          message: 'Unsafe eval or Function usage detected',
          line: lineNumber,
          column: line.indexOf('eval') || line.indexOf('Function'),
          recommendation: 'Avoid using eval() or Function() constructor with user input'
        });
      }

      // Check for weak cryptographic functions
      if (this.containsWeakCrypto(line)) {
        vulnerabilities.push({
          type: 'weak-crypto',
          severity: 'medium',
          message: 'Weak cryptographic function detected',
          line: lineNumber,
          column: 1,
          recommendation: 'Use strong cryptographic algorithms and proper key management'
        });
      }

      // Check for insecure random number generation
      if (line.includes('Math.random()') && line.includes('crypto') === false) {
        vulnerabilities.push({
          type: 'weak-random',
          severity: 'medium',
          message: 'Insecure random number generation',
          line: lineNumber,
          column: line.indexOf('Math.random'),
          recommendation: 'Use crypto.getRandomValues() for cryptographic purposes'
        });
      }

      // Check for path traversal vulnerabilities
      if (this.containsPathTraversal(line)) {
        vulnerabilities.push({
          type: 'path-traversal',
          severity: 'high',
          message: 'Potential path traversal vulnerability',
          line: lineNumber,
          column: 1,
          recommendation: 'Validate and sanitize file paths'
        });
      }

      // Check for command injection
      if (this.containsCommandInjection(line)) {
        vulnerabilities.push({
          type: 'command-injection',
          severity: 'critical',
          message: 'Potential command injection vulnerability',
          line: lineNumber,
          column: 1,
          recommendation: 'Avoid executing shell commands with user input'
        });
      }
    }

    return vulnerabilities;
  }

  private containsHardcodedSecret(line: string): boolean {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]+['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][^'"]+['"]/i,
      /private[_-]?key\s*=\s*['"][^'"]+['"]/i
    ];

    return secretPatterns.some(pattern => pattern.test(line));
  }

  private containsSQLInjection(line: string): boolean {
    const sqlPatterns = [
      /SELECT.*\+.*['"]/i,
      /INSERT.*\+.*['"]/i,
      /UPDATE.*\+.*['"]/i,
      /DELETE.*\+.*['"]/i,
      /\$\{.*\}.*SELECT/i,
      /\$\{.*\}.*INSERT/i,
      /\$\{.*\}.*UPDATE/i,
      /\$\{.*\}.*DELETE/i
    ];

    return sqlPatterns.some(pattern => pattern.test(line));
  }

  private containsXSSVulnerability(line: string): boolean {
    const xssPatterns = [
      /innerHTML\s*=\s*[^;]+$/,
      /document\.write\s*\(/,
      /eval\s*\(/,
      /<script[^>]*>/i
    ];

    return xssPatterns.some(pattern => pattern.test(line));
  }

  private containsWeakCrypto(line: string): boolean {
    const weakCryptoPatterns = [
      /MD5\s*\(/i,
      /SHA1\s*\(/i,
      /DES\s*\(/i,
      /RC4\s*\(/i
    ];

    return weakCryptoPatterns.some(pattern => pattern.test(line));
  }

  private containsPathTraversal(line: string): boolean {
    const pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /\.\.%2f/i,
      /\.\.%5c/i
    ];

    return pathTraversalPatterns.some(pattern => pattern.test(line));
  }

  private containsCommandInjection(line: string): boolean {
    const commandPatterns = [
      /exec\s*\(/i,
      /system\s*\(/i,
      /shell_exec\s*\(/i,
      /passthru\s*\(/i,
      /proc_open\s*\(/i,
      /popen\s*\(/i
    ];

    return commandPatterns.some(pattern => pattern.test(line));
  }

  private hashContent(content: string): string {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}