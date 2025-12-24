export interface TestEnvironmentConfig {
  // Environment isolation settings
  isolation: {
    sandboxed: boolean;
    isolatedNodeModules: boolean;
    tempDirectoryPrefix: string;
    cleanupAfterTests: boolean;
  };

  // Performance monitoring
  performance: {
    enableMetrics: boolean;
    enableProfiling: boolean;
    metricsOutputPath: string;
    captureMemory: boolean;
    captureLatency: boolean;
  };

  // Dataset configuration
  datasets: {
    useStandardBenchmarks: boolean;
    benchmarkPath: string;
    humanEvalPath: string;
    mbppPath: string;
    codexGluePath: string;
    customTestDataPath: string;
  };

  // Timeout and resource limits
  resourceLimits: {
    defaultTimeout: number;
    testTimeout: number;
    maxMemory: string;
    maxCpuTime: number;
    maxFileHandles: number;
  };

  // Logging and reporting
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    outputPath: string;
    preserveLogs: boolean;
    verboseOutput: boolean;
    generateReports: boolean;
    reportFormats: ('json' | 'html' | 'markdown' | 'csv')[];
  };

  // Compatibility settings
  compatibility: {
    targetAgents: string[];
    benchmarkSuite: 'humaneval' | 'mbpp' | 'codexglue' | 'comprehensive';
    apiCompatibility: {
      claud: boolean;
      cline: boolean;
      opencode: boolean;
      codex: boolean;
    };
  };

  // Validation settings
  validation: {
    validateBefore: boolean;
    validateAfter: boolean;
    strictMode: boolean;
    checkSecuritySandbox: boolean;
  };
}

/**
 * Default test environment configuration
 * Optimized for isolated testing with comprehensive benchmarks
 */
export const DEFAULT_TEST_ENVIRONMENT: TestEnvironmentConfig = {
  isolation: {
    sandboxed: true,
    isolatedNodeModules: true,
    tempDirectoryPrefix: '.test-env-',
    cleanupAfterTests: true,
  },

  performance: {
    enableMetrics: true,
    enableProfiling: true,
    metricsOutputPath: './test-results/metrics',
    captureMemory: true,
    captureLatency: true,
  },

  datasets: {
    useStandardBenchmarks: true,
    benchmarkPath: './tests/data/benchmarks',
    humanEvalPath: './tests/data/benchmarks/humaneval',
    mbppPath: './tests/data/benchmarks/mbpp',
    codexGluePath: './tests/data/benchmarks/codexglue',
    customTestDataPath: './tests/data/custom',
  },

  resourceLimits: {
    defaultTimeout: 30000, // 30 seconds
    testTimeout: 60000, // 60 seconds
    maxMemory: '2GB',
    maxCpuTime: 120000, // 2 minutes
    maxFileHandles: 1024,
  },

  logging: {
    level: 'info',
    outputPath: './test-results/logs',
    preserveLogs: true,
    verboseOutput: false,
    generateReports: true,
    reportFormats: ['json', 'markdown', 'html'],
  },

  compatibility: {
    targetAgents: ['claude-code', 'cline', 'opencode', 'codex'],
    benchmarkSuite: 'comprehensive',
    apiCompatibility: {
      claud: true,
      cline: true,
      opencode: true,
      codex: true,
    },
  },

  validation: {
    validateBefore: true,
    validateAfter: true,
    strictMode: false,
    checkSecuritySandbox: true,
  },
};

/**
 * Strict validation configuration for production testing
 */
export const STRICT_TEST_ENVIRONMENT: TestEnvironmentConfig = {
  ...DEFAULT_TEST_ENVIRONMENT,
  validation: {
    validateBefore: true,
    validateAfter: true,
    strictMode: true,
    checkSecuritySandbox: true,
  },
  logging: {
    ...DEFAULT_TEST_ENVIRONMENT.logging,
    level: 'debug',
    verboseOutput: true,
  },
};

/**
 * Lightweight configuration for quick tests
 */
export const QUICK_TEST_ENVIRONMENT: TestEnvironmentConfig = {
  ...DEFAULT_TEST_ENVIRONMENT,
  performance: {
    enableMetrics: false,
    enableProfiling: false,
    metricsOutputPath: './test-results/metrics',
    captureMemory: false,
    captureLatency: false,
  },
  resourceLimits: {
    defaultTimeout: 15000,
    testTimeout: 30000,
    maxMemory: '1GB',
    maxCpuTime: 60000,
    maxFileHandles: 512,
  },
  logging: {
    level: 'warn',
    outputPath: './test-results/logs',
    preserveLogs: false,
    verboseOutput: false,
    generateReports: false,
    reportFormats: ['json'],
  },
};

/**
 * Comprehensive configuration for benchmarking
 */
export const BENCHMARK_TEST_ENVIRONMENT: TestEnvironmentConfig = {
  ...DEFAULT_TEST_ENVIRONMENT,
  performance: {
    enableMetrics: true,
    enableProfiling: true,
    metricsOutputPath: './test-results/benchmark-metrics',
    captureMemory: true,
    captureLatency: true,
  },
  resourceLimits: {
    defaultTimeout: 120000, // 2 minutes per test
    testTimeout: 300000, // 5 minutes per test
    maxMemory: '4GB',
    maxCpuTime: 600000, // 10 minutes
    maxFileHandles: 2048,
  },
  logging: {
    level: 'debug',
    outputPath: './test-results/benchmark-logs',
    preserveLogs: true,
    verboseOutput: true,
    generateReports: true,
    reportFormats: ['json', 'markdown', 'html', 'csv'],
  },
  validation: {
    validateBefore: true,
    validateAfter: true,
    strictMode: true,
    checkSecuritySandbox: true,
  },
};

export function getTestEnvironmentConfig(
  preset: 'default' | 'strict' | 'quick' | 'benchmark' = 'default',
): TestEnvironmentConfig {
  switch (preset) {
    case 'strict':
      return STRICT_TEST_ENVIRONMENT;
    case 'quick':
      return QUICK_TEST_ENVIRONMENT;
    case 'benchmark':
      return BENCHMARK_TEST_ENVIRONMENT;
    default:
      return DEFAULT_TEST_ENVIRONMENT;
  }
}
