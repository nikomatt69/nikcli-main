# Tool-Specific System Prompts

Each tool, action, and command has its own dedicated system prompt for maximum precision and control.

## Structure

```
prompts/tools/
├── atomic-tools/           # Prompts for atomic tools
│   ├── read-file-tool.txt
│   ├── write-file-tool.txt
│   ├── replace-in-file-tool.txt
│   ├── run-command-tool.txt
│   └── find-files-tool.txt
├── analysis-tools/         # Prompts for analysis tools
│   ├── grep-search.txt
│   ├── codebase-search.txt
│   └── file-analysis.txt
├── agent-actions/          # Prompts for agent actions
│   ├── task-execution.txt
│   ├── error-handling.txt
│   ├── result-formatting.txt
│   └── collaboration.txt
├── cli-commands/           # Prompts for CLI commands
│   ├── chat-command.txt
│   ├── plan-command.txt
│   ├── agent-command.txt
│   └── list-command.txt
├── workflow-steps/         # Prompts for workflow steps
│   ├── analysis-step.txt
│   ├── implementation-step.txt
│   ├── testing-step.txt
│   └── deployment-step.txt
└── safety-prompts/         # Prompts for security checks
    ├── approval-required.txt
    ├── risk-assessment.txt
    └── rollback-procedures.txt
```

## Principles of Tool Prompts

1. **SPECIFICITY**: Each prompt is optimized for the specific tool
2. **CONTEXT**: Includes the operational context of the tool
3. **SAFETY**: Defines limits and security checks
4. **OUTPUT**: Specifies the expected output format
5. **ERROR HANDLING**: Specific error handling for the tool

## Usage

Each tool automatically loads its own system prompt before execution to ensure:
- Consistent and predictable behavior
- Appropriate security checks
- Correctly formatted output
- Specific error handling
- Adequate logging and tracking
