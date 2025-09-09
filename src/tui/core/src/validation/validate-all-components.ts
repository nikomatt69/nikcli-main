import { z } from 'zod';
import { ComponentSchemas } from '../types/component-schemas';

type SchemaName = keyof typeof ComponentSchemas;

// Minimal valid props for each component schema in ComponentSchemas
const samples: Partial<Record<SchemaName, any>> = {
  // Layout
  box: {},
  flex: {},
  grid: {},
  stack: {},

  // Display
  text: { content: 'Hello' },
  heading: { text: 'Title' },
  paragraph: { text: 'Lorem ipsum' },
  avatar: { initials: 'AB' },

  // Interactive
  button: { text: 'Click' },
  textInput: {},
  textarea: {},
  select: { options: ['One','Two'] },
  checkbox: {},
  radioGroup: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },

  // Feedback
  progressBar: { value: 50 },
  spinner: {},
  badge: { text: 'New' },
  statusIndicator: { status: 'success' },

  // Data Display
  table: { headers: ['A','B'], rows: [[1,2]] },
  tree: { data: [{ id: '1', label: 'Node' }] },
  list: { items: [{ id: '1', label: 'Item' }] },

  // Overlay
  modal: { title: 'Modal' },
  tooltip: { content: 'Tip' },
  toast: { message: 'Saved' },

  // Navigation
  tabs: { tabs: [{ id: 't1', label: 'Tab 1' }] },
  breadcrumb: { items: [{ id: 'h', label: 'Home' }] },
  menu: { items: [{ id: '1', label: 'File' }] },

  // Utility
  divider: {},
  card: {},
  panel: { title: 'Panel' },
};

export function validateAllSchemas(): { passed: string[]; failed: { name: string; error: z.ZodError }[] } {
  const passed: string[] = [];
  const failed: { name: string; error: z.ZodError }[] = [];

  for (const name of Object.keys(ComponentSchemas) as SchemaName[]) {
    const schema = ComponentSchemas[name];
    const sample = samples[name] ?? {};
    const result = schema.safeParse(sample);
    if (result.success) passed.push(name);
    else failed.push({ name, error: result.error });
  }
  return { passed, failed };
}

// CLI runner
if (require.main === module) {
  const { passed, failed } = validateAllSchemas();
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) {
      console.log(`\n— ${f.name}`);
      console.log(f.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
    process.exitCode = 1;
  }
}
