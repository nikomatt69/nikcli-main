# AI Agent Prompts & Automation System

This folder contains all the prompts, system prompts, and configurations for the continuous automation of the multi-agent AI CLI system.

## Structure

```
prompts/
├── system/                 # System prompts for each agent
│   ├── base-agent.txt     # Base prompt for all agents
│   ├── frontend-agent.txt # System prompt for Frontend Agent
│   ├── backend-agent.txt  # System prompt for Backend Agent
│   └── testing-agent.txt  # System prompt for Testing Agent
├── user/                  # User prompt templates
│   ├── task-templates.txt # Templates for different task types
│   └── interaction-flows.txt # Interaction flows
├── planning/              # Automatic planning system
│   ├── human-level-plans.txt # Human-understandable plans
│   ├── todo-templates.txt    # Templates for automatic TODOs
│   └── execution-flows.txt   # Execution flows
├── automation/            # Automation configurations
│   ├── continuous-mode.txt   # Continuous mode
│   ├── approval-rules.txt    # Rules for automatic approval
│   └── safety-checks.txt     # Security checks
└── logs/                  # Logs and tracking
    ├── execution-log.md      # Execution log
    ├── decision-log.md       # Decision log
    └── human-feedback.md     # Human feedback collected
```

## Usage

1. **System Prompts**: Define the behavior and capabilities of each agent
2. **User Templates**: Provide templates for common interactions
3. **Planning**: Manage automatic and human-readable planning
4. **Automation**: Configure continuous execution and security rules
5. **Logs**: Track all activities for transparency and debugging

## Continuous Mode

The system can operate in continuous mode, executing tasks automatically based on:
- Pre-approved plans
- Configured security rules
- Previous human feedback
- Success metrics

## Transparency

All processes are tracked and documented to maintain complete transparency in the decisions and actions of the AI agents.
