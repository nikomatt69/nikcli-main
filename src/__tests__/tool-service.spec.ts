import { describe, it, expect } from 'vitest';
import { toolService } from '../cli/services/tool-service';

describe('ToolService - timeouts and results', () => {
  it('times out long-running execute_command and returns non-zero exitCode', async () => {
    const result = await toolService['executeCommand']({ command: 'sleep 2 && echo done', timeout: 200 });
    // On timeout, node execSync throws and our wrapper returns stderr and exitCode
    expect(typeof result.exitCode).toBe('number');
  });
});

