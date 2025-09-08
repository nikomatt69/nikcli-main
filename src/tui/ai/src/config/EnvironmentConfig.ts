import type { AIServiceConfig } from '../streaming/AIService';

export type EnvironmentVariables = {
  // OpenAI
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  
  // Anthropic
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  
  // Ollama
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  
  // General AI settings
  TUI_AI_TIMEOUT_MS?: string;
  TUI_AI_MAX_RETRIES?: string;
  TUI_AI_DEBUG?: string;
  TUI_AI_DEFAULT_PROVIDER?: string;
};

export type ProviderConfigValidation = {
  isValid: boolean;
  provider: string;
  errors: string[];
  warnings: string[];
};

export class EnvironmentConfig {
  private env: EnvironmentVariables;

  constructor(customEnv?: Partial<EnvironmentVariables>) {
    this.env = {
      ...process.env,
      ...customEnv
    } as EnvironmentVariables;
  }

  // Provider configuration builders
  getOpenAIConfig(): AIServiceConfig | null {
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    return {
      provider: 'openai',
      model: this.env.OPENAI_MODEL || 'gpt-4',
      apiKey,
      baseUrl: this.env.OPENAI_BASE_URL || 'https://api.openai.com',
      maxTokens: 4000,
      temperature: 0.7
    };
  }

  getAnthropicConfig(): AIServiceConfig | null {
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    return {
      provider: 'anthropic',
      model: this.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
      apiKey,
      baseUrl: this.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      maxTokens: 4000,
      temperature: 0.7
    };
  }

  getOllamaConfig(): AIServiceConfig {
    return {
      provider: 'ollama',
      model: this.env.OLLAMA_MODEL || 'llama3',
      baseUrl: this.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      maxTokens: 4000,
      temperature: 0.7
    };
  }

  // Get all available provider configurations
  getAllAvailableConfigs(): AIServiceConfig[] {
    const configs: AIServiceConfig[] = [];
    
    const openaiConfig = this.getOpenAIConfig();
    if (openaiConfig) configs.push(openaiConfig);
    
    const anthropicConfig = this.getAnthropicConfig();
    if (anthropicConfig) configs.push(anthropicConfig);
    
    // Ollama is always included as it might be available locally
    configs.push(this.getOllamaConfig());
    
    return configs;
  }

  // Get default provider configuration
  getDefaultConfig(): AIServiceConfig | null {
    const defaultProvider = this.env.TUI_AI_DEFAULT_PROVIDER;
    
    if (defaultProvider) {
      switch (defaultProvider.toLowerCase()) {
        case 'openai':
          return this.getOpenAIConfig();
        case 'anthropic':
          return this.getAnthropicConfig();
        case 'ollama':
          return this.getOllamaConfig();
      }
    }

    // Fallback order: OpenAI -> Anthropic -> Ollama
    return this.getOpenAIConfig() || this.getAnthropicConfig() || this.getOllamaConfig();
  }

  // Configuration validation
  validateProviderConfig(provider: 'openai' | 'anthropic' | 'ollama'): ProviderConfigValidation {
    const result: ProviderConfigValidation = {
      isValid: true,
      provider,
      errors: [],
      warnings: []
    };

    switch (provider) {
      case 'openai':
        if (!this.env.OPENAI_API_KEY) {
          result.errors.push('OPENAI_API_KEY environment variable is required');
          result.isValid = false;
        }
        if (this.env.OPENAI_API_KEY && !this.env.OPENAI_API_KEY.startsWith('sk-')) {
          result.warnings.push('OPENAI_API_KEY should start with "sk-"');
        }
        break;

      case 'anthropic':
        if (!this.env.ANTHROPIC_API_KEY) {
          result.errors.push('ANTHROPIC_API_KEY environment variable is required');
          result.isValid = false;
        }
        if (this.env.ANTHROPIC_API_KEY && !this.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
          result.warnings.push('ANTHROPIC_API_KEY should start with "sk-ant-"');
        }
        break;

      case 'ollama':
        const baseUrl = this.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        if (!this.isValidUrl(baseUrl)) {
          result.errors.push('OLLAMA_BASE_URL must be a valid URL');
          result.isValid = false;
        }
        if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
          result.warnings.push('Using HTTP with non-local Ollama instance may be insecure');
        }
        break;
    }

    return result;
  }

  // Validate all configured providers
  validateAllConfigs(): ProviderConfigValidation[] {
    return [
      this.validateProviderConfig('openai'),
      this.validateProviderConfig('anthropic'),
      this.validateProviderConfig('ollama')
    ];
  }

  // Environment diagnostics
  getDiagnostics(): {
    configuredProviders: string[];
    missingEnvVars: string[];
    recommendedEnvVars: string[];
    debugMode: boolean;
    timeout: number;
    maxRetries: number;
  } {
    const configuredProviders: string[] = [];
    const missingEnvVars: string[] = [];
    const recommendedEnvVars: string[] = [];

    // Check OpenAI
    if (this.env.OPENAI_API_KEY) {
      configuredProviders.push('openai');
    } else {
      missingEnvVars.push('OPENAI_API_KEY');
    }

    // Check Anthropic
    if (this.env.ANTHROPIC_API_KEY) {
      configuredProviders.push('anthropic');
    } else {
      missingEnvVars.push('ANTHROPIC_API_KEY');
    }

    // Ollama is always potentially available
    configuredProviders.push('ollama');

    // Check recommended environment variables
    if (!this.env.TUI_AI_TIMEOUT_MS) {
      recommendedEnvVars.push('TUI_AI_TIMEOUT_MS (default: 30000)');
    }
    if (!this.env.TUI_AI_MAX_RETRIES) {
      recommendedEnvVars.push('TUI_AI_MAX_RETRIES (default: 2)');
    }
    if (!this.env.TUI_AI_DEFAULT_PROVIDER) {
      recommendedEnvVars.push('TUI_AI_DEFAULT_PROVIDER (openai|anthropic|ollama)');
    }

    return {
      configuredProviders,
      missingEnvVars,
      recommendedEnvVars,
      debugMode: this.env.TUI_AI_DEBUG === '1',
      timeout: parseInt(this.env.TUI_AI_TIMEOUT_MS || '30000'),
      maxRetries: parseInt(this.env.TUI_AI_MAX_RETRIES || '2')
    };
  }

  // Helper methods
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Environment variable checking utility
  static checkRequiredEnvVars(requiredVars: string[]): { missing: string[]; present: string[] } {
    const missing: string[] = [];
    const present: string[] = [];

    for (const varName of requiredVars) {
      if (process.env[varName]) {
        present.push(varName);
      } else {
        missing.push(varName);
      }
    }

    return { missing, present };
  }

  // Create .env template
  static generateEnvTemplate(): string {
    return `# AI Provider Configuration for TUI-Kit-AI

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4
OPENAI_BASE_URL=https://api.openai.com

# Anthropic Configuration  
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_BASE_URL=https://api.anthropic.com

# Ollama Configuration (for local AI models)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# General Settings
TUI_AI_TIMEOUT_MS=30000
TUI_AI_MAX_RETRIES=2
TUI_AI_DEBUG=0
TUI_AI_DEFAULT_PROVIDER=openai

# Usage:
# 1. Copy this template to .env in your project root
# 2. Fill in your API keys and adjust settings as needed
# 3. Restart your application to apply changes
`;
  }
}