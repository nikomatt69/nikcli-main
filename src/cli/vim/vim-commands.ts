/**
 * NikCLI Vim Commands Integration
 * Seamless vim integration with intelligent command routing
 */

import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import VimManager from './vim-manager'
import type { VimModeConfig } from './vim-mode-manager'

export interface VimCommandResult {
  success: boolean
  message?: string
  data?: any
}

export class VimCommands {
  private vimManager: VimManager

  constructor() {
    this.vimManager = new VimManager()
  }

  /**
   * Setup vim configuration command
   */
  async setupVim(): Promise<VimCommandResult> {
    try {
      if (!VimManager.isVimAvailable()) {
        return {
          success: false,
          message: chalk.red('❌ Vim is not installed. Please install vim first.'),
        }
      }

      await this.vimManager.setupVim()
      return {
        success: true,
        message: chalk.green('✅ Vim setup completed successfully!'),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Edit file command
   */
  async editFile(
    filePath: string,
    options: {
      line?: number
      column?: number
      create?: boolean
      readonly?: boolean
    } = {}
  ): Promise<VimCommandResult> {
    try {
      // Resolve path
      const resolvedPath = path.resolve(filePath)

      // Check if file exists or create if requested
      if (!fs.existsSync(resolvedPath)) {
        if (options.create) {
          // Create directory if needed
          const dir = path.dirname(resolvedPath)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          // Create empty file
          fs.writeFileSync(resolvedPath, '')
          console.log(chalk.green(`✅ Created new file: ${path.basename(resolvedPath)}`))
        } else {
          return {
            success: false,
            message: chalk.red(`❌ File does not exist: ${filePath}. Use --create to create it.`),
          }
        }
      }

      const session = await this.vimManager.openFile(resolvedPath, {
        lineNumber: options.line,
        column: options.column,
        readonly: options.readonly,
      })

      return {
        success: true,
        message: chalk.green(`✅ Editing session completed for ${path.basename(filePath)}`),
        data: session,
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Quick edit command with content
   */
  async quickEdit(filePath: string, content?: string): Promise<VimCommandResult> {
    try {
      await this.vimManager.quickEdit(filePath, content)
      return {
        success: true,
        message: chalk.green(`✅ Quick edit completed for ${path.basename(filePath)}`),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Quick edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Diff files command
   */
  async diffFiles(file1: string, file2: string): Promise<VimCommandResult> {
    try {
      const path1 = path.resolve(file1)
      const path2 = path.resolve(file2)

      if (!fs.existsSync(path1)) {
        return {
          success: false,
          message: chalk.red(`❌ File does not exist: ${file1}`),
        }
      }

      if (!fs.existsSync(path2)) {
        return {
          success: false,
          message: chalk.red(`❌ File does not exist: ${file2}`),
        }
      }

      await this.vimManager.diffFiles(path1, path2)
      return {
        success: true,
        message: chalk.green(`✅ Diff completed for ${path.basename(file1)} vs ${path.basename(file2)}`),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Diff failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Show vim configuration
   */
  showConfig(): VimCommandResult {
    const config = this.vimManager.getConfig()

    console.log(chalk.blue.bold('\n🔧 NikCLI Vim Configuration'))
    console.log(chalk.cyan(`Theme: ${config.theme}`))
    console.log(chalk.cyan(`Line Numbers: ${config.lineNumbers ? 'enabled' : 'disabled'}`))
    console.log(chalk.cyan(`Syntax Highlighting: ${config.syntax ? 'enabled' : 'disabled'}`))
    console.log(chalk.cyan(`Auto Indent: ${config.autoIndent ? 'enabled' : 'disabled'}`))
    console.log(chalk.cyan(`Expand Tabs: ${config.expandTabs ? 'enabled' : 'disabled'}`))
    console.log(chalk.cyan(`Tab Width: ${config.tabWidth}`))

    console.log(chalk.blue.bold('\n📦 Installed Plugins:'))
    config.plugins.forEach((plugin) => {
      console.log(chalk.green(`  ✓ ${plugin}`))
    })

    console.log(chalk.blue.bold('\n⌨️ Custom Mappings:'))
    Object.entries(config.customMappings).forEach(([key, command]) => {
      console.log(chalk.yellow(`  ${key} → ${command}`))
    })

    return {
      success: true,
      data: config,
    }
  }

  /**
   * Add vim plugin
   */
  addPlugin(plugin: string): VimCommandResult {
    try {
      this.vimManager.addPlugin(plugin)
      return {
        success: true,
        message: chalk.green(`✅ Plugin added: ${plugin}`),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Failed to add plugin: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Remove vim plugin
   */
  removePlugin(plugin: string): VimCommandResult {
    try {
      this.vimManager.removePlugin(plugin)
      return {
        success: true,
        message: chalk.yellow(`🗑️ Plugin removed: ${plugin}`),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Failed to remove plugin: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Show active vim sessions
   */
  showSessions(): VimCommandResult {
    const sessions = this.vimManager.getActiveSessions()

    if (sessions.length === 0) {
      console.log(chalk.yellow('📭 No active vim sessions'))
      return { success: true }
    }

    console.log(chalk.blue.bold('\n📝 Active Vim Sessions'))
    sessions.forEach((session) => {
      console.log(chalk.green(`  📄 ${path.basename(session.file)}`))
      console.log(chalk.gray(`     Started: ${session.startTime.toLocaleTimeString()}`))
      console.log(chalk.gray(`     File: ${session.file}`))
      console.log(chalk.gray(`     Session ID: ${session.id}`))
    })

    return {
      success: true,
      data: sessions,
    }
  }

  /**
   * Show vim info and status
   */
  async showInfo(): Promise<VimCommandResult> {
    try {
      if (!VimManager.isVimAvailable()) {
        return {
          success: false,
          message: chalk.red('❌ Vim is not available on this system'),
        }
      }

      const vimInfo = await VimManager.getVimInfo()

      console.log(chalk.blue.bold('\n📊 Vim System Information'))
      console.log(chalk.cyan(`Version: ${vimInfo.version}`))
      console.log(chalk.cyan(`Features: ${vimInfo.features.length} available`))

      // Show key features
      const keyFeatures = ['+clipboard', '+python3', '+lua', '+ruby', '+perl']
      console.log(chalk.blue.bold('\n🔧 Key Features:'))
      keyFeatures.forEach((feature) => {
        const hasFeature = vimInfo.features.includes(feature)
        const status = hasFeature ? chalk.green('✓') : chalk.red('✗')
        console.log(`  ${status} ${feature}`)
      })

      // Check .vimrc
      const vimrcPath = path.join(require('os').homedir(), '.vimrc')
      const hasVimrc = fs.existsSync(vimrcPath)
      console.log(chalk.blue.bold('\n📝 Configuration:'))
      console.log(`  ${hasVimrc ? chalk.green('✓') : chalk.red('✗')} .vimrc exists`)

      return {
        success: true,
        data: vimInfo,
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Failed to get vim info: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Update vim configuration
   */
  updateConfig(updates: Partial<VimModeConfig>): VimCommandResult {
    try {
      this.vimManager.updateConfig(updates)
      return {
        success: true,
        message: chalk.green('✅ Configuration updated. Run vim-setup to apply changes.'),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Failed to update config: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  /**
   * Create template file with vim integration
   */
  async createTemplate(templateType: string, filePath: string): Promise<VimCommandResult> {
    try {
      const templates = {
        typescript: this.getTypeScriptTemplate(),
        javascript: this.getJavaScriptTemplate(),
        python: this.getPythonTemplate(),
        markdown: this.getMarkdownTemplate(),
        vue: this.getVueTemplate(),
        react: this.getReactTemplate(),
      }

      const template = templates[templateType as keyof typeof templates]
      if (!template) {
        return {
          success: false,
          message: chalk.red(
            `❌ Unknown template type: ${templateType}. Available: ${Object.keys(templates).join(', ')}`
          ),
        }
      }

      // Create file with template
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(filePath, template)
      console.log(chalk.green(`✅ Created ${templateType} template: ${path.basename(filePath)}`))

      // Open in vim
      await this.vimManager.openFile(filePath, { lineNumber: 10 })

      return {
        success: true,
        message: chalk.green(`✅ Template created and opened in vim`),
      }
    } catch (error) {
      return {
        success: false,
        message: chalk.red(`❌ Template creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      }
    }
  }

  private getTypeScriptTemplate(): string {
    return `/**
 * TypeScript Module
 * Created with NikCLI Vim Integration
 */

export interface ExampleInterface {
  id: string
  name: string
  timestamp: Date
}

export class ExampleClass {
  private data: ExampleInterface[]

  constructor() {
    this.data = []
  }

  public addItem(item: ExampleInterface): void {
    this.data.push(item)
  }

  public getItems(): ExampleInterface[] {
    return [...this.data]
  }

  public findById(id: string): ExampleInterface | undefined {
    return this.data.find(item => item.id === id)
  }
}

// Example usage
const example = new ExampleClass()
example.addItem({
  id: 'example-1',
  name: 'Example Item',
  timestamp: new Date()
})

export default ExampleClass
`
  }

  private getJavaScriptTemplate(): string {
    return `/**
 * JavaScript Module
 * Created with NikCLI Vim Integration
 */

class ExampleClass {
  constructor() {
    this.data = []
  }

  addItem(item) {
    this.data.push(item)
  }

  getItems() {
    return [...this.data]
  }

  findById(id) {
    return this.data.find(item => item.id === id)
  }
}

// Example usage
const example = new ExampleClass()
example.addItem({
  id: 'example-1',
  name: 'Example Item',
  timestamp: new Date()
})

module.exports = ExampleClass
`
  }

  private getPythonTemplate(): string {
    return `#!/usr/bin/env python3
"""
Python Module
Created with NikCLI Vim Integration
"""

from typing import List, Optional, Dict, Any
from datetime import datetime


class ExampleClass:
    """Example class demonstrating Python best practices."""

    def __init__(self):
        self.data: List[Dict[str, Any]] = []

    def add_item(self, item: Dict[str, Any]) -> None:
        """Add an item to the collection."""
        self.data.append(item)

    def get_items(self) -> List[Dict[str, Any]]:
        """Get all items."""
        return self.data.copy()

    def find_by_id(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Find item by ID."""
        return next((item for item in self.data if item.get('id') == item_id), None)


def main():
    """Main function."""
    example = ExampleClass()
    example.add_item({
        'id': 'example-1',
        'name': 'Example Item',
        'timestamp': datetime.now()
    })

    print(f"Items: {example.get_items()}")


if __name__ == '__main__':
    main()
`
  }

  private getMarkdownTemplate(): string {
    return `# Document Title

> Created with NikCLI Vim Integration

## Overview

Brief description of the document purpose.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Examples](#examples)
- [Contributing](#contributing)

## Installation

\`\`\`bash
npm install package-name
\`\`\`

## Usage

### Basic Usage

\`\`\`typescript
import { ExampleClass } from 'package-name'

const example = new ExampleClass()
example.doSomething()
\`\`\`

### Advanced Usage

Detailed examples and use cases.

## Examples

### Example 1: Basic Implementation

\`\`\`typescript
// Code example here
\`\`\`

### Example 2: Advanced Features

\`\`\`typescript
// Advanced code example
\`\`\`

## API Reference

### Methods

- \`method1(param: string): void\` - Description
- \`method2(param: number): string\` - Description

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

## License

MIT License
`
  }

  private getVueTemplate(): string {
    return `<template>
  <div class="example-component">
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>

    <div class="content">
      <ul v-if="items.length">
        <li v-for="item in items" :key="item.id">
          {{ item.name }}
        </li>
      </ul>
      <p v-else>No items available</p>
    </div>

    <button @click="addItem" class="btn-primary">
      Add Item
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

interface Item {
  id: string
  name: string
  timestamp: Date
}

const title = ref('Vue Component')
const description = ref('Created with NikCLI Vim Integration')
const items = reactive<Item[]>([])

const addItem = () => {
  const newItem: Item = {
    id: \`item-\${Date.now()}\`,
    name: \`Item \${items.length + 1}\`,
    timestamp: new Date()
  }
  items.push(newItem)
}
</script>

<style scoped>
.example-component {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.content {
  margin: 20px 0;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  background-color: #0056b3;
}
</style>
`
  }

  private getReactTemplate(): string {
    return `import React, { useState, useCallback } from 'react'
import './ExampleComponent.css'

interface Item {
  id: string
  name: string
  timestamp: Date
}

interface ExampleComponentProps {
  title?: string
  description?: string
}

const ExampleComponent: React.FC<ExampleComponentProps> = ({
  title = 'React Component',
  description = 'Created with NikCLI Vim Integration'
}) => {
  const [items, setItems] = useState<Item[]>([])

  const addItem = useCallback(() => {
    const newItem: Item = {
      id: \`item-\${Date.now()}\`,
      name: \`Item \${items.length + 1}\`,
      timestamp: new Date()
    }
    setItems(prev => [...prev, newItem])
  }, [items.length])

  return (
    <div className="example-component">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="content">
        {items.length > 0 ? (
          <ul>
            {items.map(item => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        ) : (
          <p>No items available</p>
        )}
      </div>

      <button onClick={addItem} className="btn-primary">
        Add Item
      </button>
    </div>
  )
}

export default ExampleComponent
`
  }
}

export default VimCommands
