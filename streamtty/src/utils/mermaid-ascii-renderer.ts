/**
 * Mermaid to ASCII Art Renderer
 * Converts Mermaid diagram syntax to beautiful ASCII art
 */

interface DiagramNode {
  id: string;
  label: string;
  shape?: 'box' | 'diamond' | 'rounded' | 'circle';
}

interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
}

/**
 * Parse Mermaid flowchart syntax
 */
function parseFlowchart(code: string): {
  nodes: DiagramNode[];
  connections: DiagramConnection[];
} {
  const lines = code.split('\n');
  const nodes: DiagramNode[] = [];
  const connections: DiagramConnection[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    // Skip graph definition line
    if (/^(graph|flowchart)/.test(trimmed)) continue;

    // Parse node definitions: ID[Label]
    const nodeMatch = trimmed.match(/(\w+)\[([^\]]+)\]/);
    if (nodeMatch) {
      const [, id, label] = nodeMatch;
      nodes.push({
        id,
        label: label.trim(),
        shape: 'box',
      });
    }

    // Parse node with shapes: ID{Label} (diamond)
    const diamondMatch = trimmed.match(/(\w+)\{([^\}]+)\}/);
    if (diamondMatch) {
      const [, id, label] = diamondMatch;
      nodes.push({
        id,
        label: label.trim(),
        shape: 'diamond',
      });
    }

    // Parse connections: A --> B
    const connMatch = trimmed.match(/(\w+)\s*--[>|-]*\s*(\w+)/);
    if (connMatch) {
      const [, from, to] = connMatch;
      // Extract label if present: A -->|label| B
      const labelMatch = trimmed.match(/--\|([^|]+)\|/);
      connections.push({
        from,
        to,
        label: labelMatch ? labelMatch[1].trim() : undefined,
      });
    }
  }

  return { nodes, connections };
}

/**
 * Draw a single node in ASCII
 */
function drawNode(node: DiagramNode, width: number = 15): string[] {
  const padding = 2;
  const maxLabelWidth = width - padding * 2;

  // Wrap label if too long
  const lines: string[] = [];
  let currentLine = '';

  for (const word of node.label.split(' ')) {
    if ((currentLine + ' ' + word).length <= maxLabelWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  const boxLines: string[] = [];
  const boxWidth = Math.max(width, Math.max(...lines.map(l => l.length)) + padding * 2);

  if (node.shape === 'diamond') {
    // Diamond shape
    boxLines.push('  ' + '◇'.repeat(boxWidth / 2));
    for (const line of lines) {
      boxLines.push(line.padStart(line.length + padding).padEnd(boxWidth));
    }
    boxLines.push('  ' + '◇'.repeat(boxWidth / 2));
  } else {
    // Box shape (default)
    boxLines.push('┌' + '─'.repeat(boxWidth - 2) + '┐');
    for (const line of lines) {
      boxLines.push('│ ' + line.padEnd(boxWidth - 4) + ' │');
    }
    boxLines.push('└' + '─'.repeat(boxWidth - 2) + '┘');
  }

  return boxLines;
}

/**
 * Simple flowchart layout
 */
function layoutFlowchart(
  nodes: DiagramNode[],
  connections: DiagramConnection[]
): Map<string, { x: number; y: number; lines: string[] }> {
  const layout = new Map<string, { x: number; y: number; lines: string[] }>();

  if (nodes.length === 0) return layout;

  // Calculate node positions
  const nodeWidth = 15;
  const nodeHeight = 5;
  const spacing = 5;

  let currentY = 2;

  // Simple linear layout (could be improved with graph layout algorithms)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const lines = drawNode(node, nodeWidth);

    layout.set(node.id, {
      x: 5,
      y: currentY,
      lines,
    });

    currentY += lines.length + spacing + 2;
  }

  return layout;
}

/**
 * Render flowchart to ASCII
 */
function renderFlowchartASCII(code: string): string {
  const { nodes, connections } = parseFlowchart(code);

  if (nodes.length === 0) {
    return '[Mermaid Diagram - No nodes found]';
  }

  const layout = layoutFlowchart(nodes, connections);

  // Calculate canvas size
  let maxX = 0;
  let maxY = 0;

  for (const [, pos] of layout) {
    maxX = Math.max(maxX, pos.x + 20);
    maxY = Math.max(maxY, pos.y + pos.lines.length + 2);
  }

  // Initialize canvas
  const canvas: string[][] = Array(maxY)
    .fill(null)
    .map(() => Array(maxX).fill(' '));

  // Draw nodes
  for (const [nodeId, pos] of layout) {
    for (let i = 0; i < pos.lines.length; i++) {
      const line = pos.lines[i];
      for (let j = 0; j < line.length && j < maxX - pos.x; j++) {
        canvas[pos.y + i][pos.x + j] = line[j];
      }
    }
  }

  // Draw connections
  for (const conn of connections) {
    const from = layout.get(conn.from);
    const to = layout.get(conn.to);

    if (from && to) {
      drawConnection(canvas, from, to, conn.label);
    }
  }

  // Convert canvas to string
  return canvas.map(row => row.join('')).join('\n');
}

/**
 * Draw connection between two nodes
 */
function drawConnection(
  canvas: string[][],
  from: { x: number; y: number; lines: string[] },
  to: { x: number; y: number; lines: string[] },
  label?: string
): void {
  const fromY = from.y + from.lines.length;
  const toY = to.y;

  // Draw vertical line
  for (let y = fromY; y < toY; y++) {
    if (y >= 0 && y < canvas.length) {
      canvas[y][from.x + 7] = '│';
    }
  }

  // Draw arrow
  if (toY > fromY && from.x + 7 < canvas[toY - 1].length) {
    canvas[toY - 1][from.x + 7] = '▼';
  }
}

/**
 * Simple sequence diagram to ASCII
 */
function renderSequenceASCII(code: string): string {
  const lines = code.split('\n');
  const actors: string[] = [];
  const messages: Array<{ from: string; to: string; msg: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse actor lines
    if (trimmed.startsWith('participant ')) {
      const actor = trimmed.replace('participant', '').trim();
      if (actor && !actors.includes(actor)) {
        actors.push(actor);
      }
    }

    // Parse messages: A->>B: message
    const msgMatch = trimmed.match(/(\w+)\s*-*>+\s*(\w+)\s*:\s*(.+)/);
    if (msgMatch) {
      const [, from, to, msg] = msgMatch;
      messages.push({ from, to, msg });
    }
  }

  if (actors.length === 0) {
    return '[Sequence Diagram - No participants]';
  }

  // Render sequence diagram
  const result: string[] = [];
  const colWidth = 15;

  // Header with actors
  let header = '';
  for (const actor of actors) {
    header += actor.padEnd(colWidth);
  }
  result.push(header);

  // Separator
  result.push('─'.repeat(header.length));

  // Messages
  for (const msg of messages) {
    const fromIdx = actors.indexOf(msg.from);
    const toIdx = actors.indexOf(msg.to);

    if (fromIdx >= 0 && toIdx >= 0) {
      let line = ' '.repeat(fromIdx * colWidth);
      const arrow = fromIdx < toIdx ? '─>' : '<─';
      const arrowCount = Math.abs(toIdx - fromIdx);
      line += arrow + '─'.repeat(arrowCount * colWidth - 3);
      line += ` ${msg.msg}`;
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Simple Gantt chart to ASCII
 */
function renderGanttASCII(code: string): string {
  const lines = code.split('\n');
  const tasks: Array<{ name: string; start: string; end: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse tasks
    const taskMatch = trimmed.match(/(\w+)\s*:\s*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})/);
    if (taskMatch) {
      const [, name, start, end] = taskMatch;
      tasks.push({ name, start, end });
    }
  }

  if (tasks.length === 0) {
    return '[Gantt Chart - No tasks]';
  }

  // Render Gantt
  const result: string[] = [];
  result.push('Gantt Chart');
  result.push('─'.repeat(50));

  for (const task of tasks) {
    const nameCol = task.name.padEnd(15);
    const bar = '█'.repeat(20);
    result.push(`${nameCol} │${bar}│`);
  }

  return result.join('\n');
}

/**
 * Main rendering function
 */
export function renderMermaidToASCII(
  mermaidCode: string,
  options?: { maxWidth?: number; boxStyle?: 'simple' | 'rounded' }
): string {
  if (!mermaidCode || mermaidCode.trim().length === 0) {
    return '[Empty Mermaid Diagram]';
  }

  const code = mermaidCode.trim();

  try {
    // Detect diagram type
    if (code.match(/^(graph|flowchart)/m)) {
      return renderFlowchartASCII(code);
    } else if (code.match(/sequenceDiagram/m)) {
      return renderSequenceASCII(code);
    } else if (code.match(/^gantt/m)) {
      return renderGanttASCII(code);
    } else {
      // Fallback: try as flowchart
      return renderFlowchartASCII(code);
    }
  } catch (error) {
    console.warn('Mermaid rendering error:', error);
    return `[Mermaid Diagram - Parse Error]\n\n${code}`;
  }
}

/**
 * Detect if code is Mermaid syntax
 */
export function isMermaidCode(code: string): boolean {
  if (!code) return false;

  const mermaidKeywords = [
    'graph',
    'flowchart',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'gitGraph',
  ];

  const trimmed = code.trim().toLowerCase();
  return mermaidKeywords.some(keyword =>
    trimmed.startsWith(keyword.toLowerCase())
  );
}

/**
 * Format mermaid code for better readability
 */
export function formatMermaidCode(code: string): string {
  // Normalize whitespace
  let formatted = code
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('%%'))
    .join('\n');

  return formatted;
}
