import { describe, it, expect } from 'vitest';
import { agentService } from '../cli/services/agent-service';

describe('AgentService - dynamic selection and execution', () => {
  it('returns a taskId and falls back to a valid agent for unknown agentType', async () => {
    const taskId = await agentService.executeTask('unknown-agent', 'Quick sanity task', {});
    expect(typeof taskId).toBe('string');
    expect(taskId.length).toBeGreaterThan(0);

    // Poll status up to 5s
    const start = Date.now();
    let status = agentService.getTaskStatus(taskId);
    while ((!status || (status.status !== 'completed' && status.status !== 'failed')) && Date.now() - start < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      status = agentService.getTaskStatus(taskId);
    }

    expect(status).toBeDefined();
    expect(status?.id).toBe(taskId);
  });

  it('queues beyond max concurrency and never exceeds 3 active agents', async () => {
    const tasks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await agentService.executeTask('auto', `Background task ${i + 1}`, {});
      tasks.push(id);
    }

    // Shortly after dispatch, at most 3 active
    await new Promise(resolve => setTimeout(resolve, 150));
    const active = agentService.getActiveAgents();
    expect(active.length).toBeLessThanOrEqual(3);

    // Wait up to 8s for all to resolve
    const start = Date.now();
    const pending = new Set(tasks);
    while (pending.size > 0 && Date.now() - start < 8000) {
      for (const id of [...pending]) {
        const status = agentService.getTaskStatus(id);
        if (status && (status.status === 'completed' || status.status === 'failed')) {
          pending.delete(id);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    expect(pending.size).toBe(0);
  });
});

