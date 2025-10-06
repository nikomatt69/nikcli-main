import { Provider } from './base-provider';
import { Logger } from '../utils/logger';

export class ProviderRegistry {
    private providers = new Map<string, Provider<any, any>>();
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    register<T extends Provider<any, any>>(provider: T): void {
        this.providers.set(provider.name, provider);
        this.logger.info('Provider registered', { name: provider.name });
    }

    get(name: string): Provider<any, any> | undefined {
        return this.providers.get(name);
    }

    detectProvider(url: string): Provider<any, any> | null {
        // Auto-detect provider from URL
        if (url.includes('openai.com') || url.includes('api.openai.com')) {
            const provider = this.get('openai');
            if (provider) {
                this.logger.debug('Auto-detected OpenAI provider', { url });
                return provider;
            }
        }

        if (url.includes('anthropic.com') || url.includes('api.anthropic.com')) {
            const provider = this.get('anthropic');
            if (provider) {
                this.logger.debug('Auto-detected Anthropic provider', { url });
                return provider;
            }
        }

        if (url.includes('googleapis.com') || url.includes('generativelanguage')) {
            const provider = this.get('google');
            if (provider) {
                this.logger.debug('Auto-detected Google provider', { url });
                return provider;
            }
        }

        this.logger.warn('No provider detected for URL', { url });
        return null;
    }

    listProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    hasProvider(name: string): boolean {
        return this.providers.has(name);
    }
}

export const createProviderRegistry = (logger: Logger): ProviderRegistry => {
    return new ProviderRegistry(logger);
};

