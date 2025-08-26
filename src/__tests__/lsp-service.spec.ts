import { describe, it, expect } from 'vitest';
import { lspService } from '../cli/services/lsp-service';

describe('LSPService - startup timeout handling', () => {
  it('gracefully handles startup failure/timeout', async () => {
    // Assuming a likely-missing server key to trigger error handling
    const ok = await lspService.startServer('nonexistent');
    expect(ok).toBe(false);
  });
});

