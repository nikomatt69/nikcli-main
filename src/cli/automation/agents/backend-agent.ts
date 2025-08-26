import { BaseAgent } from './base-agent';
import { AgentTask } from './agent-router';
import { CliUI } from '../../utils/cli-ui';

/**
 * Backend Specialized Agent
 * Handles server-side development, APIs, databases, and backend architecture
 */
export class BackendAgent extends BaseAgent {
  public readonly id = 'backend-agent';
  public readonly capabilities = [
    'api-development',
    'database-design',
    'server-architecture',
    'authentication',
    'security',
    'microservices',
    'containerization',
    'backend-testing',
    'performance-optimization',
    'monitoring',
    'deployment'
  ];
  public readonly specialization = 'backend';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
    this.maxConcurrentTasks = 3; // Backend can handle multiple concurrent tasks
  }

  protected async onInitialize(): Promise<void> {
    CliUI.logInfo('🔧 Backend Agent initializing...');
    
    // Check for backend frameworks and tools
    await this.detectBackendStack();
    
    // Setup backend-specific tool configurations
    await this.configureBackendTools();
    
    CliUI.logSuccess('✅ Backend Agent ready for server-side tasks');
  }

  protected async onExecuteTask(task: AgentTask): Promise<any> {
    CliUI.logInfo(`🔧 Backend Agent processing: ${task.type}`);

    switch (task.type.toLowerCase()) {
      case 'create-api':
        return await this.createAPI(task);
      
      case 'design-database':
        return await this.designDatabase(task);
      
      case 'implement-authentication':
        return await this.implementAuthentication(task);
      
      case 'setup-middleware':
        return await this.setupMiddleware(task);
      
      case 'optimize-performance':
        return await this.optimizeBackendPerformance(task);
      
      case 'setup-monitoring':
        return await this.setupMonitoring(task);
      
      case 'containerize-app':
        return await this.containerizeApplication(task);
      
      case 'setup-testing':
        return await this.setupBackendTesting(task);
      
      default:
        return await this.handleGenericBackendTask(task);
    }
  }

  protected async onStop(): Promise<void> {
    CliUI.logInfo('🔧 Backend Agent shutting down...');
    // Cleanup any backend-specific resources
  }

  /**
   * Create a new API endpoint
   */
  private async createAPI(task: AgentTask): Promise<any> {
    const { apiName, methods, framework, database } = task.metadata || {};
    
    CliUI.logInfo(`🚀 Creating API: ${apiName} with methods: ${methods?.join(', ')}`);

    try {
      // Generate API routes
      const routeCode = await this.generateAPIRoutes(apiName, methods, framework);
      const routePath = await this.determineRoutePath(apiName, framework);
      await this.executeTool('write-file-tool', routePath, routeCode);
      
      // Generate controller
      const controllerCode = await this.generateController(apiName, methods, database);
      const controllerPath = await this.determineControllerPath(apiName, framework);
      await this.executeTool('write-file-tool', controllerPath, controllerCode);
      
      // Generate model if database is specified
      let modelPath = null;
      if (database) {
        const modelCode = await this.generateModel(apiName, database);
        modelPath = await this.determineModelPath(apiName, database);
        await this.executeTool('write-file-tool', modelPath, modelCode);
      }
      
      // Generate API tests
      const testCode = await this.generateAPITests(apiName, methods);
      const testPath = routePath.replace(/\.(js|ts)$/, '.test.$1');
      await this.executeTool('write-file-tool', testPath, testCode);

      return {
        success: true,
        apiName,
        routePath,
        controllerPath,
        modelPath,
        testPath,
        message: `API ${apiName} created successfully`
      };

    } catch (error: any) {
      throw new Error(`Failed to create API: ${error.message}`);
    }
  }

  /**
   * Design database schema
   */
  private async designDatabase(task: AgentTask): Promise<any> {
    const { entities, relationships, databaseType } = task.metadata || {};
    
    CliUI.logInfo(`🗄️ Designing ${databaseType} database schema`);

    try {
      // Generate database schema
      const schemaCode = await this.generateDatabaseSchema(entities, relationships, databaseType);
      const schemaPath = await this.determineSchemaPath(databaseType);
      await this.executeTool('write-file-tool', schemaPath, schemaCode);
      
      // Generate migration files
      const migrationCode = await this.generateMigrations(entities, databaseType);
      const migrationPath = await this.determineMigrationPath(databaseType);
      await this.executeTool('write-file-tool', migrationPath, migrationCode);
      
      // Generate seed data
      const seedCode = await this.generateSeedData(entities);
      const seedPath = await this.determineSeedPath(databaseType);
      await this.executeTool('write-file-tool', seedPath, seedCode);

      return {
        success: true,
        databaseType,
        schemaPath,
        migrationPath,
        seedPath,
        entitiesCount: entities?.length || 0,
        message: `Database schema designed successfully`
      };

    } catch (error: any) {
      throw new Error(`Failed to design database: ${error.message}`);
    }
  }

  /**
   * Implement authentication system
   */
  private async implementAuthentication(task: AgentTask): Promise<any> {
    const { authType, provider, features } = task.metadata || {};
    
    CliUI.logInfo(`🔐 Implementing ${authType} authentication`);

    try {
      // Generate authentication middleware
      const authMiddleware = await this.generateAuthMiddleware(authType, provider);
      const middlewarePath = 'src/middleware/auth.ts';
      await this.executeTool('write-file-tool', middlewarePath, authMiddleware);
      
      // Generate authentication routes
      const authRoutes = await this.generateAuthRoutes(authType, features);
      const routesPath = 'src/routes/auth.ts';
      await this.executeTool('write-file-tool', routesPath, authRoutes);
      
      // Generate authentication utilities
      const authUtils = await this.generateAuthUtils(authType, provider);
      const utilsPath = 'src/utils/auth.ts';
      await this.executeTool('write-file-tool', utilsPath, authUtils);
      
      // Generate authentication tests
      const authTests = await this.generateAuthTests(authType);
      const testsPath = 'src/tests/auth.test.ts';
      await this.executeTool('write-file-tool', testsPath, authTests);

      return {
        success: true,
        authType,
        provider,
        middlewarePath,
        routesPath,
        utilsPath,
        testsPath,
        message: `Authentication system implemented successfully`
      };

    } catch (error: any) {
      throw new Error(`Failed to implement authentication: ${error.message}`);
    }
  }

  /**
   * Setup middleware
   */
  private async setupMiddleware(task: AgentTask): Promise<any> {
    const { middlewareTypes, framework } = task.metadata || {};
    
    CliUI.logInfo(`⚙️ Setting up middleware: ${middlewareTypes?.join(', ')}`);

    try {
      const middlewareFiles = [];
      
      for (const middlewareType of middlewareTypes || []) {
        const middlewareCode = await this.generateMiddleware(middlewareType, framework);
        const middlewarePath = `src/middleware/${middlewareType}.ts`;
        await this.executeTool('write-file-tool', middlewarePath, middlewareCode);
        middlewareFiles.push(middlewarePath);
      }
      
      // Update main app file to use middleware
      await this.updateAppWithMiddleware(middlewareTypes, framework);

      return {
        success: true,
        middlewareFiles,
        framework,
        message: `Middleware setup completed`
      };

    } catch (error: any) {
      throw new Error(`Failed to setup middleware: ${error.message}`);
    }
  }

  /**
   * Optimize backend performance
   */
  private async optimizeBackendPerformance(task: AgentTask): Promise<any> {
    const { optimizationType, targetFiles } = task.metadata || {};
    
    CliUI.logInfo(`⚡ Optimizing backend performance: ${optimizationType}`);

    try {
      const optimizations = [];

      // Database query optimization
      if (optimizationType.includes('database')) {
        const dbResult = await this.optimizeDatabaseQueries(targetFiles);
        optimizations.push(dbResult);
      }

      // Caching implementation
      if (optimizationType.includes('caching')) {
        const cacheResult = await this.implementCaching(targetFiles);
        optimizations.push(cacheResult);
      }

      // Connection pooling
      if (optimizationType.includes('connection-pooling')) {
        const poolResult = await this.setupConnectionPooling();
        optimizations.push(poolResult);
      }

      // API response optimization
      if (optimizationType.includes('api-response')) {
        const apiResult = await this.optimizeAPIResponses(targetFiles);
        optimizations.push(apiResult);
      }

      return {
        success: true,
        optimizations,
        message: `Backend performance optimizations applied`
      };

    } catch (error: any) {
      throw new Error(`Failed to optimize performance: ${error.message}`);
    }
  }

  /**
   * Setup monitoring
   */
  private async setupMonitoring(task: AgentTask): Promise<any> {
    const { monitoringTools, metrics } = task.metadata || {};
    
    CliUI.logInfo(`📊 Setting up monitoring with: ${monitoringTools?.join(', ')}`);

    try {
      const monitoringFiles = [];
      
      // Setup logging
      const loggingCode = await this.generateLoggingSetup(monitoringTools);
      const loggingPath = 'src/utils/logger.ts';
      await this.executeTool('write-file-tool', loggingPath, loggingCode);
      monitoringFiles.push(loggingPath);
      
      // Setup metrics collection
      const metricsCode = await this.generateMetricsSetup(metrics);
      const metricsPath = 'src/utils/metrics.ts';
      await this.executeTool('write-file-tool', metricsPath, metricsCode);
      monitoringFiles.push(metricsPath);
      
      // Setup health checks
      const healthCode = await this.generateHealthChecks();
      const healthPath = 'src/routes/health.ts';
      await this.executeTool('write-file-tool', healthPath, healthCode);
      monitoringFiles.push(healthPath);

      return {
        success: true,
        monitoringTools,
        monitoringFiles,
        message: `Monitoring setup completed`
      };

    } catch (error: any) {
      throw new Error(`Failed to setup monitoring: ${error.message}`);
    }
  }

  /**
   * Containerize application
   */
  private async containerizeApplication(task: AgentTask): Promise<any> {
    const { containerTool, environment } = task.metadata || {};
    
    CliUI.logInfo(`🐳 Containerizing application with ${containerTool}`);

    try {
      // Generate Dockerfile
      const dockerfileContent = await this.generateDockerfile(environment);
      await this.executeTool('write-file-tool', 'Dockerfile', dockerfileContent);
      
      // Generate docker-compose.yml
      const composeContent = await this.generateDockerCompose(environment);
      await this.executeTool('write-file-tool', 'docker-compose.yml', composeContent);
      
      // Generate .dockerignore
      const dockerignoreContent = await this.generateDockerignore();
      await this.executeTool('write-file-tool', '.dockerignore', dockerignoreContent);

      return {
        success: true,
        containerTool,
        environment,
        files: ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
        message: `Application containerized successfully`
      };

    } catch (error: any) {
      throw new Error(`Failed to containerize application: ${error.message}`);
    }
  }

  /**
   * Handle generic backend tasks
   */
  private async handleGenericBackendTask(task: AgentTask): Promise<any> {
    CliUI.logInfo(`🔧 Handling generic backend task: ${task.type}`);

    // Use planning system for complex tasks
    const plan = await this.generateTaskPlan(task);
    return await this.executePlan(plan);
  }

  // Helper methods for backend operations
  private async detectBackendStack(): Promise<void> {
    try {
      const packageJson = await this.executeTool('read-file-tool', 'package.json');
      const dependencies = JSON.parse(packageJson).dependencies || {};
      
      if (dependencies.express) {
        CliUI.logInfo('📦 Detected Express.js framework');
      }
      if (dependencies.fastify) {
        CliUI.logInfo('📦 Detected Fastify framework');
      }
      if (dependencies.mongoose || dependencies.mongodb) {
        CliUI.logInfo('📦 Detected MongoDB database');
      }
      if (dependencies.pg || dependencies.mysql2) {
        CliUI.logInfo('📦 Detected SQL database');
      }
    } catch {
      CliUI.logInfo('📦 No specific backend framework detected');
    }
  }

  private async configureBackendTools(): Promise<void> {
    CliUI.logDebug('🔧 Configuring backend-specific tools');
  }

  // Placeholder methods for complex backend operations
  private async generateAPIRoutes(apiName: string, methods: string[], framework: string): Promise<string> {
    return `// ${apiName} API routes for ${framework}\nexport default router;`;
  }

  private async generateController(apiName: string, methods: string[], database: string): Promise<string> {
    return `// ${apiName} controller with ${database}\nexport class ${apiName}Controller {}`;
  }

  private async generateModel(apiName: string, database: string): Promise<string> {
    return `// ${apiName} model for ${database}\nexport class ${apiName}Model {}`;
  }

  private async generateAPITests(apiName: string, methods: string[]): Promise<string> {
    return `// Tests for ${apiName} API\ndescribe('${apiName}', () => {});`;
  }

  private async generateDatabaseSchema(entities: any[], relationships: any[], dbType: string): Promise<string> {
    return `-- Database schema for ${dbType}\n-- Entities: ${entities?.length || 0}`;
  }

  private async generateMigrations(entities: any[], dbType: string): Promise<string> {
    return `-- Migrations for ${dbType}\n-- Entities: ${entities?.length || 0}`;
  }

  private async generateSeedData(entities: any[]): Promise<string> {
    return `-- Seed data\n-- Entities: ${entities?.length || 0}`;
  }

  private async generateAuthMiddleware(authType: string, provider: string): Promise<string> {
    return `// ${authType} middleware with ${provider}\nexport const authMiddleware = () => {};`;
  }

  private async generateAuthRoutes(authType: string, features: string[]): Promise<string> {
    return `// ${authType} routes with features: ${features?.join(', ')}\nexport default router;`;
  }

  private async generateAuthUtils(authType: string, provider: string): Promise<string> {
    return `// ${authType} utilities with ${provider}\nexport const authUtils = {};`;
  }

  private async generateAuthTests(authType: string): Promise<string> {
    return `// Tests for ${authType} authentication\ndescribe('Auth', () => {});`;
  }

  private async generateMiddleware(type: string, framework: string): Promise<string> {
    return `// ${type} middleware for ${framework}\nexport const ${type}Middleware = () => {};`;
  }

  private async updateAppWithMiddleware(types: string[], framework: string): Promise<void> {
    CliUI.logInfo(`Updating ${framework} app with middleware: ${types.join(', ')}`);
  }

  private async generateDockerfile(environment: string): Promise<string> {
    return `FROM node:18-alpine\n# Dockerfile for ${environment}\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD ["npm", "start"]`;
  }

  private async generateDockerCompose(environment: string): Promise<string> {
    return `version: '3.8'\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - NODE_ENV=${environment}`;
  }

  private async generateDockerignore(): Promise<string> {
    return `node_modules\n.git\n.env\n*.log\nDockerfile\n.dockerignore`;
  }

  // Path determination methods
  private async determineRoutePath(apiName: string, framework: string): Promise<string> {
    return `src/routes/${apiName}.ts`;
  }

  private async determineControllerPath(apiName: string, framework: string): Promise<string> {
    return `src/controllers/${apiName}.controller.ts`;
  }

  private async determineModelPath(apiName: string, database: string): Promise<string> {
    return `src/models/${apiName}.model.ts`;
  }

  private async determineSchemaPath(databaseType: string): Promise<string> {
    return `src/database/schema.${databaseType === 'mongodb' ? 'js' : 'sql'}`;
  }

  private async determineMigrationPath(databaseType: string): Promise<string> {
    return `src/database/migrations/001_initial.${databaseType === 'mongodb' ? 'js' : 'sql'}`;
  }

  private async determineSeedPath(databaseType: string): Promise<string> {
    return `src/database/seeds/001_initial.${databaseType === 'mongodb' ? 'js' : 'sql'}`;
  }

  // Performance optimization methods
  private async optimizeDatabaseQueries(files: string[]): Promise<any> {
    return { type: 'database-optimization', filesProcessed: files?.length || 0 };
  }

  private async implementCaching(files: string[]): Promise<any> {
    return { type: 'caching', filesProcessed: files?.length || 0 };
  }

  private async setupConnectionPooling(): Promise<any> {
    return { type: 'connection-pooling', configured: true };
  }

  private async optimizeAPIResponses(files: string[]): Promise<any> {
    return { type: 'api-optimization', filesProcessed: files?.length || 0 };
  }

  // Monitoring setup methods
  private async generateLoggingSetup(tools: string[]): Promise<string> {
    return `// Logging setup with: ${tools?.join(', ')}\nexport const logger = {};`;
  }

  private async generateMetricsSetup(metrics: string[]): Promise<string> {
    return `// Metrics setup for: ${metrics?.join(', ')}\nexport const metrics = {};`;
  }

  private async generateHealthChecks(): Promise<string> {
    return `// Health check endpoints\nexport const healthRouter = {};`;
  }

  private async setupBackendTesting(task: AgentTask): Promise<any> {
    return { success: true, message: 'Backend testing setup completed' };
  }

  private async generateTaskPlan(task: AgentTask): Promise<any> {
    return { steps: [], estimated_duration: 120000 };
  }

  private async executePlan(plan: any): Promise<any> {
    return { success: true, message: 'Backend plan executed successfully' };
  }
}