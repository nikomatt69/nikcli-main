# NikCLI Agents

NikCLI features a comprehensive AI agent system designed for autonomous software development and project management.

## Available Agents

### Universal Agent (`universal-agent`)
**The primary comprehensive agent with full-stack development capabilities.**

**Specializations:**
- Code generation, analysis, and review
- React, Next.js, TypeScript, JavaScript development
- Node.js backend and API development
- DevOps, CI/CD, and deployment
- Testing, debugging, and optimization
- Database design and management
- System administration and automation

**64+ Capabilities including:**
- `code-generation` - Create new code from specifications
- `code-analysis` - Analyze existing codebases
- `code-review` - Review and improve code quality
- `react` - React component and application development
- `nextjs` - Next.js framework expertise
- `nodejs` - Backend development and APIs
- `typescript` - TypeScript development and migration
- `testing` - Comprehensive testing strategies
- `devops` - CI/CD and deployment automation
- `optimization` - Performance and bundle optimization

**Usage:**
```bash
# Use the universal agent
/agent universal-agent "create a React login component with validation"
/agent universal-agent "optimize this API for performance"
/agent universal-agent "set up CI/CD pipeline for this project"
```

### VM Agent (`vm-agent`)
**Secure virtualized development environment for isolated project work.**

**Specializations:**
- Docker container-based development
- Repository cloning and analysis
- Pull request creation
- Secure API key handling
- Resource isolation

**Usage:**
```bash
# Create VM environment
/vm-create https://github.com/user/repo

# Connect to VM
/vm-connect container-id

# Create PR from VM
/vm-create-pr container-id "Feature title" "Description"
```

## Agent Architecture

### Base Agent System
All agents extend from `BaseAgent` with:
- **Event-driven architecture** - Asynchronous task processing
- **Tool integration** - Access to 50+ secure tools
- **Context awareness** - Project and workspace understanding
- **Result validation** - Quality assurance and confidence scoring

### Agent Manager
Central coordination system providing:
- **Intelligent routing** - Automatic agent selection
- **Load balancing** - Distribute tasks across agents
- **Performance monitoring** - Track agent efficiency
- **Error handling** - Graceful failure recovery

### Agent Factory
Dynamic agent creation system supporting:
- **Blueprint system** - Agent templates and configurations
- **Custom agents** - User-defined specialized agents
- **Runtime creation** - On-demand agent instantiation

## Usage Patterns

### Direct Agent Commands
```bash
# List available agents
/agents

# Use specific agent
/agent universal-agent "task description"

# Agent with context
/agent universal-agent "refactor this component" --context src/components/
```

### Autonomous Mode
```bash
# Let NikCLI choose the best agent automatically
/auto "build a user authentication system"

# Plan mode with agent coordination
/plan "migrate from JavaScript to TypeScript"
```

### Agent Targeting in Chat
```bash
# Direct agent mention in conversation
@universal-agent please create a REST API for user management

# Multiple agent coordination
@universal-agent create the backend API
@vm-agent test it in isolation
```

## Agent Configuration

### Default Settings
- **Max concurrent tasks**: 3
- **Timeout**: 60 seconds per task
- **Retry attempts**: 2 with exponential backoff
- **Context window**: Optimized for each AI provider

### Customization
```bash
# Configure agent behavior
/config agent.timeout 120
/config agent.max-concurrent 5

# View agent status
/agent-status universal-agent
```

## Agent Capabilities Matrix

| Capability | Universal Agent | VM Agent | Custom Agents* |
|------------|----------------|----------|----------------|
| Code Generation | ✅ | ❌ | Configurable |
| Code Analysis | ✅ | ✅ | Configurable |
| File Operations | ✅ | ✅ | Configurable |
| Command Execution | ✅ | ✅ | Configurable |
| Container Management | ❌ | ✅ | Configurable |
| Pull Request Creation | ✅ | ✅ | Configurable |
| Testing & QA | ✅ | ✅ | Configurable |
| Deployment | ✅ | ✅ | Configurable |

*Custom agents can be configured with specific capability sets

## Creating Custom Agents

### Agent Blueprint
```typescript
// Custom agent example
export class CustomReactAgent extends BaseAgent {
  constructor() {
    super({
      id: 'react-specialist',
      name: 'React Specialist',
      capabilities: ['react', 'jsx', 'components', 'hooks'],
      tools: ['file_operations', 'code_analysis'],
      specializations: ['react-testing', 'component-library']
    });
  }
}
```

### Registration
```bash
# Register custom agent
/create-agent react-specialist "Specialized React development agent"

# Launch from blueprint
/launch-agent react-specialist-blueprint
```

## Agent Communication

### Inter-Agent Messaging
- Agents can communicate through the EventBus
- Shared context and state management
- Coordinated task execution

### Agent Orchestration
- Multi-agent workflows
- Task delegation and result aggregation
- Conflict resolution and consensus building

## Performance and Monitoring

### Metrics
- Task completion time
- Success/failure rates
- Resource utilization
- User satisfaction scores

### Optimization
- Automatic capability routing
- Context caching and reuse
- Response time optimization
- Error pattern analysis

## Best Practices

### When to Use Each Agent
- **Universal Agent**: General development tasks, full-stack projects
- **VM Agent**: Secure testing, isolated development, CI/CD
- **Custom Agents**: Domain-specific tasks, team workflows

### Effective Agent Usage
- Provide clear, specific task descriptions
- Include relevant context and constraints
- Break complex tasks into manageable pieces
- Review and validate agent outputs

## Troubleshooting

### Common Issues
- **Agent timeout**: Increase timeout or break task into smaller pieces
- **Context too large**: Use `/clear` to reset context
- **Tool access denied**: Check security policies and approvals

### Getting Help
- `/agent-help` - Agent-specific help
- `/debug agent` - Agent debugging information
- [Documentation](https://nikcli.mintifly.app/agent-system) - Complete agent guides

## Future Roadmap

- **Multi-modal agents** - Vision and audio processing
- **Learning agents** - Adaptive behavior based on usage
- **Agent marketplace** - Community-contributed agents
- **Enterprise agents** - Organization-specific workflows

---

For complete agent documentation, visit [nikcli.mintifly.app/agent-system](https://nikcli.mintifly.app/agent-system).