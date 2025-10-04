import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { NikCLIConfig, MCPServerConfig } from '../types/config.types';

export class ConfigProvider extends EventEmitter {
  private configPath: string;
  private config: NikCLIConfig | null = null;

  constructor() {
    super();
    this.configPath = path.join(os.homedir(), '.nikcli', 'config.json');
  }

  async readConfig(): Promise<NikCLIConfig> {
    try {
      const raw = await fs.promises.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(raw);
      return this.config!;
    } catch (error) {
      throw new Error(`Failed to read config: ${(error as Error).message}`);
    }
  }

  async writeConfig(config: Partial<NikCLIConfig>): Promise<void> {
    try {
      const current = await this.readConfig();
      const merged = { ...current, ...config };

      await fs.promises.writeFile(
        this.configPath,
        JSON.stringify(merged, null, 2),
        'utf8'
      );

      this.config = merged;
      this.emit('configChanged', merged);
    } catch (error) {
      throw new Error(`Failed to write config: ${(error as Error).message}`);
    }
  }

  async updateSection<K extends keyof NikCLIConfig>(
    section: K,
    value: NikCLIConfig[K]
  ): Promise<void> {
    await this.writeConfig({ [section]: value } as Partial<NikCLIConfig>);
  }

  async addModel(name: string, modelConfig: NikCLIConfig['models'][string]): Promise<void> {
    const config = await this.readConfig();
    const models = { ...config.models, [name]: modelConfig };
    await this.updateSection('models', models);
  }

  async removeModel(name: string): Promise<void> {
    const config = await this.readConfig();
    const models = { ...config.models };
    delete models[name];
    await this.updateSection('models', models);
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    const config = await this.readConfig();
    const apiKeys = { ...config.apiKeys, [provider]: key };
    await this.updateSection('apiKeys', apiKeys);
  }

  async addTrustedDomain(domain: string): Promise<void> {
    const config = await this.readConfig();
    const trustedDomains = [...config.sandbox.trustedDomains, domain];
    await this.updateSection('sandbox', { ...config.sandbox, trustedDomains });
  }

  async removeTrustedDomain(domain: string): Promise<void> {
    const config = await this.readConfig();
    const trustedDomains = config.sandbox.trustedDomains.filter(d => d !== domain);
    await this.updateSection('sandbox', { ...config.sandbox, trustedDomains });
  }

  async addMCPServer(name: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.readConfig();
    const mcp = { ...(config.mcp || {}), [name]: serverConfig };
    await this.updateSection('mcp', mcp);
  }

  async removeMCPServer(name: string): Promise<void> {
    const config = await this.readConfig();
    const mcp = { ...config.mcp };
    delete mcp![name];
    await this.updateSection('mcp', mcp);
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getCachedConfig(): NikCLIConfig | null {
    return this.config;
  }
}
