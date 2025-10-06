# AI Model Context Window Limits

This document lists the maximum context window (token limits) for all supported AI models in NikCLI.

## Overview

Context window refers to the maximum number of tokens (input + output) that a model can process in a single request. Managing these limits properly is crucial for:

- Preventing API errors from context overflow
- Optimizing token usage and costs
- Ensuring reliable AI interactions

## Model Context Limits

### Claude Models (Anthropic)

| Model                      | Context Limit  | Notes             |
| -------------------------- | -------------- | ----------------- |
| claude-sonnet-4-20250514   | 200,000 tokens | Latest Sonnet 4   |
| claude-3-5-sonnet-latest   | 200,000 tokens | Sonnet 3.5 latest |
| claude-3-5-sonnet-20241022 | 200,000 tokens | Sonnet 3.5 dated  |
| claude-3-7-sonnet-20250219 | 200,000 tokens | Sonnet 3.7        |
| claude-opus-4-20250514     | 200,000 tokens | Opus 4            |
| claude-opus-4.1            | 200,000 tokens | Opus 4.1          |
| claude-3-opus-20240229     | 200,000 tokens | Opus 3            |
| claude-3-sonnet-20240229   | 200,000 tokens | Sonnet 3          |
| claude-3-haiku-20240307    | 200,000 tokens | Haiku 3           |
| claude-3-5-haiku           | 200,000 tokens | Haiku 3.5         |

### OpenAI GPT Models

| Model                 | Context Limit    | Notes              |
| --------------------- | ---------------- | ------------------ |
| gpt-5                 | 200,000 tokens   | GPT-5 base         |
| gpt-5-mini-2025-08-07 | 128,000 tokens   | GPT-5 Mini         |
| gpt-5-nano-2025-08-07 | 128,000 tokens   | GPT-5 Nano         |
| gpt-4o                | 128,000 tokens   | GPT-4 Optimized    |
| gpt-4.1               | 1,000,000 tokens | GPT-4.1 (extended) |
| gpt-4o-mini           | 128,000 tokens   | GPT-4o Mini        |
| gpt-4                 | 128,000 tokens   | GPT-4 base         |
| gpt-4-turbo-preview   | 128,000 tokens   | GPT-4 Turbo        |
| gpt-3.5-turbo         | 16,384 tokens    | GPT-3.5 Turbo      |

### Google Gemini Models

| Model                 | Context Limit    | Notes           |
| --------------------- | ---------------- | --------------- |
| gemini-2.5-pro        | 2,097,152 tokens | ~2M tokens      |
| gemini-2.5-pro-200k   | 200,000 tokens   | Limited variant |
| gemini-2.5-flash      | 1,000,000 tokens | 1M tokens       |
| gemini-2.5-flash-lite | 1,000,000 tokens | 1M tokens       |
| gemini-2.0-flash      | 1,000,000 tokens | 1M tokens       |
| gemini-2.0-flash-exp  | 1,000,000 tokens | Experimental    |
| gemini-1.5-pro        | 2,097,152 tokens | ~2M tokens      |
| gemini-1.5-flash      | 1,000,000 tokens | 1M tokens       |

### xAI Grok Models

| Model                | Context Limit  | Notes        |
| -------------------- | -------------- | ------------ |
| grok-4               | 128,000 tokens | Grok 4       |
| grok-3               | 128,000 tokens | Grok 3       |
| grok-3-mini          | 128,000 tokens | Grok 3 Mini  |
| grok-3-speedier      | 128,000 tokens | Fast variant |
| grok-3-mini-speedier | 128,000 tokens | Fast mini    |
| grok-2               | 128,000 tokens | Grok 2       |

### DeepSeek Models

| Model                            | Context Limit  | Notes           |
| -------------------------------- | -------------- | --------------- |
| deepseek-r1                      | 128,000 tokens | DeepSeek R1     |
| deepseek-r1-8b                   | 128,000 tokens | 8B variant      |
| deepseek-r1-3b                   | 128,000 tokens | 3B variant      |
| deepseek-r1-7b                   | 128,000 tokens | 7B variant      |
| deepseek-r1:8b                   | 128,000 tokens | Ollama 8B       |
| deepseek-r1:3b                   | 128,000 tokens | Ollama 3B       |
| deepseek-r1:7b                   | 128,000 tokens | Ollama 7B       |
| deepseek/deepseek-chat-v3.1:free | 128,000 tokens | OpenRouter free |
| deepseek/deepseek-v3.1-terminus  | 128,000 tokens | Terminus        |
| deepseek/deepseek-v3.2-exp       | 128,000 tokens | Experimental    |

### Meta Llama Models

| Model                              | Context Limit  | Notes         |
| ---------------------------------- | -------------- | ------------- |
| llama3.1:8b                        | 128,000 tokens | Llama 3.1 8B  |
| meta-llama/llama-3.1-405b-instruct | 128,000 tokens | 405B instruct |
| meta-llama/llama-3.1-70b-instruct  | 128,000 tokens | 70B instruct  |
| meta-llama/llama-3.1-8b-instruct   | 128,000 tokens | 8B instruct   |

### Mistral Models

| Model                   | Context Limit  | Notes         |
| ----------------------- | -------------- | ------------- |
| mistral:7b              | 128,000 tokens | Mistral 7B    |
| mistralai/mistral-large | 128,000 tokens | Mistral Large |

### Vercel V0 Models

| Model     | Context Limit | Notes         |
| --------- | ------------- | ------------- |
| v0-1.0-md | 32,000 tokens | V0 1.0 Medium |
| v0-1.5-md | 32,000 tokens | V0 1.5 Medium |
| v0-1.5-lg | 32,000 tokens | V0 1.5 Large  |

### Other Models

| Model                            | Context Limit  | Notes          |
| -------------------------------- | -------------- | -------------- |
| codellama:7b                     | 16,000 tokens  | Code Llama 7B  |
| gpt-oss:20b                      | 128,000 tokens | GPT OSS 20B    |
| openai/gpt-oss-120b:free         | 128,000 tokens | GPT OSS 120B   |
| gemma3n                          | 8,192 tokens   | Gemma 3        |
| gemma3n-large                    | 8,192 tokens   | Gemma 3 Large  |
| nvidia/nemotron-nano-9b-v2:free  | 32,000 tokens  | Nemotron Nano  |
| z-ai/glm-4.5v                    | 128,000 tokens | GLM 4.5 Vision |
| z-ai/glm-4.5                     | 128,000 tokens | GLM 4.5        |
| z-ai/glm-4.6                     | 128,000 tokens | GLM 4.6        |
| qwen/qwen3-next-80b-a3b-thinking | 128,000 tokens | Qwen3 Next     |
| qwen/qwen3-coder                 | 128,000 tokens | Qwen3 Coder    |
| qwen/qwen3-coder-plus            | 128,000 tokens | Qwen3 Coder+   |
| moonshotai/kimi-k2-0905          | 128,000 tokens | Kimi K2        |
| @preset/nikcli                   | 200,000 tokens | NikCLI Preset  |
| @preset/nikcli-pro               | 200,000 tokens | NikCLI Pro     |

### OpenRouter Model Variants

Most OpenRouter models use the same context limits as their base models:

- Anthropic models via OpenRouter: 200,000 tokens
- OpenAI models via OpenRouter: 128,000 - 200,000 tokens
- Google models via OpenRouter: 1,000,000 - 2,097,152 tokens

## Default Fallback

For unknown or unspecified models, the system defaults to: **128,000 tokens**

## Implementation Notes

1. **Safety Margin**: The system typically uses 60-80% of the maximum context to leave room for output and avoid edge cases.

2. **Dynamic Management**: Context limits are managed dynamically based on the active model.

3. **Error Prevention**: The system validates token counts before making API calls to prevent context overflow errors.

4. **Cost Optimization**: Proper context management helps optimize API costs by avoiding unnecessary token usage.

## Sources

Information compiled from official documentation and research as of 2025:

- Anthropic Claude documentation
- OpenAI API documentation
- Google AI documentation
- xAI documentation
- Model provider announcements
- Community benchmarks and testing

## Updates

Last updated: 2025-02-06
