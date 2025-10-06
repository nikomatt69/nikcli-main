export interface ModelConfig {
    name: string;
    contextWindow: number;
    maxOutputTokens: number;
    supportsVision: boolean;
    supportsFunctions: boolean;
    supportsJSON: boolean;
    supportsStructuredOutputs: boolean;
    supportsParallelTools: boolean;
    costPer1MTokens: { input: number; output: number; cachedInput?: number };
    trainingDataCutoff: string;
    deprecated: boolean;
    recommendedFor: string[];
    encoding?: string;
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
    // GPT-4o family (latest, most capable)
    "gpt-4o": {
        name: "gpt-4o",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: true,
        supportsParallelTools: true,
        costPer1MTokens: { input: 2.5, output: 10.0 },
        trainingDataCutoff: "2023-10",
        deprecated: false,
        recommendedFor: ["general", "vision", "function-calling", "structured-output"],
        encoding: "cl100k_base"
    },
    "gpt-4o-mini": {
        name: "gpt-4o-mini",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: true,
        supportsParallelTools: true,
        costPer1MTokens: { input: 0.15, output: 0.6 },
        trainingDataCutoff: "2023-10",
        deprecated: false,
        recommendedFor: ["cost-optimized", "high-volume", "function-calling"],
        encoding: "cl100k_base"
    },
    "gpt-4o-2024-08-06": {
        name: "gpt-4o-2024-08-06",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: true,
        supportsParallelTools: true,
        costPer1MTokens: { input: 2.5, output: 10.0 },
        trainingDataCutoff: "2023-10",
        deprecated: false,
        recommendedFor: ["structured-output", "function-calling"],
        encoding: "cl100k_base"
    },

    // O1 reasoning models
    "o1-preview": {
        name: "o1-preview",
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsFunctions: false,
        supportsJSON: false,
        supportsStructuredOutputs: false,
        supportsParallelTools: false,
        costPer1MTokens: { input: 15.0, output: 60.0 },
        trainingDataCutoff: "2023-10",
        deprecated: false,
        recommendedFor: ["reasoning", "complex-problems", "research"],
        encoding: "cl100k_base"
    },
    "o1-mini": {
        name: "o1-mini",
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsFunctions: false,
        supportsJSON: false,
        supportsStructuredOutputs: false,
        supportsParallelTools: false,
        costPer1MTokens: { input: 3.0, output: 12.0 },
        trainingDataCutoff: "2023-10",
        deprecated: false,
        recommendedFor: ["reasoning", "cost-optimized-reasoning"],
        encoding: "cl100k_base"
    },

    // GPT-4 Turbo family
    "gpt-4-turbo": {
        name: "gpt-4-turbo",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: true,
        costPer1MTokens: { input: 10.0, output: 30.0 },
        trainingDataCutoff: "2023-12",
        deprecated: false,
        recommendedFor: ["vision", "large-context"],
        encoding: "cl100k_base"
    },
    "gpt-4-turbo-preview": {
        name: "gpt-4-turbo-preview",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: true,
        costPer1MTokens: { input: 10.0, output: 30.0 },
        trainingDataCutoff: "2023-12",
        deprecated: true,
        recommendedFor: [],
        encoding: "cl100k_base"
    },

    // GPT-4 standard
    "gpt-4": {
        name: "gpt-4",
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: false,
        costPer1MTokens: { input: 30.0, output: 60.0 },
        trainingDataCutoff: "2021-09",
        deprecated: false,
        recommendedFor: ["legacy", "high-quality"],
        encoding: "cl100k_base"
    },
    "gpt-4-32k": {
        name: "gpt-4-32k",
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: false,
        costPer1MTokens: { input: 60.0, output: 120.0 },
        trainingDataCutoff: "2021-09",
        deprecated: true,
        recommendedFor: [],
        encoding: "cl100k_base"
    },

    // GPT-3.5 Turbo family
    "gpt-3.5-turbo": {
        name: "gpt-3.5-turbo",
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: true,
        costPer1MTokens: { input: 0.5, output: 1.5 },
        trainingDataCutoff: "2021-09",
        deprecated: false,
        recommendedFor: ["cost-optimized", "high-volume"],
        encoding: "cl100k_base"
    },
    "gpt-3.5-turbo-16k": {
        name: "gpt-3.5-turbo-16k",
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctions: true,
        supportsJSON: true,
        supportsStructuredOutputs: false,
        supportsParallelTools: true,
        costPer1MTokens: { input: 0.5, output: 1.5 },
        trainingDataCutoff: "2021-09",
        deprecated: true,
        recommendedFor: [],
        encoding: "cl100k_base"
    }
};

export function getModelConfig(model: string): ModelConfig {
    const config = MODEL_CONFIGS[model];

    if (!config) {
        // Return a safe default for unknown models
        return {
            name: model,
            contextWindow: 4096,
            maxOutputTokens: 2048,
            supportsVision: false,
            supportsFunctions: false,
            supportsJSON: false,
            supportsStructuredOutputs: false,
            supportsParallelTools: false,
            costPer1MTokens: { input: 10.0, output: 30.0 },
            trainingDataCutoff: "unknown",
            deprecated: false,
            recommendedFor: ["unknown"],
            encoding: "cl100k_base"
        };
    }

    return config;
}

export function isModelDeprecated(model: string): boolean {
    const config = getModelConfig(model);
    return config.deprecated;
}

export function getRecommendedModel(requirement: string): string {
    for (const [modelName, config] of Object.entries(MODEL_CONFIGS)) {
        if (!config.deprecated && config.recommendedFor.includes(requirement)) {
            return modelName;
        }
    }

    return "gpt-4o"; // Default fallback
}

export function calculateTokenCost(model: string, inputTokens: number, outputTokens: number): number {
    const config = getModelConfig(model);
    const inputCost = (inputTokens / 1_000_000) * config.costPer1MTokens.input;
    const outputCost = (outputTokens / 1_000_000) * config.costPer1MTokens.output;
    return inputCost + outputCost;
}

