/**
 * Mermaid diagram → ASCII art renderer
 * Supports flowchart, sequence, gantt diagrams
 * Pure string output, no blessed dependencies
 */

/**
 * Main entry point: parse mermaid code and render to ASCII
 */
export function renderMermaidToASCII(mermaidCode: string): string {
  if (!mermaidCode || !mermaidCode.trim()) {
    return '[Empty diagram]'
  }

  const lines = mermaidCode.trim().split('\n')
  const firstLine = lines[0]?.toLowerCase().trim() || ''

  try {
    // Detect diagram type
    if (firstLine.includes('flowchart') || firstLine.includes('graph')) {
      return renderFlowchartASCII(mermaidCode)
    } else if (firstLine.includes('sequenceDiagram') || firstLine.includes('sequence')) {
      return renderSequenceDiagramASCII(mermaidCode)
    } else if (firstLine.includes('gantt')) {
      return renderGanttASCII(mermaidCode)
    } else if (firstLine.includes('classDiagram')) {
      return renderClassDiagramASCII(mermaidCode)
    } else if (firstLine.includes('stateDiagram')) {
      return renderStateDiagramASCII(mermaidCode)
    }

    return `[Mermaid diagram: ${firstLine}]`
  } catch (error) {
    return `[Diagram error: ${error instanceof Error ? error.message : 'unknown'}]`
  }
}

/**
 * Render flowchart/graph to ASCII
 */
function renderFlowchartASCII(code: string): string {
  const nodes = new Map<string, string>()
  const edges: Array<{ from: string; to: string; label?: string }> = []

  const lines = code.split('\n').map(l => l.trim()).filter(Boolean)

  // Parse nodes: ID["Label"], ID{Label}, ID([Label])
  for (const line of lines) {
    const nodeMatch = line.match(/(\w+)\[([\[\(]?)["']?([^"\'\]]*)["']?([\]\)]?)\]/)
    if (nodeMatch) {
      nodes.set(nodeMatch[1], nodeMatch[3] || nodeMatch[1])
      continue
    }
    
    const nodeMatch2 = line.match(/(\w+)\{["']?([^"\'{}]*)["']?\}/)
    if (nodeMatch2) {
      nodes.set(nodeMatch2[1], nodeMatch2[2] || nodeMatch2[1])
      continue
    }
  }

  // Parse edges: A --> B, A -->|label| B
  for (const line of lines) {
    const edgeMatch = line.match(/(\w+)\s*-+>?\|([^|]*)\|\s*(\w+)/)
    if (edgeMatch) {
      edges.push({
        from: edgeMatch[1],
        to: edgeMatch[3],
        label: edgeMatch[2].trim(),
      })
      continue
    }

    const edgeMatch2 = line.match(/(\w+)\s*(?:-->|--|-|->)\s*(\w+)/)
    if (edgeMatch2) {
      edges.push({
        from: edgeMatch2[1],
        to: edgeMatch2[2],
      })
    }
  }

  // Build ASCII output
  let output = ''

  // Simple linear flow for now
  if (nodes.size === 0) {
    return '[Empty flowchart]'
  }

  const nodeArray = Array.from(nodes.entries())

  for (let i = 0; i < nodeArray.length; i++) {
    const [id, label] = nodeArray[i]
    const boxWidth = Math.max(label.length + 4, 14)
    const padding = Math.max(0, (boxWidth - label.length - 2) / 2)

    if (i > 0) output += '\n    ↓\n'

    output += `┌${'─'.repeat(boxWidth - 2)}┐\n`
    output += `│${' '.repeat(Math.floor(padding))}${label}${' '.repeat(Math.ceil(padding))}│\n`
    output += `└${'─'.repeat(boxWidth - 2)}┘`
  }

  return output
}

/**
 * Render sequence diagram to ASCII
 */
function renderSequenceDiagramASCII(code: string): string {
  const actors = new Set<string>()
  const messages: Array<{ from: string; to: string; text: string }> = []

  const lines = code.split('\n').map(l => l.trim()).filter(Boolean)

  // Parse participants
  for (const line of lines) {
    const participantMatch = line.match(/participant\s+(\w+)/)
    if (participantMatch) {
      actors.add(participantMatch[1])
    }
  }

  // Parse messages: A->B: message
  for (const line of lines) {
    const msgMatch = line.match(/(\w+)\s*(?:->|->>)\s*(\w+)\s*:\s*(.+)/)
    if (msgMatch) {
      messages.push({
        from: msgMatch[1],
        to: msgMatch[2],
        text: msgMatch[3].trim(),
      })
    }
  }

  if (actors.size === 0) {
    return '[Empty sequence diagram]'
  }

  const actorArray = Array.from(actors)
  const colWidth = Math.max(...actorArray.map(a => a.length)) + 2

  // Header
  let output = ''
  output += '┌'
  for (let i = 0; i < actorArray.length; i++) {
    output += '─'.repeat(colWidth)
    if (i < actorArray.length - 1) output += '┬'
  }
  output += '┐\n'

  // Actor names
  output += '│'
  for (const actor of actorArray) {
    const padding = Math.max(0, (colWidth - actor.length) / 2)
    output += ' '.repeat(Math.floor(padding)) + actor + ' '.repeat(Math.ceil(padding))
    output += '│'
  }
  output += '\n'

  // Separator
  output += '├'
  for (let i = 0; i < actorArray.length; i++) {
    output += '─'.repeat(colWidth)
    if (i < actorArray.length - 1) output += '┼'
  }
  output += '┤\n'

  // Messages (simplified: show as text)
  for (const msg of messages) {
    output += `│ ${msg.from} → ${msg.to}: ${msg.text}\n`
  }

  // Footer
  output += '└'
  for (let i = 0; i < actorArray.length; i++) {
    output += '─'.repeat(colWidth)
    if (i < actorArray.length - 1) output += '┴'
  }
  output += '┘'

  return output
}

/**
 * Render Gantt chart to ASCII
 */
function renderGanttASCII(code: string): string {
  const tasks: Array<{ name: string; start: number; duration: number }> = []

  const lines = code.split('\n').map(l => l.trim()).filter(Boolean)

  // Parse tasks: taskName :done, 2024-01-01, 30d
  // Simplified: extract task names and show as bars
  for (const line of lines) {
    // Simple pattern: word : ...
    const taskMatch = line.match(/^(\w+)\s*:/)
    if (taskMatch) {
      const name = taskMatch[1]
      // Extract duration (rough estimate)
      const durationMatch = line.match(/(\d+)([dhw])/)
      let duration = 30
      if (durationMatch) {
        const num = parseInt(durationMatch[1])
        const unit = durationMatch[2]
        duration = unit === 'd' ? num : unit === 'w' ? num * 7 : num * 24
      }
      tasks.push({ name, start: 0, duration: Math.min(duration, 50) })
    }
  }

  if (tasks.length === 0) {
    return '[Empty Gantt chart]'
  }

  let output = 'Gantt Chart\n'
  output += '─'.repeat(50) + '\n'

  for (const task of tasks) {
    const barLength = Math.max(1, Math.round(task.duration / 2))
    const bar = '█'.repeat(barLength) + '░'.repeat(Math.max(0, 25 - barLength))
    output += `${task.name.padEnd(12)} ${bar} ${task.duration}%\n`
  }

  return output
}

/**
 * Render class diagram to ASCII
 */
function renderClassDiagramASCII(code: string): string {
  const classes = new Map<string, string[]>()

  const lines = code.split('\n').map(l => l.trim()).filter(Boolean)

  // Parse class: class ClassName { ...methods... }
  for (const line of lines) {
    const classMatch = line.match(/class\s+(\w+)/)
    if (classMatch) {
      classes.set(classMatch[1], [])
    }
  }

  if (classes.size === 0) {
    return '[Empty class diagram]'
  }

  let output = ''

  for (const [className, members] of classes) {
    const width = Math.max(className.length + 4, 16)
    output += '┌' + '─'.repeat(width - 2) + '┐\n'
    output += `│ ${className.padEnd(width - 4)} │\n`
    output += '├' + '─'.repeat(width - 2) + '┤\n'
    output += '└' + '─'.repeat(width - 2) + '┘\n'
  }

  return output
}

/**
 * Render state diagram to ASCII
 */
function renderStateDiagramASCII(code: string): string {
  const states = new Set<string>()

  const lines = code.split('\n').map(l => l.trim()).filter(Boolean)

  // Parse states
  for (const line of lines) {
    const stateMatch = line.match(/\[?\*?\]?\s*-->\s*(\w+)/)
    if (stateMatch) {
      states.add(stateMatch[1])
    }
  }

  if (states.size === 0) {
    return '[Empty state diagram]'
  }

  let output = ''

  for (const state of states) {
    const width = Math.max(state.length + 4, 12)
    output += '●' + ' '.repeat(2) + state + '\n'
  }

  return output
}

/**
 * Check if text contains Mermaid diagram
 */
export function containsMermaid(text: string): boolean {
  return /```mermaid\n/i.test(text) || /^(graph|flowchart|sequenceDiagram|gantt|classDiagram|stateDiagram)/m.test(text)
}
