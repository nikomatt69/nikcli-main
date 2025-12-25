import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import type { AgentBlueprint } from './agent-factory'

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

  constructor(config?: Partial<BlueprintStorageConfig>) {
    this.config = {
      storageDir: path.join(os.homedir(), '.nikcli'),
      maxBlueprints: 100,
      autoBackup: true,
      ...config,
    }
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

      // Carica tutti i blueprints esistenti
      await this.loadAllBlueprints()

      this.initialized = true
      advancedUI.logCognitive(chalk.gray(`📁 Blueprint storage initialized: ${this.config.storageDir}`))
    } catch (error: any) {
      advancedUI.logError(chalk.red(`✖ Failed to initialize blueprint storage: ${error.message}`))
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

      advancedUI.logCognitive(chalk.gray(`💾 Blueprint saved: ${blueprint.name} (${blueprint.id})`))
    } catch (error: any) {
      console.error(chalk.red(`✖ Failed to save blueprint: ${error.message}`))
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
      const raw = JSON.parse(content) as any

      // Coerce fields for robustness (id/name/createdAt)
      const coerced: AgentBlueprint = {
        ...raw,
        id: raw && typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : filename.replace('.json', ''),
        name:
          raw?.name ||
          (typeof raw?.specialization === 'string'
            ? raw.specialization.toLowerCase().replace(/\s+/g, '-')
            : filename.replace('.json', '')),
        createdAt: raw?.createdAt ? new Date(raw.createdAt) : new Date(),
      }

      // Aggiorna cache
      this.blueprintsCache.set(coerced.id, coerced)

      return coerced
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null // File non trovato
      }
      console.error(chalk.red(`✖ Failed to load blueprint ${blueprintId}: ${error.message}`))
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
          const raw = JSON.parse(content) as any

          // Coerce fields for robustness (id/name/createdAt)
          const coerced: AgentBlueprint = {
            ...raw,
            id: raw && typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : file.replace('.json', ''),
            name:
              raw?.name ||
              (typeof raw?.specialization === 'string'
                ? raw.specialization.toLowerCase().replace(/\s+/g, '-')
                : file.replace('.json', '')),
            createdAt: raw?.createdAt ? new Date(raw.createdAt) : new Date(),
          }

          this.blueprintsCache.set(coerced.id, coerced)
        } catch (error: any) {
          console.error(chalk.yellow(`⚠︎ Skipping invalid blueprint file ${file}: ${error.message}`))
        }
      }

      advancedUI.logCognitive(chalk.gray(`📋 Loaded ${this.blueprintsCache.size} blueprints from storage`))
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(chalk.red(`✖ Failed to load blueprints: ${error.message}`))
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

      console.log(chalk.gray(`🗑️ Blueprint deleted: ${blueprintId}`))
      return true
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false // File già non esistente
      }
      console.error(chalk.red(`✖ Failed to delete blueprint: ${error.message}`))
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
      console.log(chalk.green(`📤 Blueprint exported: ${exportPath}`))
      return true
    } catch (error: any) {
      console.error(chalk.red(`✖ Failed to export blueprint: ${error.message}`))
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
      console.log(chalk.green(`📥 Blueprint imported: ${blueprint.name}`))
      return blueprint
    } catch (error: any) {
      console.error(chalk.red(`✖ Failed to import blueprint: ${error.message}`))
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
      console.log(chalk.yellow(`⚠︎ Backup failed for ${blueprintId}: ${error.message}`))
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
          console.log(chalk.yellow(`🧹 Removed old blueprint: ${blueprint.name}`))
        }
      }

      // Pulizia backups vecchi (mantieni solo gli ultimi 10 per blueprint)
      await this.cleanupOldBackups()

      console.log(chalk.gray(`🧹 Storage cleanup completed`))
    } catch (error: any) {
      console.error(chalk.red(`✖ Storage cleanup failed: ${error.message}`))
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
      console.log(chalk.yellow(`⚠︎ Backup cleanup failed: ${error.message}`))
    }
  }
}

// Istanza singleton del servizio di storage
export const blueprintStorage = new BlueprintStorage()
