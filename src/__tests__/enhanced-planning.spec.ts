import { describe, it, expect } from 'vitest';
import { enhancedPlanning } from '../cli/planning/enhanced-planning';

describe('EnhancedPlanning - read-only and dependency cleanup', () => {
  it('filters or skips commands/files when goal requests only grep/read', async () => {
    const goal = 'analizza la repo solo con grep e readfile (solo grep e read)';
    const plan = await enhancedPlanning.generatePlan(goal, {
      maxTodos: 6,
      includeContext: false,
      showDetails: false,
      saveTodoFile: false
    });

    // No commands should remain after filtering; files may be cleared or absent
    const hasCommands = plan.todos.some(t => (t.commands && t.commands.length > 0));
    expect(hasCommands).toBe(false);

    // Dependencies must reference existing todos only
    const ids = new Set(plan.todos.map(t => t.id));
    const badDeps = plan.todos.some(t => (t.dependencies || []).some(d => !ids.has(d)));
    expect(badDeps).toBe(false);
  });
});

