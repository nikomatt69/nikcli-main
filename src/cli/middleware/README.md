# NikCLI Middleware System

A comprehensive, production-ready middleware system for NikCLI that provides security, logging, validation, performance monitoring, and audit capabilities for AI-powered operations.

## Overview

The middleware system intercepts and processes all operations in NikCLI, providing:

- **Multi-layer security** with risk assessment and approval workflows
- **Comprehensive audit trail** for compliance and forensics  
- **Performance monitoring** with automatic optimizations
- **Request/response validation** with customizable rules
- **Structured logging** with data sanitization
- **Real-time alerting** for security and performance issues

## Architecture

### Core Components

- **MiddlewareManager** - Central orchestrator managing middleware pipeline execution
- **BaseMiddleware** - Abstract base class for all middleware implementations
- **MiddlewareContext** - Enhanced context with request tracking and metadata
- **MiddlewareBootstrap** - Initialization and lifecycle management

### Middleware Types

1. **SecurityMiddleware** (Priority: 1000)
   - Validates operations against security policies
   - Performs risk assessment (low/medium/high)
   - Interactive approval prompts for high-risk operations
   - Blocks dangerous commands automatically

2. **LoggingMiddleware** (Priority: 900)
   - Structured request/response logging
   - Automatic data sanitization for sensitive information
   - File rotation and buffered writes
   - Integration with existing logger

3. **ValidationMiddleware** (Priority: 800)
   - Request/response schema validation
   - Custom validation rules per operation type
   - Context and argument validation
   - Configurable error handling

4. **PerformanceMiddleware** (Priority: 700)
   - Execution time and memory tracking
   - Automatic performance optimizations
   - Slow operation alerting
   - Benchmark collection and analysis

5. **AuditMiddleware** (Priority: 600)
   - Complete forensic audit trail
   - GDPR compliance checking
   - Data integrity verification with checksums
   - Security incident detection

## Configuration

Middleware is configured through the NikCLI configuration file (`~/.nikcli/config.json`):

```json
{
  "middleware": {
    "enabled": true,
    "security": {
      "enabled": true,
      "priority": 1000,
      "strictMode": false,
      "requireApproval": true,
      "riskThreshold": "medium"
    },
    "logging": {
      "enabled": true,
      "priority": 900,
      "logLevel": "info",
      "logToFile": true,
      "sanitizeData": true
    },
    "validation": {
      "enabled": true,
      "priority": 800,
      "strictMode": false,
      "validateArgs": true,
      "validateContext": true
    },
    "performance": {
      "enabled": true,
      "priority": 700,
      "trackMemory": true,
      "trackCpu": true,
      "slowExecutionThreshold": 5000
    },
    "audit": {
      "enabled": true,
      "priority": 600,
      "auditLevel": "standard",
      "enableCompliance": true,
      "dataRetentionDays": 90
    }
  }
}
```

## CLI Commands

The middleware system provides several CLI commands for management and monitoring:

### Status and Monitoring

```bash
/middleware-status          # Show middleware system status and recent events
/middleware                 # Alias for /middleware-status (from OrchestratorService)
/middleware-logs [limit]    # Show recent middleware execution history
```

### Configuration Management

```bash
/middleware-config [name]   # Show configuration for all or specific middleware
/middleware-enable <name>   # Enable specific middleware by name
/middleware-disable <name>  # Disable specific middleware by name
```

### Maintenance

```bash
/middleware-clear           # Clear middleware metrics and logs
```

### Available Middleware Names

- `security` - Security validation and access control
- `logging` - Request/response logging and audit trail  
- `validation` - Request and response validation
- `performance` - Performance monitoring and optimization
- `audit` - Comprehensive audit trail and compliance

## Usage Examples

### Basic Operation

All operations automatically flow through the middleware pipeline:

```bash
# Command execution (intercepted by middleware)
/ls                         # Lists files with full middleware processing

# Agent task (intercepted by middleware)  
@universal-agent create a React component

# Natural language (intercepted by middleware)
help me debug this function
```

### Security Interactions

High-risk operations will prompt for approval:

```
⚠️  Security Approval Required
─────────────────────────────────
Operation: rm -rf temp/
Risk Level: HIGH
Reason: Operation contains blocked command
Request ID: 12345678

Approve this operation? (y/N): 
```

### Performance Monitoring

Slow operations are automatically detected and reported:

```
⚠️  Slow Operation Detected
─────────────────────────────────
Operation: complex-analysis
Execution Time: 8750ms
Memory Delta: 156KB
Average Time: 3200ms
Total Executions: 15
Slow Rate: 23%
```

### Middleware Status

Check system status with `/middleware-status`:

```
🔧 Middleware System Status
────────────────────────────────────────────────────────────

Overall Statistics:
  Total Middleware: 5
  Enabled: 5
  Total Requests: 127
  Success Rate: 98.4%
  Avg Response Time: 145.32ms

Registered Middleware:
  ● security (priority: 1000, requests: 127)
  ● logging (priority: 900, requests: 127)  
  ● validation (priority: 800, requests: 127)
  ● performance (priority: 700, requests: 127)
  ● audit (priority: 600, requests: 127)

Recent Events:
  ✅ security: complete (12ms)
  ✅ logging: complete (3ms)
  ✅ validation: complete (1ms)
  ✅ performance: complete (8ms)
  ✅ audit: complete (15ms)
```

## Integration

### With OrchestratorService

The middleware system is automatically initialized when the OrchestratorService starts:

```typescript
// In orchestrator-service.ts
private async initializeServices(): Promise<void> {
  // Initialize middleware system first
  if (!this.middlewareInitialized) {
    await MiddlewareBootstrap.initialize(this.policyManager);
    this.middlewareInitialized = true;
  }
  // ... rest of service initialization
}
```

All user input flows through the middleware pipeline:

```typescript
// Middleware execution for all operations
const middlewareResult = await middlewareManager.execute(
  input,
  [input], 
  moduleContext,
  input.startsWith('/') ? 'command' : 
  input.startsWith('@') ? 'agent' : 'command'
);

if (!middlewareResult.success) {
  console.log(chalk.red(`❌ Operation blocked: ${middlewareResult.error?.message}`));
  return;
}
```

### With ModuleManager  

The ModuleManager includes comprehensive middleware management commands:

```typescript
// Middleware command handlers
private async handleMiddlewareStatus(args: string[], context: ModuleContext): Promise<void>
private async handleMiddlewareEnable(args: string[], context: ModuleContext): Promise<void>
private async handleMiddlewareDisable(args: string[], context: ModuleContext): Promise<void>
// ... etc
```

### With ConfigManager

Middleware configuration is fully integrated with the existing config system using Zod schemas for validation.

## Security Features

### Risk Assessment

Operations are automatically classified:

- **High Risk**: `rm -rf`, `sudo`, system admin, production deployments
- **Medium Risk**: File modifications, git operations, package installs
- **Low Risk**: Read operations, analysis, safe commands

### Data Sanitization

Sensitive data is automatically redacted from logs:

- API keys and tokens
- Email addresses  
- Credit card numbers
- SSH keys and certificates
- Password fields

### Approval Workflows

Interactive approval for high-risk operations with detailed context:

- Operation details and risk assessment
- File paths and command arguments  
- Historical context and patterns
- User-friendly approve/deny prompts

## Performance Features

### Automatic Optimization

- Memory garbage collection for high usage
- Caching for frequently used operations
- Background task prioritization
- Resource usage monitoring

### Benchmarking

- Per-operation execution time tracking
- Memory usage delta monitoring
- CPU time measurement
- Historical performance trends

### Alerting

- Slow execution warnings (configurable threshold)
- Memory leak detection
- Unusual usage pattern alerts
- Performance degradation notifications

## Compliance & Audit

### GDPR Compliance

- Automatic sensitive data detection
- Configurable data retention policies
- Data anonymization capabilities
- Compliance reporting dashboard

### Forensic Audit Trail

- Complete operation history with context
- Cryptographic integrity verification
- Tamper-evident audit logs
- Structured metadata for analysis

### Real-time Monitoring

- Security incident detection
- Unusual activity pattern recognition
- Compliance violation alerting
- Performance anomaly detection

## Testing

Run the middleware test suite:

```bash
npx tsx src/cli/middleware/middleware-test.ts
```

The test verifies:

- Middleware system initialization
- Pipeline execution with all middleware
- Metrics collection and reporting
- Proper shutdown procedures

## Development

### Creating Custom Middleware

Extend the `BaseMiddleware` class:

```typescript
import { BaseMiddleware, MiddlewareRequest, MiddlewareResponse, MiddlewareNext } from './types';

export class CustomMiddleware extends BaseMiddleware {
  constructor() {
    super('custom', 'Custom middleware description', {
      enabled: true,
      priority: 500
    });
  }

  async execute(
    request: MiddlewareRequest,
    next: MiddlewareNext
  ): Promise<MiddlewareResponse> {
    // Pre-processing logic
    console.log(`Processing: ${request.operation}`);
    
    // Execute next middleware in chain
    const response = await next();
    
    // Post-processing logic
    console.log(`Completed: ${request.operation}`);
    
    return response;
  }
}
```

### Registering Custom Middleware

```typescript
import { middlewareManager } from './middleware';
import { CustomMiddleware } from './custom-middleware';

const customMiddleware = new CustomMiddleware();
middlewareManager.register(customMiddleware, {
  enabled: true,
  priority: 500
});
```

## File Structure

```
src/cli/middleware/
├── types.ts                    # Core interfaces and types
├── middleware-manager.ts       # Central orchestrator
├── middleware-context.ts       # Context management utilities
├── security-middleware.ts      # Security validation middleware
├── logging-middleware.ts       # Logging and audit middleware
├── validation-middleware.ts    # Request/response validation
├── performance-middleware.ts   # Performance monitoring
├── audit-middleware.ts         # Compliance and forensic audit
├── index.ts                   # Exports and bootstrap
├── middleware-test.ts         # Test suite
└── README.md                  # This documentation
```

## Best Practices

1. **Always use middleware for sensitive operations** - Don't bypass the pipeline
2. **Configure appropriate risk thresholds** - Balance security with usability  
3. **Monitor middleware performance** - Ensure minimal overhead
4. **Regular audit log review** - Check for security incidents
5. **Update security policies** - Keep risk assessments current
6. **Test custom middleware thoroughly** - Verify error handling and performance
7. **Use structured logging** - Enable better analysis and debugging

## Troubleshooting

### High Memory Usage

- Check performance middleware alerts
- Review slow operation reports
- Verify garbage collection is enabled
- Monitor audit log file sizes

### Security Approval Fatigue  

- Adjust risk thresholds in configuration
- Review blocked operations list
- Consider trusted domain whitelist
- Use batch approval for safe operations

### Performance Degradation

- Check middleware execution times in logs
- Disable non-essential middleware temporarily  
- Review validation rule complexity
- Monitor audit trail overhead

### Configuration Issues

- Verify config schema with `/middleware-config`
- Check file permissions on config directory
- Review environment variable settings
- Test with minimal configuration

## Support

For issues, questions, or contributions related to the middleware system, please refer to the main NikCLI documentation and issue tracker.