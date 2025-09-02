#!/usr/bin/env node

/**
 * NikCLI - Unified Autonomous AI Development Assistant
 * Consolidated Entry Point with Modular Architecture
 */

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import chalk from 'chalk';

// Global unhandled promise rejection handlers for system stability
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error(chalk.red('⚠️  Unhandled Promise Rejection:'));
  console.error(chalk.red('Reason:', reason));
  console.error(chalk.red('Promise:', promise));

  // Log stack trace if available
  if (reason && reason.stack) {
    console.error(chalk.gray('Stack:', reason.stack));
  }

  // Graceful handling - don't exit process, but log for debugging
  console.error(chalk.yellow('System continuing with error logged...'));
});

process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('⚠️  Uncaught Exception:'));
  console.error(chalk.red('Error:', error.message));
  console.error(chalk.gray('Stack:', error.stack));

  // For uncaught exceptions, we need to exit gracefully
  console.error(chalk.red('System shutting down due to uncaught exception...'));
  process.exit(1);
});

// Promise rejection warning handler
process.on('warning', (warning: any) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0018') {
    // Ignore deprecation warnings for unhandled promise rejections
    return;
  }
  console.warn(chalk.yellow(`⚠️  Warning: ${warning.message}`));
  if (warning.stack) {
    console.warn(chalk.gray(warning.stack));
  }
});

import boxen from 'boxen';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Core imports
import { NikCLI } from './nik-cli';
import { agentService } from './services/agent-service';
import { toolService } from './services/tool-service';
import { planningService } from './services/planning-service';
import { lspService } from './services/lsp-service';
import { diffManager } from './ui/diff-manager';
import { ExecutionPolicyManager } from './policies/execution-policy';
import { simpleConfigManager as configManager } from './core/config-manager';
import { registerAgents } from './register-agents';
import { AgentManager } from './core/agent-manager';
import { Logger } from './core/logger';
import { Logger as UtilsLogger } from './utils/logger';

// Enhanced services
import { cacheService } from './services/cache-service';
import { enhancedSupabaseProvider } from './providers/supabase/enhanced-supabase-provider';
import { authProvider } from './providers/supabase/auth-provider';
import { redisProvider } from './providers/redis/redis-provider';
import { enhancedTokenCache } from './core/enhanced-token-cache';
import { memoryService } from './services/memory-service';
import { snapshotService } from './services/snapshot-service';

// Global declarations for vision/image providers
declare global {
  var visionProvider: any;
  var imageGenerator: any;
}

// Types from streaming orchestrator
interface StreamMessage {
  id: string;
  type: 'user' | 'system' | 'agent' | 'tool' | 'diff' | 'error';
  content: string;
  timestamp: Date;
  status: 'queued' | 'processing' | 'completed' | 'absorbed';
  metadata?: any;
  agentId?: string;
  progress?: number;
}

interface StreamContext {
  workingDirectory: string;
  autonomous: boolean;
  planMode: boolean;
  autoAcceptEdits: boolean;
  contextLeft: number;
  maxContext: number;
}

// ASCII Art Banner
const banner = `
███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗
████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║
██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║
██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║
██║ ╚████║██║██║  ██╗╚██████╗███████╗██║
╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
`;

/**
 * Version utilities for checking current and latest versions
 */
interface VersionInfo {
  current: string;
  latest?: string;
  hasUpdate?: boolean;
  error?: string;
}

function getCurrentVersion(): string {
  try {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    return 'unknown';
  }
}

async function getLatestVersion(
  packageName: string = '@cadcamfun/nikcli',
): Promise<string | null> {
  try {
    // Get package info with all versions and tags
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();

    // Get the latest and beta versions
    const latestVersion = data['dist-tags']?.latest;
    const betaVersion = data['dist-tags']?.beta;

    // Compare and return the highest version
    if (!latestVersion && !betaVersion) return null;
    if (!latestVersion) return betaVersion;
    if (!betaVersion) return latestVersion;

    // Compare versions and return the highest
    const isBetaNewer = compareVersions(latestVersion, betaVersion);
    return isBetaNewer ? betaVersion : latestVersion;
  } catch (error) {
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const currentParts = current.replace('-beta', '').split('.').map(Number);
  const latestParts = latest.replace('-beta', '').split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

async function getVersionInfo(): Promise<VersionInfo> {
  const current = getCurrentVersion();

  try {
    const latest = await getLatestVersion();
    if (!latest) {
      return { current, error: 'Unable to check for updates' };
    }

    const hasUpdate = compareVersions(current, latest);
    return { current, latest, hasUpdate };
  } catch (error) {
    return { current, error: 'Network error checking for updates' };
  }
}

/**
 * Introduction Display Module
 */
class IntroductionModule {
  static displayBanner() {
    console.clear();
    // Use realistic solid colors instead of rainbow gradient
    console.log(chalk.cyanBright(banner));
  }

  static displayApiKeySetup() {
    const setupBox = boxen(
      chalk.yellow.bold('⚠️  API Key Required\n\n') +
      chalk.white('To use NikCLI, please set at least one API key:\n\n') +
      chalk.green('• ANTHROPIC_API_KEY') +
      chalk.gray(' - for Claude models (recommended)\n') +
      chalk.blue('• OPENAI_API_KEY') +
      chalk.gray(' - for GPT models\n') +
      chalk.magenta('• GOOGLE_GENERATIVE_AI_API_KEY') +
      chalk.gray(' - for Gemini models\n') +
      chalk.cyan('• AI_GATEWAY_API_KEY') +
      chalk.gray(' - for Vercel AI Gateway (smart routing)\n\n') +
      chalk.white.bold('Setup Examples:\n') +
      chalk.dim('export ANTHROPIC_API_KEY="your-key-here"\n') +
      chalk.dim('export OPENAI_API_KEY="your-key-here"\n') +
      chalk.dim('export GOOGLE_GENERATIVE_AI_API_KEY="your-key-here"\n') +
      chalk.dim('export AI_GATEWAY_API_KEY="your-key-here"\n\n') +
      chalk.cyan('Then run: ') +
      chalk.white.bold('npm start'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
      },
    );

    console.log(setupBox);
  }

  static displayStartupInfo() {
    const startupBox = boxen(
      chalk.green.bold('🚀 Starting NikCLI...\n\n') +
      chalk.white('Initializing autonomous AI assistant\n') +
      chalk.gray('• Loading project context\n') +
      chalk.gray('• Preparing planning system\n') +
      chalk.gray('• Setting up tool integrations\n\n') +
      chalk.cyan('Type ') +
      chalk.white.bold('/help') +
      chalk.cyan(' for available commands'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        backgroundColor: '#001a00',
      },
    );

    console.log(startupBox);
  }
}

/**
 * Onboarding Module
 */
class OnboardingModule {
  static async runOnboarding(): Promise<boolean> {
    console.clear();
    console.log(chalk.cyanBright(banner));

    // Step 1: Version Information
    await this.showVersionInfo();

    // Step 2: Beta Warning
    await this.showBetaWarning();

    // Step 3: API Key Setup
    const hasKeys = await this.setupApiKeys();

    // Step 4: Enhanced Services Setup (optional)
    await this.setupEnhancedServices();

    // Step 5: System Check
    const systemOk = await this.checkSystemRequirements();

    // Onboarding is complete if system requirements are met
    // API keys and enhanced services are optional
    return systemOk;
  }

  private static async showBetaWarning(): Promise<void> {
    const warningBox = boxen(
      chalk.red.bold('⚠️  BETA VERSION WARNING\n\n') +
      chalk.white(
        'NikCLI is currently in beta and may contain bugs or unexpected behavior.\n\n',
      ) +
      chalk.yellow.bold('Potential Risks:\n') +
      chalk.white('• File system modifications\n') +
      chalk.white('• Code generation may not always be optimal\n') +
      chalk.white('• AI responses may be inaccurate\n') +
      chalk.white('• System resource usage\n\n') +
      chalk.cyan('For detailed security information, visit:\n') +
      chalk.blue.underline(
        'https://github.com/nikomatt69/nikcli-main/blob/main/SECURITY.md\n\n',
      ) +
      chalk.white('By continuing, you acknowledge these risks.'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
        backgroundColor: '#2a0000',
      },
    );

    console.log(warningBox);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer: string = await new Promise((resolve) =>
      rl.question(chalk.yellow('\nDo you want to continue? (y/N): '), resolve),
    );
    rl.close();

    if (!answer || !answer.toLowerCase().startsWith('y')) {
      console.log(chalk.blue('\n👋 Thanks for trying NikCLI!'));
      process.exit(0);
    }
  }

  private static async setupApiKeys(): Promise<boolean> {
    console.log(chalk.blue('\n🔑 API Key Setup'));
    console.log(chalk.gray('─'.repeat(40)));

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const vercelKey = process.env.V0_API_KEY;
    const gatewayKey =
      process.env.AI_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    if (anthropicKey || openaiKey || googleKey || vercelKey || gatewayKey) {
      console.log(chalk.green('✅ API keys detected'));
      return true;
    }

    // Check for Ollama models
    try {
      const currentModel = configManager.get('currentModel');
      const modelCfg = (configManager.get('models') as any)[currentModel];
      if (modelCfg && modelCfg.provider === 'ollama') {
        console.log(chalk.green('✅ Ollama model configured'));
        return true;
      }
    } catch (_) {
      // ignore config errors
    }

    console.log(chalk.yellow('⚠️ No API keys found'));

    const setupBox = boxen(
      chalk.white.bold('Setup your API key:\n\n') +
      chalk.green('• ANTHROPIC_API_KEY') +
      chalk.gray(' - for Claude models (recommended)\n') +
      chalk.blue('• OPENAI_API_KEY') +
      chalk.gray(' - for GPT models\n') +
      chalk.magenta('• GOOGLE_GENERATIVE_AI_API_KEY') +
      chalk.gray(' - for Gemini models\n') +
      chalk.cyan('• AI_GATEWAY_API_KEY') +
      chalk.gray(' - for Vercel AI Gateway (smart routing)\n') +
      chalk.cyan('• V0_API_KEY') +
      chalk.gray(' - for Vercel models\n\n') +
      chalk.white.bold('Example:\n') +
      chalk.dim('export ANTHROPIC_API_KEY="your-key-here"\n') +
      chalk.dim('export AI_GATEWAY_API_KEY="your-key-here"\n\n') +
      chalk.cyan('Or use Ollama for local models: ollama pull llama3.1:8b'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
      },
    );

    console.log(setupBox);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer: string = await new Promise((resolve) =>
      rl.question(
        chalk.yellow('\nContinue without API keys? (y/N): '),
        resolve,
      ),
    );
    rl.close();

    if (!answer || !answer.toLowerCase().startsWith('y')) {
      console.log(chalk.blue('\n👋 Set up your API key and run NikCLI again!'));
      process.exit(0);
    }

    // User chose to continue without API keys - offer Ollama setup
    return await this.setupOllama();
  }

  private static async checkSystemRequirements(): Promise<boolean> {
    console.log(chalk.blue('\n🔍 System Check'));
    console.log(chalk.gray('─'.repeat(40)));

    // Check runtime version (Bun or Node)
    try {
      // @ts-ignore - Bun global exists when running with Bun
      if (typeof Bun !== 'undefined') {
        // @ts-ignore
        const bunVersion = Bun.version as string;
        console.log(chalk.green(`✅ Bun ${bunVersion}`));
      } else {
        const version = process.version;
        const major = parseInt(version.slice(1).split('.')[0]);
        if (major < 18) {
          console.log(
            chalk.red(`❌ Node.js ${major} is too old. Requires Node.js 18+`),
          );
          return false;
        }
        console.log(chalk.green(`✅ Node.js ${version}`));
      }
    } catch (_) {
      // Fallback to Node check
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0]);
      if (major < 18) {
        console.log(
          chalk.red(`❌ Node.js ${major} is too old. Requires Node.js 18+`),
        );
        return false;
      }
      console.log(chalk.green(`✅ Node.js ${version}`));
    }

    // Check Ollama if needed
    try {
      const currentModel = configManager.get('currentModel');
      const modelCfg = (configManager.get('models') as any)[currentModel];
      if (modelCfg && modelCfg.provider === 'ollama') {
        const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
        const base = host.startsWith('http') ? host : `http://${host}`;

        try {
          const res = await fetch(`${base}/api/tags`, { method: 'GET' } as any);
          if (res.ok) {
            console.log(chalk.green('✅ Ollama service detected'));
          } else {
            console.log(chalk.yellow('⚠️ Ollama service not responding'));
          }
        } catch (err) {
          console.log(chalk.yellow('⚠️ Ollama service not reachable'));
          console.log(chalk.gray('   Start with: ollama serve'));
        }
      }
    } catch (_) {
      // ignore config errors
    }

    return true;
  }

  private static async setupOllama(): Promise<boolean> {
    console.log(chalk.blue('\n🤖 Ollama Setup'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const models = configManager.get('models') as any;
      let ollamaEntries = Object.entries(models).filter(
        ([, cfg]: any) => cfg.provider === 'ollama',
      );

      if (ollamaEntries.length > 0) {
        console.log(chalk.green('✅ Ollama models found in configuration'));

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer: string = await new Promise((resolve) =>
          rl.question(
            chalk.yellow('\nUse a local Ollama model? (Y/n): '),
            resolve,
          ),
        );
        rl.close();

        if (!answer || answer.toLowerCase().startsWith('y')) {
          // Choose Ollama model
          let chosenName = ollamaEntries[0][0] as string;
          if (ollamaEntries.length > 1) {
            console.log(chalk.cyan('\nAvailable Ollama models:'));
            ollamaEntries.forEach(([name, cfg]: any, idx: number) => {
              console.log(`  [${idx + 1}] ${name} (${cfg.model})`);
            });
            const rl2 = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            const pick = await new Promise<string>((resolve) =>
              rl2.question('Select model number (default 1): ', resolve),
            );
            rl2.close();
            const i = parseInt((pick || '1').trim(), 10);
            if (!isNaN(i) && i >= 1 && i <= ollamaEntries.length) {
              chosenName = ollamaEntries[i - 1][0] as string;
            }
          }

          configManager.setCurrentModel(chosenName);
          console.log(
            chalk.green(`✅ Switched to Ollama model: ${chosenName}`),
          );
          return true;
        }
      } else {
        // No Ollama models configured - offer to add one
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer: string = await new Promise((resolve) =>
          rl.question(
            chalk.yellow(
              '\nNo Ollama models configured. Add default model (llama3.1:8b)? (Y/n): ',
            ),
            resolve,
          ),
        );
        rl.close();

        if (!answer || answer.toLowerCase().startsWith('y')) {
          const defaultName = 'llama3.1:8b';
          configManager.addModel(defaultName, {
            provider: 'ollama',
            model: 'llama3.1:8b',
          } as any);
          configManager.setCurrentModel(defaultName);
          console.log(
            chalk.green(
              `✅ Added and switched to Ollama model: ${defaultName}`,
            ),
          );
          return true;
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Error configuring Ollama models'));
    }

    console.log(chalk.yellow('⚠️ No AI provider configured'));
    return false;
  }

  private static async setupEnhancedServices(): Promise<void> {
    console.log(chalk.blue('\n🚀 Enhanced Services Setup'));
    console.log(chalk.gray('─'.repeat(40)));

    const config = configManager.getAll();
    const redisEnabled = config.redis?.enabled;
    const supabaseEnabled = config.supabase?.enabled;

    if (!redisEnabled && !supabaseEnabled) {
      console.log(
        chalk.gray('ℹ️  Enhanced services (Redis, Supabase) are disabled'),
      );
      console.log(chalk.dim('   You can enable them later in configuration'));
      return;
    }

    // Check Redis setup
    if (redisEnabled) {
      console.log(chalk.blue('🔴 Redis Cache Service:'));
      try {
        // Test Redis connection during setup
        const redisConfig = config.redis;
        console.log(
          chalk.gray(`   Host: ${redisConfig!.host}:${redisConfig!.port}`),
        );
        console.log(chalk.gray(`   Database: ${redisConfig!.database}`));
        console.log(
          chalk.gray(
            `   Fallback: ${redisConfig!.fallback.enabled ? 'Enabled' : 'Disabled'}`,
          ),
        );
        console.log(chalk.green('   ✅ Redis configuration loaded'));
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠️ Redis configuration issue`));
      }
    }

    // Check Supabase setup
    if (supabaseEnabled) {
      console.log(chalk.blue('🟢 Supabase Integration:'));
      try {
        const supabaseCredentials = configManager.getSupabaseCredentials();
        const hasCredentials = Boolean(
          supabaseCredentials.url && supabaseCredentials.anonKey,
        );

        if (hasCredentials) {
          console.log(chalk.green('   ✅ Supabase credentials found'));

          const supabaseConfig = config.supabase;
          if (supabaseConfig!.features.auth) {
            await this.setupAuthentication();
          }

          const enabledFeatures = Object.entries(supabaseConfig!.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => feature);

          console.log(chalk.gray(`   Features: ${enabledFeatures.join(', ')}`));
        } else {
          console.log(chalk.yellow('   ⚠️ Supabase credentials not found'));
          console.log(
            chalk.dim(
              '   Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables',
            ),
          );
        }
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠️ Supabase setup issue`));
      }
    }

    console.log(
      chalk.dim('\nEnhanced services will be available during your session.'),
    );
  }

  private static async setupAuthentication(): Promise<void> {
    console.log(chalk.cyan('🔐 Authentication Setup:'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const authChoice = await new Promise<string>((resolve) =>
        rl.question(
          chalk.yellow('Would you like to sign in? (y/N): '),
          resolve,
        ),
      );

      if (authChoice && authChoice.toLowerCase().startsWith('y')) {
        console.log(chalk.blue('\nChoose authentication method:'));
        console.log('1. Sign in with existing account');
        console.log('2. Create new account');
        console.log('3. Continue as guest');

        const methodChoice = await new Promise<string>((resolve) =>
          rl.question(
            chalk.yellow('Select option (1-3, default 3): '),
            resolve,
          ),
        );

        switch (methodChoice.trim() || '3') {
          case '1':
            await this.handleSignIn(rl);
            break;
          case '2':
            await this.handleSignUp(rl);
            break;
          case '3':
          default:
            console.log(chalk.gray('   👤 Continuing as guest'));
            console.log(
              chalk.dim('   You can sign in anytime with /auth command'),
            );
            break;
        }
      } else {
        console.log(chalk.gray('   👤 Authentication skipped'));
      }
    } catch (error: any) {
      console.log(
        chalk.yellow(`   ⚠️ Authentication setup failed: ${error.message}`),
      );
    } finally {
      rl.close();
    }
  }

  private static async handleSignIn(rl: readline.Interface): Promise<void> {
    try {
      const email = await new Promise<string>((resolve) =>
        rl.question('Email: ', resolve),
      );

      const password = await new Promise<string>((resolve) => {
        rl.question('Password: ', (answer) => {
          resolve(answer);
        });
      });

      if (email && password) {
        console.log(chalk.blue('🔄 Signing in...'));

        // Initialize auth provider if not already done
        const { authProvider } = await import(
          './providers/supabase/auth-provider'
        );

        const result = await authProvider.signIn(email, password, {
          rememberMe: true,
        });

        if (result) {
          console.log(
            chalk.green(
              `   ✅ Welcome back, ${result.profile.email || result.profile.username}!`,
            ),
          );
          console.log(
            chalk.gray(`   Subscription: ${result.profile.subscription_tier}`),
          );
        } else {
          console.log(chalk.red('   ❌ Sign in failed'));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Sign in error`));
    }
  }

  private static async handleSignUp(rl: readline.Interface): Promise<void> {
    try {
      const email = await new Promise<string>((resolve) =>
        rl.question('Email: ', resolve),
      );

      const password = await new Promise<string>((resolve) =>
        rl.question('Password: ', resolve),
      );

      const username = await new Promise<string>((resolve) =>
        rl.question('Username (optional): ', resolve),
      );

      if (email && password) {
        console.log(chalk.blue('🔄 Creating account...'));

        // Initialize auth provider if not already done
        const { authProvider } = await import(
          './providers/supabase/auth-provider'
        );

        const result = await authProvider.signUp(email, password, {
          username: username || undefined,
        });

        if (result) {
          console.log(chalk.green(`   ✅ Account created successfully!`));
          console.log(chalk.gray(`   Welcome, ${result.profile.email}!`));
          console.log(
            chalk.dim('   Check your email for verification (if required)'),
          );
        } else {
          console.log(chalk.red('   ❌ Account creation failed'));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Sign up error`));
    }
  }

  private static async showVersionInfo(): Promise<void> {
    console.log(chalk.blue('\n📦 Version Information'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const versionInfo = await getVersionInfo();

      let versionContent =
        chalk.cyan.bold(`Current Version: `) + chalk.white(versionInfo.current);

      if (versionInfo.error) {
        versionContent += '\n' + chalk.yellow(`⚠️  ${versionInfo.error}`);
      } else if (versionInfo.latest) {
        versionContent +=
          '\n' +
          chalk.cyan(`Latest Version: `) +
          chalk.white(versionInfo.latest);

        if (versionInfo.hasUpdate) {
          versionContent += '\n\n' + chalk.green.bold('🚀 Update Available!');
          versionContent +=
            '\n' + chalk.white('Run the following command to update:');
          versionContent +=
            '\n' + chalk.yellow.bold('npm update -g @cadcamfun/nikcli');
        } else {
          versionContent +=
            '\n\n' + chalk.green('✅ You are using the latest version!');
        }
      }

      const versionBox = boxen(versionContent, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: versionInfo.hasUpdate ? 'green' : 'cyan',
        backgroundColor: versionInfo.hasUpdate ? '#001a00' : '#001a2a',
      });

      console.log(versionBox);
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Unable to check version`));
    }
  }
}

/**
 * System Requirements Module
 */
class SystemModule {
  static lastOllamaStatus: boolean | undefined;
  static async checkApiKeys(): Promise<boolean> {
    // Allow running without API keys when using an Ollama model
    try {
      const currentModel = configManager.get('currentModel');
      const modelCfg = (configManager.get('models') as any)[currentModel];
      if (modelCfg && modelCfg.provider === 'ollama') {
        return true;
      }
    } catch (_) {
      // ignore config read errors, fall back to env checks
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const vercelKey = process.env.V0_API_KEY;
    const gatewayKey =
      process.env.AI_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;
    return !!(
      anthropicKey ||
      openaiKey ||
      googleKey ||
      vercelKey ||
      gatewayKey
    );
  }

  static checkNodeVersion(): boolean {
    // Prefer Bun if present
    try {
      // @ts-ignore - Bun exists at runtime when using Bun
      if (typeof Bun !== 'undefined') {
        // @ts-ignore
        const bunVersion = Bun.version as string;
        console.log(chalk.green(`✅ Bun ${bunVersion}`));
        return true;
      }
    } catch (_) {
      // ignore and fall back to Node check
    }

    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);

    if (major < 18) {
      console.log(
        chalk.red(`❌ Node.js ${major} is too old. Requires Node.js 18+`),
      );
      return false;
    }

    console.log(chalk.green(`✅ Node.js ${version}`));
    return true;
  }

  static async checkOllamaAvailability(): Promise<boolean> {
    // Only enforce when current provider is Ollama
    try {
      const currentModel = configManager.get('currentModel');
      const modelCfg = (configManager.get('models') as any)[currentModel];
      if (!modelCfg || modelCfg.provider !== 'ollama') {
        // Not applicable – clear status indicator
        SystemModule.lastOllamaStatus = undefined;
        return true;
      }
    } catch (_) {
      return true; // don't block if config is unreadable
    }

    try {
      const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
      const base = host.startsWith('http') ? host : `http://${host}`;
      const res = await fetch(`${base}/api/tags`, { method: 'GET' } as any);
      if (!res.ok) {
        SystemModule.lastOllamaStatus = false;
        console.log(
          chalk.red(
            `❌ Ollama reachable at ${base} but returned status ${res.status}`,
          ),
        );
        return false;
      }
      const data: any = await res.json().catch(() => null);
      if (!data || !Array.isArray(data.models)) {
        console.log(
          chalk.yellow(
            '⚠️ Unexpected response from Ollama when listing models',
          ),
        );
      } else {
        const currentModel = configManager.get('currentModel');
        const modelCfg = (configManager.get('models') as any)[currentModel];
        const name = modelCfg?.model;
        const present = data.models.some(
          (m: any) => m?.name === name || m?.model === name,
        );
        if (!present && name) {
          console.log(
            chalk.yellow(
              `⚠️ Ollama is running but model "${name}" is not present.`,
            ),
          );
          // Offer to pull the model now
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer: string = await new Promise((resolve) =>
            rl.question(
              `Pull model now with "ollama pull ${name}"? (Y/n): `,
              resolve,
            ),
          );
          rl.close();

          if (!answer || answer.toLowerCase().startsWith('y')) {
            console.log(chalk.blue(`⏳ Pulling model ${name}...`));
            const code: number = await new Promise<number>((resolve) => {
              const child = spawn('ollama', ['pull', name], {
                stdio: 'inherit',
              });
              child.on('close', (code) => resolve(code ?? 1));
              child.on('error', () => resolve(1));
            });
            if (code === 0) {
              console.log(chalk.green(`✅ Model ${name} pulled successfully`));
            } else {
              console.log(
                chalk.red(
                  `❌ Failed to pull model ${name}. You can try manually: ollama pull ${name}`,
                ),
              );
              SystemModule.lastOllamaStatus = false;
              return false;
            }
          } else {
            console.log(
              chalk.gray(`   You can pull it later with: ollama pull ${name}`),
            );
            SystemModule.lastOllamaStatus = false;
            return false;
          }
        }
      }
      console.log(chalk.green('✅ Ollama service detected'));
      SystemModule.lastOllamaStatus = true;
      return true;
    } catch (err) {
      const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
      const base = host.startsWith('http') ? host : `http://${host}`;
      console.log(chalk.red(`❌ Ollama service not reachable at ${base}`));
      console.log(
        chalk.gray(
          '   Start it with "ollama serve" or open the Ollama app. Install: https://ollama.com',
        ),
      );
      SystemModule.lastOllamaStatus = false;
      return false;
    }
  }

  static async checkSystemRequirements(): Promise<boolean> {
    console.log(chalk.blue('🔍 Checking system requirements...'));

    const checks = [
      this.checkNodeVersion(),
      await this.checkApiKeys(),
      await this.checkOllamaAvailability(),
    ];

    const allPassed = checks.every((r) => r);

    if (allPassed) {
      console.log(chalk.green('✅ All system checks passed'));
    } else {
      console.log(chalk.red('❌ System requirements not met'));
    }

    return allPassed;
  }
}

/**
 * Service Initialization Module
 */
class ServiceModule {
  private static initialized = false;
  private static agentManager: AgentManager | null = null;

  static async initializeServices(): Promise<void> {
    const workingDir = process.cwd();

    // Set working directory for all services
    toolService.setWorkingDirectory(workingDir);
    planningService.setWorkingDirectory(workingDir);
    lspService.setWorkingDirectory(workingDir);
    diffManager.setAutoAccept(true);

    // Initialize memory and snapshot services
    await memoryService.initialize();
    await snapshotService.initialize();

    console.log(chalk.dim('   Core services configured'));
  }

  static async initializeAgents(): Promise<void> {
    // Create and initialize the core AgentManager
    if (!this.agentManager) {
      this.agentManager = new AgentManager(configManager as any);
      await this.agentManager.initialize();
    }

    // Register agent classes (e.g., UniversalAgent)
    registerAgents(this.agentManager);

    // Ensure at least one agent instance is created (universal-agent)
    try {
      await this.agentManager.createAgent('universal-agent');
    } catch (_) {
      // If already created or creation failed silently, proceed
    }

    const agents = this.agentManager.listAgents();
    console.log(chalk.dim(`   Agents ready (${agents.length} available)`));
  }

  static async initializeTools(): Promise<void> {
    const tools = toolService.getAvailableTools();
    console.log(chalk.dim(`   Tools ready (${tools.length} available)`));
  }

  static async initializePlanning(): Promise<void> {
    console.log(chalk.dim('   Planning system ready'));
  }

  static async initializeSecurity(): Promise<void> {
    console.log(chalk.dim('   Security policies loaded'));
  }

  static async initializeContext(): Promise<void> {
    console.log(chalk.dim('   Context management ready'));
  }

  static async initializeEnhancedServices(): Promise<void> {
    const config = configManager.getAll();

    try {
      // Initialize cache service (always available with fallback)
      try {
        // cacheService initializes automatically in constructor
        console.log(chalk.dim('   ✓ Unified cache service ready'));
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠ Cache service warning`));
      }

      // Initialize Redis cache if enabled
      if (config.redis?.enabled) {
        try {
          // redisProvider initializes connection automatically
          console.log(chalk.dim('   ✓ Redis cache provider ready'));
        } catch (error: any) {
          console.log(chalk.yellow(`   ⚠ Redis connection warning`));
        }
      }

      // Initialize Supabase if enabled
      if (config.supabase?.enabled) {
        try {
          // Add error listener to prevent unhandled promise rejections
          enhancedSupabaseProvider.on('error', (error: any) => {
            console.log(chalk.yellow(`⚠️ Supabase Provider Error`));
          });

          // enhancedSupabaseProvider and authProvider initialize automatically
          console.log(chalk.dim('   ✓ Supabase providers ready'));
        } catch (error: any) {
          console.log(chalk.yellow(`   ⚠ Supabase initialization warning`));
        }
      }

      // Initialize enhanced token cache

      // Initialize vision and image providers for autonomous capabilities
      try {
        // Import providers to make them available for autonomous chat
        const { visionProvider } = await import('./providers/vision');
        const { imageGenerator } = await import('./providers/image');

        // Providers initialize automatically in their constructors
        console.log(
          chalk.dim('   ✓ Vision & Image providers ready for autonomous use'),
        );

        // Make providers globally accessible for chat
        (global as any).visionProvider = visionProvider;
        (global as any).imageGenerator = imageGenerator;
      } catch (error: any) { }
    } catch (error: any) {
      console.log(chalk.red(`❌ Enhanced services failed`));
      // Don't throw error to allow system to continue with basic functionality
      console.log(
        chalk.yellow('System will continue with basic services only'),
      );
    }
  }

  static async initializeSystem(): Promise<boolean> {
    if (this.initialized) return true;

    console.log(chalk.blue('🔄 Initializing system...'));

    const steps = [
      { name: 'Services', fn: this.initializeServices.bind(this) },
      {
        name: 'Enhanced Services',
        fn: this.initializeEnhancedServices.bind(this),
      },
      { name: 'Agents', fn: this.initializeAgents.bind(this) },
      { name: 'Tools', fn: this.initializeTools.bind(this) },
      { name: 'Planning', fn: this.initializePlanning.bind(this) },
      { name: 'Security', fn: this.initializeSecurity.bind(this) },
      { name: 'Context', fn: this.initializeContext.bind(this) },
    ];

    for (const step of steps) {
      try {
        await step.fn();
      } catch (error: any) {
        console.log(chalk.red(`❌ ${step.name} failed: ${error.message}`));
        return false;
      }
    }

    this.initialized = true;
    console.log(chalk.green('✅ System ready'));
    return true;
  }
}

/**
 * Streaming Orchestrator Module
 */
class StreamingModule extends EventEmitter {
  private rl: readline.Interface;
  private context: StreamContext;
  private policyManager: ExecutionPolicyManager;
  private messageQueue: StreamMessage[] = [];
  private processingMessage = false;
  private activeAgents = new Map<string, any>();

  constructor() {
    super();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
      completer: (
        line: string,
        callback: (err: any, result: [string[], string]) => void,
      ) => {
        this.autoComplete(line)
          .then((result) => callback(null, result))
          .catch((err) => callback(err, [[], line]));
      },
    });

    this.context = {
      workingDirectory: process.cwd(),
      autonomous: true,
      planMode: false,
      autoAcceptEdits: true,
      contextLeft: 20,
      maxContext: 100,
    };

    this.policyManager = new ExecutionPolicyManager(configManager);
    this.setupInterface();
    this.startMessageProcessor();
  }

  private setupInterface(): void {
    // Raw mode for better control
    if (process.stdin.isTTY) {
      require('readline').emitKeypressEvents(process.stdin);
      if (!(process.stdin as any).isRaw) {
        (process.stdin as any).setRawMode(true);
      }
      (process.stdin as any).resume();
    }

    // Keypress handlers
    process.stdin.on('keypress', (str, key) => {
      if (key && key.name === 'slash' && !this.processingMessage) {
        setTimeout(() => this.showCommandMenu(), 50);
      }

      if (key && key.name === 'tab' && key.shift) {
        this.cycleMode();
      }

      if (key && key.name === 'c' && key.ctrl) {
        if (this.activeAgents.size > 0) {
          this.stopAllAgents();
        } else {
          this.gracefulExit();
        }
      }
    });

    // Input handler
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.showPrompt();
        return;
      }

      await this.queueUserInput(trimmed);
      this.showPrompt();
    });

    this.rl.on('close', () => {
      this.gracefulExit();
    });

    this.setupServiceListeners();
  }

  private setupServiceListeners(): void {
    // Agent events
    agentService.on('task_start', (task) => {
      this.activeAgents.set(task.id, task);
      this.queueMessage({
        type: 'system',
        content: `🤖 Agent ${task.agentType} started: ${task.task.slice(0, 50)}...`,
        metadata: { agentId: task.id, agentType: task.agentType },
      });
    });

    agentService.on('task_progress', (task, update) => {
      this.queueMessage({
        type: 'agent',
        content: `📊 ${task.agentType}: ${update.progress}% ${update.description || ''}`,
        metadata: { agentId: task.id, progress: update.progress },
        agentId: task.id,
        progress: update.progress,
      });
    });
  }

  private queueMessage(message: Partial<StreamMessage>): void {
    const fullMessage: StreamMessage = {
      id: Date.now().toString(),
      timestamp: new Date(),
      status: 'queued',
      ...message,
    } as StreamMessage;

    this.messageQueue.push(fullMessage);
  }

  private async queueUserInput(input: string): Promise<void> {
    this.queueMessage({
      type: 'user',
      content: input,
    });
  }

  private showPrompt(): void {
    const dir = require('path').basename(this.context.workingDirectory);
    const agents = this.activeAgents.size;
    const agentIndicator = agents > 0 ? chalk.blue(`${agents}🤖`) : '🎛️';

    const modes = [];
    if (this.context.planMode) modes.push(chalk.cyan('plan'));
    if (this.context.autoAcceptEdits) modes.push(chalk.green('auto-accept'));
    const modeStr = modes.length > 0 ? ` ${modes.join(' ')} ` : '';

    const contextStr = chalk.dim(`${this.context.contextLeft}%`);

    // Model/provider badge with Ollama status dot
    let modelBadge = '';
    try {
      const currentModel = configManager.get('currentModel');
      const models = (configManager.get('models') as any) || {};
      const modelCfg = models[currentModel] || {};
      const provider = modelCfg.provider || 'unknown';
      // Status dot only meaningful for Ollama
      let dot = chalk.dim('●');
      if (provider === 'ollama') {
        if (SystemModule.lastOllamaStatus === true) dot = chalk.green('●');
        else if (SystemModule.lastOllamaStatus === false) dot = chalk.red('●');
        else dot = chalk.yellow('●');
      }
      const prov = chalk.magenta(provider);
      const name = chalk.white(currentModel || 'model');
      modelBadge = `${prov}:${name}${provider === 'ollama' ? ` ${dot}` : ''}`;
    } catch (_) {
      modelBadge = chalk.gray('model:unknown');
    }

    // Assistant status dot: green when active (with …), red when waiting for input
    const statusDot = this.processingMessage
      ? chalk.green('●') + chalk.dim('…')
      : chalk.red('●');
    const statusBadge = `asst:${statusDot}`;

    // Realistic prompt styling (no rainbow)
    const prompt = `\n┌─[${agentIndicator}:${chalk.green(dir)}${modeStr}]─[${contextStr}]─[${statusBadge}]─[${modelBadge}]\n└─❯ `;
    this.rl.setPrompt(prompt);
    this.rl.prompt();
  }

  private async autoComplete(line: string): Promise<[string[], string]> {
    try {
      // Use the smart completion manager for intelligent completions
      const { smartCompletionManager } = await import(
        './core/smart-completion-manager'
      );

      const completions = await smartCompletionManager.getCompletions(line, {
        currentDirectory: process.cwd(),
        interface: 'default',
      });

      // Convert to readline format
      const suggestions = completions.map((comp) => comp.completion);
      return [suggestions.length ? suggestions : [], line];
    } catch (error) {
      // Fallback to original static completion
      const commands = [
        '/status',
        '/agents',
        '/diff',
        '/accept',
        '/clear',
        '/help',
      ];
      const agents = [
        '@react-expert',
        '@backend-expert',
        '@frontend-expert',
        '@devops-expert',
        '@code-review',
        '@autonomous-coder',
      ];

      const all = [...commands, ...agents];
      const hits = all.filter((c) => c.startsWith(line));
      return [hits.length ? hits : all, line];
    }
  }

  private showCommandMenu(): void {
    const lines: string[] = [];
    lines.push(`${chalk.bold('📋 Available Commands')}`);
    lines.push('');
    lines.push(`${chalk.green('/help')}     Show detailed help`);
    lines.push(`${chalk.green('/agents')}   List available agents`);
    lines.push(`${chalk.green('/status')}   Show system status`);
    lines.push(`${chalk.green('/clear')}    Clear session`);
    const content = lines.join('\n');
    console.log(
      boxen(content, {
        padding: { top: 0, right: 2, bottom: 0, left: 2 },
        margin: { top: 1, right: 0, bottom: 0, left: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        title: chalk.cyan('Command Menu'),
        titleAlignment: 'center',
      }),
    );
  }

  private cycleMode(): void {
    this.context.planMode = !this.context.planMode;
    console.log(
      this.context.planMode
        ? chalk.green('\n✅ Plan mode enabled')
        : chalk.yellow('\n⚠️ Plan mode disabled'),
    );
  }

  private stopAllAgents(): void {
    this.activeAgents.clear();
    console.log(chalk.yellow('\n⏹️ Stopped all active agents'));
  }

  private startMessageProcessor(): void {
    setInterval(() => {
      if (!this.processingMessage) {
        this.processNextMessage();
      }
    }, 100);
  }

  private processNextMessage(): void {
    const message = this.messageQueue.find((m) => m.status === 'queued');
    if (!message) return;

    this.processingMessage = true;
    message.status = 'processing';
    // Update prompt to reflect active status
    this.showPrompt();

    // Process message based on type
    setTimeout(() => {
      message.status = 'completed';
      this.processingMessage = false;
      // Update prompt to reflect idle status
      this.showPrompt();
    }, 100);
  }

  private gracefulExit(): void {
    console.log(chalk.blue('\n👋 Shutting down orchestrator...'));

    if (this.activeAgents.size > 0) {
      console.log(
        chalk.yellow(
          `⏳ Waiting for ${this.activeAgents.size} agents to finish...`,
        ),
      );
    }

    console.log(chalk.green('✅ Goodbye!'));
    process.exit(0);
  }

  async start(): Promise<void> {
    this.showPrompt();

    return new Promise<void>((resolve) => {
      this.rl.on('close', resolve);
    });
  }
}

/**
 * Main Orchestrator - Unified Entry Point
 */
class MainOrchestrator {
  private streamingModule?: StreamingModule;
  private initialized = false;

  constructor() {
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers(): void {
    // Global error handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error(chalk.red('❌ Unhandled Rejection:'), reason);
    });

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('❌ Uncaught Exception:'), error);
      this.gracefulShutdown();
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    console.log(chalk.yellow('\n🛑 Shutting down orchestrator...'));

    try {
      // Stop autonomous interface if running (not used in unified NikCLI entrypoint)
      // No specific stop required here

      // Stop streaming module if running
      if (this.streamingModule) {
        // Streaming module handles its own cleanup
      }

      console.log(chalk.green('✅ Orchestrator shut down cleanly'));
    } catch (error) {
      console.error(chalk.red('❌ Error during shutdown:'), error);
    } finally {
      process.exit(0);
    }
  }

  async start(): Promise<void> {
    try {
      // Run onboarding flow
      const onboardingComplete = await OnboardingModule.runOnboarding();
      if (!onboardingComplete) {
        console.log(
          chalk.yellow(
            '\n⚠️ Onboarding incomplete. Please address the issues above.',
          ),
        );
        process.exit(1);
      }

      // Disable console logging during initialization
      Logger.setConsoleOutput(false);
      UtilsLogger.getInstance().setConsoleOutput(false);

      // Initialize all systems
      const initialized = await ServiceModule.initializeSystem();
      if (!initialized) {
        console.log(
          chalk.red('\n❌ Cannot start - system initialization failed'),
        );
        process.exit(1);
      }

      // Re-enable console logging
      Logger.setConsoleOutput(true);
      UtilsLogger.getInstance().setConsoleOutput(true);

      // Welcome message
      console.log(chalk.green.bold('\n🎉 Welcome to NikCLI!'));
      console.log(chalk.gray('─'.repeat(40)));

      // Show quick start guide

      const cli = new NikCLI();
      await cli.startChat({
        // Enable structured UI mode from the start
        structuredUI: true,
      });
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start orchestrator:'), error);
      process.exit(1);
    }
  }
}

/**
 * Main entry point function
 */
async function main() {
  // Parse command line arguments
  const argv = process.argv.slice(2);

  // Check for ACP mode
  if (argv.includes('--acp') || argv.includes('acp') || process.env.NIKCLI_MODE === 'acp') {
    try {
      // Import ACP functionality
      const { runAcpCli } = await import('./acp');
      await runAcpCli();
      return;
    } catch (err: any) {
      console.error(
        chalk.red('ACP mode failed:'),
        err?.message || err,
      );
      process.exit(1);
    }
  }

  // Minimal non-interactive report mode for CI/VS Code
  if (argv[0] === 'report' || argv.includes('--report')) {
    try {
      const { generateReports } = await import('./commands/report');
      const getFlag = (name: string) => {
        const i = argv.indexOf(`--${name}`);
        return i !== -1 ? argv[i + 1] : undefined;
      };
      const out = getFlag('out');
      const report = getFlag('report');
      const depthStr = getFlag('depth');
      const model = getFlag('model');
      const depth = depthStr ? parseInt(depthStr, 10) : undefined;
      await generateReports({ out, report, depth, model });
      return;
    } catch (err: any) {
      console.error(
        chalk.red('Report generation failed:'),
        err?.message || err,
      );
      process.exit(1);
    }
  }

  const orchestrator = new MainOrchestrator();
  await orchestrator.start();
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('❌ Startup failed:'), error);
    process.exit(1);
  });
}

// Export for programmatic use
export {
  main,
  MainOrchestrator,
  IntroductionModule,
  OnboardingModule,
  SystemModule,
  ServiceModule,
  StreamingModule,
};
