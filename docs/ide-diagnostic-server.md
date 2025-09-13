# IDE Diagnostic Server

The IDE Diagnostic Server is a built-in MCP (Model Context Protocol) server that provides real-time project analysis, build diagnostics, linting, testing, and version control status. It's automatically enabled and integrated into NikCLI workflows.

## Overview

The IDE Diagnostic Server automatically detects your project type and available tools, providing standardized diagnostic information across different development environments. It supports:

- **Build Systems**: Next.js, Vite, TypeScript, Make
- **Linters**: ESLint, Biome, Ruff (Python)  
- **Test Runners**: Vitest, Jest, Pytest, Cargo, Go
- **Version Control**: Git
- **Package Managers**: npm, yarn, pnpm (auto-priority)

## MCP Tools Available

### Core Diagnostic Tools

#### `diag.list`
Lists all current diagnostics with filtering options.

**Parameters:**
- `kind?`: Filter by diagnostic type (`build`, `lint`, `test`, `runtime`, `vcs`)
- `severity?`: Filter by severity (`error`, `warning`, `info`)
- `file?`: Filter by file path
- `dir?`: Filter by directory
- `source?`: Filter by tool source

**Returns:** Array of diagnostic objects

#### `diag.get`
Get diagnostics for a specific file and line.

**Parameters:**
- `file`: File path (required)
- `line?`: Optional line number

**Returns:** File diagnostics with related references

### Build & Analysis Tools

#### `build.run`
Executes detected build tool and captures diagnostics.

**Returns:**
```json
{
  "summary": {
    "success": true,
    "duration": 1250,
    "errors": 0,
    "warnings": 2,
    "command": "npm run build",
    "exitCode": 0
  },
  "diagnostics": [...]
}
```

#### `lint.run`
Runs detected linter and captures issues.

**Returns:**
```json
{
  "summary": {
    "errors": 0,
    "warnings": 3,
    "files": 15
  },
  "diagnostics": [...]
}
```

#### `test.run`
Executes test suite and captures failures.

**Returns:**
```json
{
  "summary": {
    "total": 42,
    "passed": 40,
    "failed": 2,
    "skipped": 0,
    "duration": 3500,
    "command": "npm test"
  },
  "diagnostics": [...]
}
```

### Version Control Tools

#### `vcs.status`
Get Git repository status.

**Returns:**
```json
{
  "branch": "main",
  "ahead": 2,
  "behind": 0,
  "staged": [{"file": "src/app.ts", "status": "M"}],
  "unstaged": [{"file": "README.md", "status": "M"}],
  "untracked": ["temp.log"]
}
```

#### `vcs.diff`
Get Git diff output.

**Parameters:**
- `path?`: Specific file path
- `staged?`: Show staged changes (default: false)

**Returns:** Unified diff string

### Runtime & Project Tools

#### `runtime.logs`
Read application logs.

**Parameters:**
- `service?`: Service name filter
- `lines?`: Number of lines (default: 100)
- `cursor?`: Pagination cursor

**Returns:**
```json
{
  "logs": [
    {
      "timestamp": 1700000000000,
      "level": "error",
      "message": "Connection failed",
      "source": "api-server"
    }
  ],
  "nextCursor": "..."
}
```

#### `graph.project`
Get project dependency graph.

**Returns:**
```json
{
  "nodes": [
    {
      "id": "my-app",
      "type": "package",
      "path": "package.json",
      "dependencies": ["react", "typescript"]
    }
  ],
  "edges": [
    {"from": "my-app", "to": "react", "type": "dependency"}
  ]
}
```

### Event Streaming

#### `diag.subscribe`
Subscribe to real-time diagnostic events.

**Returns:** Subscription confirmation and event types

**Events emitted:**
- `fs-change`: File system changes
- `build`: Build completion
- `lint`: Lint completion  
- `test`: Test completion
- `runtime`: Runtime log updates
- `vcs`: VCS status changes

## CLI Commands

### `/diag` - Diagnostic Commands

```bash
/diag list                 # List all diagnostics
/diag file src/app.ts      # Get file-specific diagnostics
/diag build                # Run build diagnostics
/diag lint                 # Run lint diagnostics
/diag test                 # Run test diagnostics
/diag vcs                  # Show VCS status
/diag status               # Quick status overview
```

### `/health` - Project Health Analysis

```bash
/health                    # Comprehensive project health check
```

## Auto-Detection Logic

### Build Tools (Priority Order)
1. **Next.js**: Detects `next` dependency → `npm run build`
2. **Vite**: Detects `vite` dependency → `npm run build` 
3. **TypeScript**: Detects `tsconfig.json` → `npx tsc --noEmit`
4. **Make**: Detects `Makefile` → `make build`

### Linters (Priority Order)
1. **ESLint**: Detects `.eslintrc.*` → `npx eslint . --format json`
2. **Biome**: Detects `biome.json` → `npx @biomejs/biome check . --reporter json`
3. **Ruff**: Detects Python files → `ruff check . --output-format json`

### Test Runners (Priority Order)
1. **Vitest**: Detects `vitest` dependency → `npm run test --reporter=json`
2. **Jest**: Detects `jest` dependency → `npm test --json`
3. **Pytest**: Detects Python test files → `python -m pytest --json-report`
4. **Cargo**: Detects `Cargo.toml` → `cargo test --message-format=json`
5. **Go**: Detects `go.mod` → `go test -json ./...`

### Package Managers (Priority Order)
1. **npm**: Default package manager
2. **yarn**: If `yarn --version` succeeds
3. **pnpm**: If `pnpm --version` succeeds

## Diagnostic Object Schema

```typescript
interface Diagnostic {
  kind: 'build' | 'lint' | 'test' | 'runtime' | 'vcs';
  file: string;                    // Relative path from repo root
  range?: {                        // Source location
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  message: string;                 // Human-readable description
  code?: string;                   // Error/rule code (e.g., "TS2304", "no-unused-vars")
  source: string;                  // Tool that generated it
  severity: 'error' | 'warning' | 'info';
  related?: DiagnosticRelated[];   // Connected diagnostics
  timestamp: number;               // When diagnostic was generated
}
```

## Security Features

- **Command Allowlist**: Only trusted commands can be executed
- **Timeout Protection**: All processes have configurable timeouts
- **Credential Redaction**: Sensitive information is automatically redacted from logs
- **No Network Access**: Server operates locally only
- **Process Management**: Safe process spawning and cleanup

## Performance Features

- **Incremental Cache**: Diagnostics cached for 5 minutes, invalidated on file changes
- **Deduplication**: Identical diagnostics are merged
- **Background Operations**: Non-blocking execution with proper cancellation
- **File Watching**: Efficient change detection with debouncing
- **Streaming Events**: Real-time updates without polling

## Workspace Support

The server automatically detects and handles:
- **Monorepos**: Executes tools per workspace and aggregates results
- **Multi-language projects**: Detects appropriate tools per file type
- **Mixed build systems**: Can handle multiple build/lint/test tools in same project

## Integration with Workflows

The IDE Diagnostic Server automatically integrates with:

- **Code Review**: Provides file-level diagnostics during review
- **Project Analysis**: Powers `/health` and project status commands  
- **Debug Workflows**: Surfaces build and runtime errors
- **CLI Status**: Shows quick diagnostic status in terminal

## Environment Variables

Override detection with environment variables:

```bash
# Force specific package manager
NIKCLI_PACKAGE_MANAGER=npm

# Force specific build command  
NIKCLI_BUILD_COMMAND="npm run custom-build"

# Force specific lint command
NIKCLI_LINT_COMMAND="npm run custom-lint"

# Force specific test command
NIKCLI_TEST_COMMAND="npm run custom-test"
```

## Troubleshooting

### No Tools Detected
- Ensure your project has recognizable config files (`package.json`, `tsconfig.json`, etc.)
- Check that tools are installed and available in PATH
- Use environment variables to override detection

### Slow Performance
- Check if project is very large (>10k files)
- Ensure SSD storage for better file watching performance
- Consider excluding large directories via `.gitignore`

### Missing Diagnostics
- Verify tools run successfully in terminal
- Check tool output format is supported
- Enable debug mode: `DEBUG=nikcli:diag npm run cli`

## Examples

### Basic Usage
```bash
# Check project health
/health

# Quick diagnostic overview
/diag status

# Run all checks
/diag build
/diag lint  
/diag test
```

### File-Specific Analysis
```bash
# Check specific file
/diag file src/components/Button.tsx

# List all errors
/diag list severity:error

# Check VCS status before commit
/diag vcs
```

### Using MCP Directly
```javascript
// Get all build diagnostics
const result = await mcpClient.call('ide-diagnostic', {
  method: 'build.run',
  params: {}
});

// Get file-specific issues
const fileIssues = await mcpClient.call('ide-diagnostic', {
  method: 'diag.get', 
  params: { file: 'src/app.ts', line: 42 }
});

// Subscribe to real-time events
const unsubscribe = ideDiagnosticServer.subscribe((event) => {
  console.log('Diagnostic update:', event);
});
```

The IDE Diagnostic Server provides a unified, zero-configuration interface to your development tools, making project analysis and debugging seamless within NikCLI workflows.