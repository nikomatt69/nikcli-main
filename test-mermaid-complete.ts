#!/usr/bin/env ts-node

/**
 * Complete test for Mermaid rendering with feature detection
 */

import { VisualFormatter } from './src/cli/ui/visual-formatters'
import { TerminalCapabilityDetector } from './src/cli/utils/terminal-capabilities'

console.log('🧪 Testing Complete Mermaid Rendering System\n')
console.log('═'.repeat(80))

// Test 1: Terminal Capabilities
console.log('\n📊 Terminal Capabilities:')
console.log(TerminalCapabilityDetector.getCapabilitiesDescription())
console.log('═'.repeat(80))

const formatter = new VisualFormatter()

// Test 2: Simple diagram (supported)
console.log('\n✅ Test 1: Simple Flowchart (Supported Features)')
console.log('─'.repeat(80))
const simpleCode = `graph LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Success]
    B -->|No| D[Retry]
    C --> E[End]
    D --> B`

const simpleRendered = formatter.formatCodeBlock(simpleCode, 'mermaid')
console.log(simpleRendered)

// Test 3: Complex diagram with unsupported features
console.log('\n⚠️  Test 2: Complex Diagram (Unsupported Features)')
console.log('─'.repeat(80))
const complexCode = `graph TB
    subgraph "Phase 1"
        A[Start<br/>Initialize] --> B[Process]
        B --> C{Check}
    end

    subgraph "Phase 2"
        C -->|OK| D[Continue]
        C -->|Error| E[Retry]
    end

    classDef critical fill:#ff6b6b,stroke:#c92a2a
    class A,E critical`

const complexRendered = formatter.formatCodeBlock(complexCode, 'mermaid')
console.log(complexRendered)

// Test 4: Unsupported diagram type
console.log('\n❌ Test 3: Unsupported Diagram Type')
console.log('─'.repeat(80))
const sequenceCode = `sequenceDiagram
    User->>API: Request
    API->>Database: Query
    Database-->>API: Data
    API-->>User: Response`

const sequenceRendered = formatter.formatCodeBlock(sequenceCode, 'mermaid')
console.log(sequenceRendered)

console.log('\n═'.repeat(80))
console.log('✅ All tests completed!\n')
