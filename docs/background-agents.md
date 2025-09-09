# Background Agents

Background agents are persistent, autonomous AI agents that run continuously in the background to monitor, analyze, and maintain your codebase. They provide proactive assistance by watching for changes, analyzing code quality, monitoring dependencies, and performing security scans.

## Overview

Background agents extend NikCLI's capabilities by providing continuous monitoring and analysis without requiring user interaction. They use the same UniversalAgent architecture as interactive agents but run autonomously based on configured triggers and intervals.

## Features

- **File Watching**: Monitor file system changes and trigger actions
- **Code Analysis**: Continuously analyze code quality and patterns
- **Dependency Monitoring**: Track dependency updates and vulnerabilities
- **Security Scanning**: Scan code for security vulnerabilities
- **Performance Monitoring**: Monitor application performance metrics
- **Documentation Generation**: Automatically generate and update documentation
- **Test Running**: Run tests automatically on code changes
- **Build Monitoring**: Monitor build processes and deployment status

## Architecture

### Core Components

1. **BackgroundAgentService**: Main service managing agent lifecycle
2. **Background Agent Types**: Specialized agents for different tasks
3. **Configuration Manager**: Handles agent configuration and defaults
4. **Communication System**: Inter-agent communication and coordination
5. **Monitoring System**: Health monitoring and alerting
6. **CLI Commands**: Management commands for agents

### Agent Types

#### File Watcher Agent
- Monitors file system changes
- Triggers actions based on file patterns
- Event-driven operation (no polling)

#### Code Analyzer Agent
- Analyzes code quality and complexity
- Detects patterns and anti-patterns
- Generates code metrics and suggestions

#### Dependency Monitor Agent
- Monitors package dependencies
- Checks for updates and vulnerabilities
- Provides update recommendations

#### Security Scanner Agent
- Scans code for security vulnerabilities
- Detects hardcoded secrets
- Identifies potential security issues

#### Performance Monitor Agent
- Monitors application performance
- Tracks memory and CPU usage
- Provides performance alerts

#### Documentation Generator Agent
- Generates API documentation
- Updates README files
- Creates changelog entries

#### Test Runner Agent
- Runs tests on code changes
- Monitors test coverage
- Provides test results

#### Build Monitor Agent
- Monitors build processes
- Tracks deployment status
- Provides build notifications

## Usage

### CLI Commands

#### List Agents
```bash
/bg-list
/bg-agents list
```

#### Show Status
```bash
/bg-status
/bg-agents status
```

#### Start/Stop Agents
```bash
# Start all enabled agents
/bg-start
/bg-agents start

# Start specific agent
/bg-start <agent-id>
/bg-agents start <agent-id>

# Stop all agents
/bg-stop
/bg-agents stop

# Stop specific agent
/bg-stop <agent-id>
/bg-agents stop <agent-id>
```

#### Pause/Resume Agents
```bash
# Pause agent
/bg-pause <agent-id>
/bg-agents pause <agent-id>

# Resume agent
/bg-resume <agent-id>
/bg-agents resume <agent-id>
```

#### Create Agent
```bash
/bg-create <type> <name> <description>
/bg-agents create <type> <name> <description>
```

Available types:
- `file-watcher`
- `code-analyzer`
- `dependency-monitor`
- `security-scanner`
- `performance-monitor`
- `documentation-generator`
- `test-runner`
- `build-monitor`

#### Delete Agent
```bash
/bg-delete <agent-id>
/bg-agents delete <agent-id>
```

#### Show Agent Details
```bash
/bg-show <agent-id>
/bg-agents show <agent-id>
```

#### Show Task Queue
```bash
/bg-queue
/bg-agents queue
```

#### Initialize Default Agents
```bash
/bg-init
/bg-agents init
```

### Configuration

Background agents are configured in `.nikcli/background-agents.json`. The configuration includes:

```json
{
  "id": "agent-id",
  "type": "code-analyzer",
  "name": "Code Analyzer",
  "description": "Analyzes code quality",
  "enabled": true,
  "workingDirectory": "/path/to/project",
  "interval": 300000,
  "triggers": ["**/*.ts", "**/*.js"],
  "settings": {
    "analysisTypes": ["complexity", "quality"],
    "maxFilesPerRun": 10
  },
  "autoStart": true,
  "maxConcurrentTasks": 1,
  "timeout": 60000
}
```

### Default Agents

When you run `/bg-init`, the following default agents are created:

1. **File Watcher** (enabled, auto-start)
   - Monitors TypeScript, JavaScript, and JSON files
   - Triggers actions on file changes

2. **Code Analyzer** (enabled, auto-start)
   - Analyzes code every 5 minutes
   - Generates quality metrics and suggestions

3. **Dependency Monitor** (enabled, auto-start)
   - Checks dependencies every hour
   - Monitors for updates and vulnerabilities

4. **Security Scanner** (enabled, auto-start)
   - Scans code every 30 minutes
   - Detects security vulnerabilities

5. **Performance Monitor** (disabled)
   - Monitors performance every 10 minutes
   - Requires manual activation

6. **Documentation Generator** (disabled)
   - Updates documentation every 2 hours
   - Requires manual activation

7. **Test Runner** (disabled)
   - Runs tests on file changes
   - Requires manual activation

8. **Build Monitor** (disabled)
   - Monitors build processes every 15 minutes
   - Requires manual activation

## Communication

Background agents can communicate with each other through a pub/sub system:

### Topics
- `file-changes`: File system changes
- `code-analysis`: Code analysis results
- `dependency-updates`: Dependency updates
- `security-scan`: Security scan results
- `test-results`: Test execution results
- `build-status`: Build process status

### Coordination Patterns
- **File Change Coordination**: File watcher → Code analyzer → Security scanner
- **Dependency Update Coordination**: Dependency monitor → Security scanner → Test runner
- **Build Coordination**: Build monitor → Test runner → Documentation generator

## Monitoring

### Health Monitoring
- Agent health scores (0-100)
- Task success/failure rates
- Uptime tracking
- Error monitoring

### Alerts
- Health score alerts (critical < 25, warning < 50)
- Error rate alerts (> 20% failure rate)
- Status alerts (error state)
- Performance alerts

### Reports
- System health summary
- Agent performance metrics
- Recent alerts
- Recommendations

## Best Practices

### Agent Configuration
1. **Start with defaults**: Use `/bg-init` to create default agents
2. **Enable selectively**: Only enable agents you need
3. **Adjust intervals**: Set appropriate intervals based on project size
4. **Monitor resources**: Watch for high CPU/memory usage

### Performance
1. **Limit concurrent tasks**: Set appropriate `maxConcurrentTasks`
2. **Use file patterns**: Configure `triggers` to limit scope
3. **Set timeouts**: Configure appropriate timeouts
4. **Monitor logs**: Check agent logs for issues

### Security
1. **Review permissions**: Ensure agents have minimal required permissions
2. **Monitor alerts**: Pay attention to security scanner alerts
3. **Update dependencies**: Keep dependency monitor enabled
4. **Scan regularly**: Enable security scanner for production code

## Troubleshooting

### Common Issues

#### Agent Not Starting
- Check if agent is enabled
- Verify working directory exists
- Check for configuration errors
- Review agent logs

#### High Resource Usage
- Reduce `maxConcurrentTasks`
- Increase `interval` for polling agents
- Limit file patterns in `triggers`
- Check for infinite loops in agent logic

#### Communication Issues
- Verify agent subscriptions
- Check message queue status
- Review communication logs
- Ensure agents are running

#### False Alerts
- Adjust alert thresholds
- Review agent health scores
- Check for configuration issues
- Update agent settings

### Debugging

#### Enable Debug Logging
```bash
/config log-level debug
```

#### Check Agent Status
```bash
/bg-status
```

#### View Agent Details
```bash
/bg-show <agent-id>
```

#### Check Task Queue
```bash
/bg-queue
```

#### Generate Report
```bash
/bg-agents report
```

## Development

### Creating Custom Agents

1. **Extend BaseAgent**: Create a new agent class
2. **Implement Methods**: Override required methods
3. **Register Agent**: Add to agent registration
4. **Add Configuration**: Create configuration template
5. **Test Agent**: Write tests for agent functionality

### Agent Interface

```typescript
export interface BackgroundAgent {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): AgentStatus;
  queueFile?(filePath: string): Promise<void>;
  checkDependencies?(): Promise<void>;
  // ... other methods
}
```

### Configuration Template

```typescript
export interface BackgroundAgentConfig {
  id: string;
  type: BackgroundAgentType;
  name: string;
  description: string;
  enabled: boolean;
  workingDirectory: string;
  interval?: number;
  triggers?: string[];
  settings?: Record<string, any>;
  autoStart?: boolean;
  maxConcurrentTasks?: number;
  timeout?: number;
}
```

## Examples

### Custom File Watcher
```bash
/bg-create file-watcher "Custom Watcher" "Watches specific files" --settings '{"triggers":["src/**/*.ts"],"ignorePatterns":["**/*.test.ts"]}'
```

### Custom Code Analyzer
```bash
/bg-create code-analyzer "TypeScript Analyzer" "Analyzes TypeScript files only" --settings '{"analysisTypes":["complexity","types"],"filePatterns":["**/*.ts"]}'
```

### Custom Security Scanner
```bash
/bg-create security-scanner "High Security Scanner" "High sensitivity security scanning" --settings '{"severityThreshold":"low","scanTypes":["secrets","injection","xss","crypto"]}'
```

## Integration

Background agents integrate with:
- **UniversalAgent**: Uses same agent architecture
- **Tool System**: Access to all NikCLI tools
- **Configuration**: Shared configuration system
- **Logging**: Integrated logging system
- **Communication**: Inter-agent messaging
- **Monitoring**: Health and performance monitoring

## Future Enhancements

- **Machine Learning**: Learn from user patterns
- **Custom Triggers**: User-defined trigger conditions
- **Agent Marketplace**: Shareable agent configurations
- **Visual Dashboard**: Web-based monitoring interface
- **Integration APIs**: External system integration
- **Advanced Analytics**: Detailed performance analytics