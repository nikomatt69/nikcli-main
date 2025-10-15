import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import type { AgentBlueprint } from './agent-factory'
import { advancedUI } from '../ui/advanced-cli-ui'
import type { CustomOutputStyle } from '../types/output-styles'

export interface BlueprintStorageConfig {
  storageDir: string
  maxBlueprints: number
  autoBackup: boolean
}

export interface StorageStats {
  blueprintCount: number
  storageSize: string
  storageDir: string
  oldestBlueprint?: string
  newestBlueprint?: string
}

/**
 * BlueprintStorage - Gestisce la persistenza degli agent blueprints
 *
 * Responsabilità:
 * - Salvare/caricare blueprints su filesystem
 * - Gestire directory di storage
 * - Backup e restore
 * - Ricerca e indicizzazione
 * - Pulizia e manutenzione
 */
export class BlueprintStorage {
  private config: BlueprintStorageConfig
  private initialized: boolean = false
  private initPromise?: Promise<void>
  private blueprintsCache: Map<string, AgentBlueprint> = new Map()
  private stylesCache: Map<string, CustomOutputStyle> = new Map()

  constructor(config?: Partial<BlueprintStorageConfig>) {
    this.config = {
      storageDir: path.join(os.homedir(), '.nikcli'),
      maxBlueprints: 100,
      autoBackup: true,
      ...config,
    }
  }

  /**
   * Get styles directory path
   */
  private getStylesDir(): string {
    return path.join(this.config.storageDir, 'styles')
  }

  /**
   * Get styles backup directory path
   */
  private getStylesBackupDir(): string {
    return path.join(this.config.storageDir, 'backups', 'styles')
  }

  /**
   * Inizializza il sistema di storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  /**
   * Inizializzazione interna
   */
  private async _initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Crea directory di storage se non esiste
      await fs.mkdir(this.config.storageDir, { recursive: true })

      // Crea subdirectory per backups
      const backupDir = path.join(this.config.storageDir, 'backups')
      await fs.mkdir(backupDir, { recursive: true })

      // Crea directory per styles
      const stylesDir = this.getStylesDir()
      await fs.mkdir(stylesDir, { recursive: true })

      // Crea backup directory per styles
      const stylesBackupDir = this.getStylesBackupDir()
      await fs.mkdir(stylesBackupDir, { recursive: true })

      // Carica tutti i blueprints esistenti
      await this.loadAllBlueprints()

      // Carica tutti gli styles esistenti
      await this.loadAllStyles()

      this.initialized = true
      advancedUI.logFunctionUpdate('info', chalk.gray(`📁 Blueprint storage initialized: ${this.config.storageDir}`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize blueprint storage: ${error.message}`))
      throw error
    }
  }

  /**
   * Salva un blueprint su filesystem
   */
  async saveBlueprint(blueprint: AgentBlueprint): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const filename = `${blueprint.id}.json`
      const filepath = path.join(this.config.storageDir, filename)

      // Aggiungi metadata per il tracking
      const blueprintWithMetadata = {
        ...blueprint,
        savedAt: new Date(),
        version: '1.0',
      }

      await fs.writeFile(filepath, JSON.stringify(blueprintWithMetadata, null, 2))

      // Aggiorna cache
      this.blueprintsCache.set(blueprint.id, blueprint)

      // Backup automatico se abilitato
      if (this.config.autoBackup) {
        await this.createBackup(blueprint.id)
      }

      advancedUI.logFunctionUpdate('info', chalk.gray(` Blueprint saved: ${blueprint.name} (${blueprint.id})`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to save blueprint: ${error.message}`))
      throw error
    }
  }

  /**
   * Carica un blueprint specifico
   */
  async loadBlueprint(blueprintId: string): Promise<AgentBlueprint | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Controlla prima nella cache
      if (this.blueprintsCache.has(blueprintId)) {
        return this.blueprintsCache.get(blueprintId)!
      }

      const filename = `${blueprintId}.json`
      const filepath = path.join(this.config.storageDir, filename)

      const content = await fs.readFile(filepath, 'utf-8')
      const blueprint = JSON.parse(content) as AgentBlueprint

      // Aggiorna cache
      this.blueprintsCache.set(blueprintId, blueprint)

      return blueprint
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null // File non trovato
      }
      console.error(chalk.red(`❌ Failed to load blueprint ${blueprintId}: ${error.message}`))
      throw error
    }
  }

  /**
   * Carica tutti i blueprints dalla directory
   */
  async loadAllBlueprints(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.storageDir)
      const blueprintFiles = files.filter((file) => file.endsWith('.json') && file !== 'config.json')

      this.blueprintsCache.clear()

      for (const file of blueprintFiles) {
        try {
          const filepath = path.join(this.config.storageDir, file)
          const content = await fs.readFile(filepath, 'utf-8')
          const blueprint = JSON.parse(content) as AgentBlueprint

          this.blueprintsCache.set(blueprint.id, blueprint)
        } catch (error: any) {
          console.error(chalk.yellow(`⚠️ Skipping invalid blueprint file ${file}: ${error.message}`))
        }
      }

      advancedUI.logFunctionUpdate('info', chalk.gray(`📋 Loaded ${this.blueprintsCache.size} blueprints from storage`))
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(chalk.red(`❌ Failed to load blueprints: ${error.message}`))
        throw error
      }
    }
  }

  /**
   * Ottieni tutti i blueprints
   */
  async getAllBlueprints(): Promise<AgentBlueprint[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    return Array.from(this.blueprintsCache.values())
  }

  /**
   * Trova blueprint per nome
   */
  async findBlueprintByName(name: string): Promise<AgentBlueprint | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    for (const blueprint of this.blueprintsCache.values()) {
      if (blueprint.name.toLowerCase() === name.toLowerCase()) {
        return blueprint
      }
    }
    return null
  }

  /**
   * Elimina un blueprint
   */
  async deleteBlueprint(blueprintId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const filename = `${blueprintId}.json`
      const filepath = path.join(this.config.storageDir, filename)

      await fs.unlink(filepath)
      this.blueprintsCache.delete(blueprintId)

      advancedUI.logFunctionUpdate('info', chalk.gray(`🗑️ Blueprint deleted: ${blueprintId}`))
      return true
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false // File già non esistente
      }
      console.error(chalk.red(`❌ Failed to delete blueprint: ${error.message}`))
      throw error
    }
  }

  /**
   * Esporta blueprint in un file specificato
   */
  async exportBlueprint(blueprintId: string, exportPath: string): Promise<boolean> {
    try {
      const blueprint = await this.loadBlueprint(blueprintId)
      if (!blueprint) {
        return false
      }

      await fs.writeFile(exportPath, JSON.stringify(blueprint, null, 2))
      advancedUI.logFunctionUpdate('info', chalk.green(`📤 Blueprint exported: ${exportPath}`))
      return true
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to export blueprint: ${error.message}`))
      return false
    }
  }

  /**
   * Importa blueprint da file
   */
  async importBlueprint(importPath: string): Promise<AgentBlueprint | null> {
    try {
      const content = await fs.readFile(importPath, 'utf-8')
      const blueprint = JSON.parse(content) as AgentBlueprint

      // Genera nuovo ID per evitare conflitti
      blueprint.id = this.generateBlueprintId()
      blueprint.createdAt = new Date()

      await this.saveBlueprint(blueprint)
      advancedUI.logFunctionUpdate('info', chalk.green(`📥 Blueprint imported: ${blueprint.name}`))
      return blueprint
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to import blueprint: ${error.message}`))
      return null
    }
  }

  /**
   * Cerca blueprints per query
   */
  async searchBlueprints(query: string): Promise<AgentBlueprint[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    const searchTerm = query.toLowerCase()
    const results: AgentBlueprint[] = []

    for (const blueprint of this.blueprintsCache.values()) {
      if (
        blueprint.name.toLowerCase().includes(searchTerm) ||
        blueprint.description.toLowerCase().includes(searchTerm) ||
        blueprint.specialization.toLowerCase().includes(searchTerm) ||
        blueprint.capabilities.some((cap) => cap.toLowerCase().includes(searchTerm))
      ) {
        results.push(blueprint)
      }
    }

    return results
  }

  /**
   * Ottieni statistiche dello storage
   */
  async getStorageStats(): Promise<StorageStats> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const files = await fs.readdir(this.config.storageDir)
      const blueprintFiles = files.filter((file) => file.endsWith('.json'))

      let totalSize = 0
      let oldestDate: Date | null = null
      let newestDate: Date | null = null
      let oldestBlueprint: string | undefined
      let newestBlueprint: string | undefined

      for (const file of blueprintFiles) {
        const filepath = path.join(this.config.storageDir, file)
        const stats = await fs.stat(filepath)
        totalSize += stats.size

        if (!oldestDate || stats.birthtime < oldestDate) {
          oldestDate = stats.birthtime
          oldestBlueprint = file.replace('.json', '')
        }

        if (!newestDate || stats.birthtime > newestDate) {
          newestDate = stats.birthtime
          newestBlueprint = file.replace('.json', '')
        }
      }

      const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
      }

      return {
        blueprintCount: this.blueprintsCache.size,
        storageSize: formatSize(totalSize),
        storageDir: this.config.storageDir,
        oldestBlueprint,
        newestBlueprint,
      }
    } catch (_error: any) {
      return {
        blueprintCount: this.blueprintsCache.size,
        storageSize: '0 B',
        storageDir: this.config.storageDir,
      }
    }
  }

  /**
   * Crea backup di un blueprint
   */
  private async createBackup(blueprintId: string): Promise<void> {
    try {
      const backupDir = path.join(this.config.storageDir, 'backups')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFile = `${blueprintId}_${timestamp}.json`
      const backupPath = path.join(backupDir, backupFile)

      const sourcePath = path.join(this.config.storageDir, `${blueprintId}.json`)
      const content = await fs.readFile(sourcePath, 'utf-8')
      await fs.writeFile(backupPath, content)
    } catch (error: any) {
      // Backup fallimento non è critico, log solamente
      advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠️ Backup failed for ${blueprintId}: ${error.message}`))
    }
  }

  /**
   * Genera ID univoco per blueprint
   */
  private generateBlueprintId(): string {
    return `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Pulizia e manutenzione storage
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) return

    try {
      // Rimuovi blueprints in eccesso se superiori al limite
      const blueprints = Array.from(this.blueprintsCache.values())
      if (blueprints.length > this.config.maxBlueprints) {
        // Ordina per data di creazione e rimuovi i più vecchi
        const sorted = blueprints.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

        const toRemove = sorted.slice(0, blueprints.length - this.config.maxBlueprints)
        for (const blueprint of toRemove) {
          await this.deleteBlueprint(blueprint.id)
          advancedUI.logFunctionUpdate('info', chalk.yellow(`🧹 Removed old blueprint: ${blueprint.name}`))
        }
      }

      // Pulizia backups vecchi (mantieni solo gli ultimi 10 per blueprint)
      await this.cleanupOldBackups()

      advancedUI.logFunctionUpdate('info', chalk.gray(`🧹 Storage cleanup completed`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Storage cleanup failed: ${error.message}`))
    }
  }

  /**
   * Pulizia backups vecchi
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupDir = path.join(this.config.storageDir, 'backups')
      const files = await fs.readdir(backupDir)

      // Raggruppa per blueprint ID
      const backupGroups = new Map<string, string[]>()
      files.forEach((file) => {
        const blueprintId = file.split('_')[0]
        if (!backupGroups.has(blueprintId)) {
          backupGroups.set(blueprintId, [])
        }
        backupGroups.get(blueprintId)?.push(file)
      })

      // Per ogni gruppo, mantieni solo i 10 più recenti
      for (const [_blueprintId, backupFiles] of backupGroups) {
        if (backupFiles.length > 10) {
          const sorted = backupFiles.sort().reverse() // Più recenti primi
          const toDelete = sorted.slice(10)

          for (const file of toDelete) {
            await fs.unlink(path.join(backupDir, file))
          }
        }
      }
    } catch (error: any) {
      // Cleanup backups non è critico
      advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠️ Backup cleanup failed: ${error.message}`))
    }
  }

  // ==================== OUTPUT STYLES METHODS ====================

  /**
   * Load all custom output styles from storage
   */
  private async loadAllStyles(): Promise<void> {
    try {
      const stylesDir = this.getStylesDir()
      const files = await fs.readdir(stylesDir)

      for (const file of files) {
        if (file.endsWith('.json')) {
          const styleId = file.replace('.json', '')
          const style = await this.loadStyle(styleId)
          if (style) {
            this.stylesCache.set(styleId, style)
          }
        }
      }
    } catch (error: any) {
      // Non è critico se non ci sono styles
      if (error.code !== 'ENOENT') {
        console.warn(chalk.yellow(`⚠️ Failed to load styles: ${error.message}`))
      }
    }
  }

  /**
   * Save custom output style to filesystem
   */
  async saveStyle(style: CustomOutputStyle): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const stylesDir = this.getStylesDir()
      const filename = `${style.id}.json`
      const filepath = path.join(stylesDir, filename)

      // Add metadata
      const styleWithMetadata = {
        ...style,
        updatedAt: new Date(),
        version: '1.0',
      }

      await fs.writeFile(filepath, JSON.stringify(styleWithMetadata, null, 2))

      // Update cache
      this.stylesCache.set(style.id, style)

      // Auto-backup if enabled
      if (this.config.autoBackup) {
        await this.createStyleBackup(style.id)
      }

      advancedUI.logFunctionUpdate('info', chalk.gray(`💅 Style saved: ${style.name} (${style.id})`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to save style: ${error.message}`))
      throw error
    }
  }

  /**
   * Load specific custom output style
   */
  async loadStyle(styleId: string): Promise<CustomOutputStyle | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Check cache first
      if (this.stylesCache.has(styleId)) {
        return this.stylesCache.get(styleId)!
      }

      const stylesDir = this.getStylesDir()
      const filename = `${styleId}.json`
      const filepath = path.join(stylesDir, filename)

      const content = await fs.readFile(filepath, 'utf-8')
      const style = JSON.parse(content) as CustomOutputStyle

      // Update cache
      this.stylesCache.set(styleId, style)

      return style
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null
      }
      console.error(chalk.red(`❌ Failed to load style ${styleId}: ${error.message}`))
      return null
    }
  }

  /**
   * List all custom output styles
   */
  async listStyles(): Promise<CustomOutputStyle[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const stylesDir = this.getStylesDir()
      const files = await fs.readdir(stylesDir)
      const styles: CustomOutputStyle[] = []

      for (const file of files) {
        if (file.endsWith('.json')) {
          const styleId = file.replace('.json', '')
          const style = await this.loadStyle(styleId)
          if (style) {
            styles.push(style)
          }
        }
      }

      return styles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to list styles: ${error.message}`))
      return []
    }
  }

  /**
   * Delete custom output style
   */
  async deleteStyle(styleId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const stylesDir = this.getStylesDir()
      const filename = `${styleId}.json`
      const filepath = path.join(stylesDir, filename)

      await fs.unlink(filepath)

      // Remove from cache
      this.stylesCache.delete(styleId)

      advancedUI.logFunctionUpdate('info', chalk.gray(`🗑️ Style deleted: ${styleId}`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to delete style: ${error.message}`))
      throw error
    }
  }

  /**
   * Export custom output style to file
   */
  async exportStyle(styleId: string, destPath: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const style = await this.loadStyle(styleId)
      if (!style) {
        throw new Error(`Style ${styleId} not found`)
      }

      await fs.writeFile(destPath, JSON.stringify(style, null, 2))

      advancedUI.logFunctionUpdate('info', chalk.gray(`📤 Style exported: ${destPath}`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to export style: ${error.message}`))
      throw error
    }
  }

  /**
   * Import custom output style from file
   */
  async importStyle(sourcePath: string): Promise<CustomOutputStyle> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const content = await fs.readFile(sourcePath, 'utf-8')
      const style = JSON.parse(content) as CustomOutputStyle

      // Generate new ID if already exists
      let styleId = style.id
      let counter = 1
      while (this.stylesCache.has(styleId)) {
        styleId = `${style.id}-${counter}`
        counter++
      }

      const importedStyle: CustomOutputStyle = {
        ...style,
        id: styleId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await this.saveStyle(importedStyle)

      advancedUI.logFunctionUpdate('info', chalk.gray(`📥 Style imported: ${importedStyle.name} (${styleId})`))

      return importedStyle
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to import style: ${error.message}`))
      throw error
    }
  }

  /**
   * Create backup for custom output style
   */
  private async createStyleBackup(styleId: string): Promise<void> {
    try {
      const stylesDir = this.getStylesDir()
      const backupDir = this.getStylesBackupDir()

      const sourceFile = path.join(stylesDir, `${styleId}.json`)
      const backupFile = path.join(backupDir, `${styleId}-backup-${Date.now()}.json`)

      await fs.copyFile(sourceFile, backupFile)
    } catch (error: any) {
      // Backup non è critico
      advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠️ Style backup failed: ${error.message}`))
    }
  }

  /**
   * Get custom styles cache
   */
  getStylesCache(): Map<string, CustomOutputStyle> {
    return new Map(this.stylesCache)
  }
}

// Istanza singleton del servizio di storage
export const blueprintStorage = new BlueprintStorage()
