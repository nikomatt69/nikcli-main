# NikDrive Provider

Cloud storage provider for NikCLI that integrates with NikDrive (S3-compatible cloud storage).

## Architecture

```
┌─────────────────────────┐
│  Advanced Tools (AI)    │  getNikDriveTool() for agents
└────────────┬────────────┘
             │
┌─────────────┴────────────────────┐
│  Tool Service / Tool Registry    │  Tool execution framework
└────────────┬─────────────────────┘
             │
┌─────────────┴──────────┐
│  NikDriveTool (BaseTool)  │  CLI wrapper for operations
└────────────┬──────────────┘
             │
┌─────────────┴─────────────────────┐
│  NikDriveProvider (Singleton)     │  HTTP client + business logic
│  - HTTP Client (axios)             │
│  - File operations                 │
│  - Health checks                   │
│  - Event emitting                  │
└────────────┬──────────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
┌───▼───────┐   ┌──────▼──────┐
│  Config   │   │  NikDrive   │
│ Manager   │   │    API      │
└───────────┘   └─────────────┘
```

## Files

### `nikdrive-provider.ts`
- `NikDriveProvider` class - Main provider implementation
- Singleton instance `nikdriveProvider`
- HTTP client with automatic retries
- Event emitter for progress tracking

### `index.ts`
- Exports provider and all types

## Key Methods

```typescript
// Connection
connect(): Promise<boolean>
getHealth(): Promise<NikDriveHealth>

// File Operations
uploadFile(filePath: string, destination?: string): Promise<NikDriveUploadResult>
downloadFile(fileId: string, destinationPath: string): Promise<void>
deleteFile(fileId: string): Promise<boolean>

// Folder Operations
createFolder(name: string, parentId?: string): Promise<NikDriveFolder>

// Search & List
listFiles(folderId?: string): Promise<NikDriveFile[]>
searchFiles(query: string, limit?: number): Promise<NikDriveSearchResult[]>

// Sharing
createShareLink(fileId: string, expiresIn?: number): Promise<NikDriveShareLink>

// Sync
syncWorkspace(localPath: string, cloudPath?: string): Promise<NikDriveSyncStats>
```

## Configuration

Configured through `config-manager.ts`:

```typescript
nikdrive: {
  enabled: boolean
  endpoint: string                    // Default: https://nikcli-drive-production.up.railway.app
  apiKey: string                     // Encrypted
  timeout: number                    // Default: 30000ms
  retries: number                    // Default: 3
  retryDelayMs: number              // Default: 1000ms
  features: {
    syncWorkspace: boolean           // Default: false
    autoBackup: boolean              // Default: false
    shareEnabled: boolean            // Default: true
    ragIndexing: boolean             // Default: false
    contextAware: boolean            // Default: true
  }
  autoSyncInterval: number          // Default: 3600000ms (1 hour)
  cacheTtl: number                  // Default: 300s
}
```

## Usage Examples

### Direct Provider Usage
```typescript
import { nikdriveProvider } from './providers/nikdrive'

const health = await nikdriveProvider.getHealth()
if (health.connected) {
  const result = await nikdriveProvider.uploadFile('./file.ts', '/code')
  console.log(`Uploaded: ${result.fileName}`)
}
```

### Via Tool System
```typescript
import { toolRegistry } from './tools/tool-registry'

const nikdriveTool = toolRegistry.getTool('nikdrive-tool')
const result = await nikdriveTool.execute('upload', './file.ts', '/code')
```

### Via AI SDK Tools
```typescript
const advancedTools = new AdvancedTools()
const nikdriveTool = advancedTools.getNikDriveTool()
// Use in agent systems with structured parameters
```

## Error Handling

Provider automatically:
- Retries failed requests (exponential backoff)
- Handles connection timeouts gracefully
- Returns detailed error messages
- Emits error events for monitoring

## Events

Provider emits:
- `connected` - Successfully connected
- `disconnected` - Connection lost
- `reconnected` - Reconnection successful
- `fileUploaded` - File successfully uploaded
- `fileDownloaded` - File successfully downloaded
- `fileDeleted` - File successfully deleted
- `folderCreated` - Folder successfully created
- `shareLinkCreated` - Share link created
- `syncComplete` - Sync operation completed
- `syncError` - Error during sync
- `syncProgress` - Sync progress update
- `healthCheck` - Health check completed
- `healthCheckError` - Health check failed
- `error` - General error

## Integration Points

1. **Config Manager** (`src/cli/core/config-manager.ts`)
   - Configuration schema and getters/setters

2. **Tool Registry** (`src/cli/tools/tool-registry.ts`)
   - Tool registration and metadata

3. **Advanced Tools** (`src/cli/core/advanced-tools.ts`)
   - AI SDK tool for agent access

4. **Tool Service** (`src/cli/services/tool-service.ts`)
   - Tool execution service integration (optional)

5. **CLI Commands** (`src/cli/chat/nik-cli-commands.ts`)
   - CLI command handler

6. **Main Loop** (`src/cli/nik-cli.ts`)
   - Command routing

## Testing

```bash
# Enable for testing
/set-key nikdrive <test_api_key>

# Check connection
/nikdrive status

# Test upload
/nikdrive upload ./test-file.txt /test

# Test sync
/nikdrive sync ./src /test-sync
```

## Security Notes

- API keys are encrypted with AES-256-GCM
- Keys derived from machine ID for per-machine encryption
- No plain text API keys stored
- HTTP client configured for secure HTTPS
- Path validation prevents directory traversal

## Performance Considerations

- File cache (5 minute TTL) reduces API calls
- Automatic retry prevents transient failures
- Concurrent uploads/downloads supported
- Sync operation optimized with bidirezionale diff
- Search uses server-side filtering
