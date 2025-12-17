/**
 * Agent Chat Service
 * 
 * Handles AI streaming with multi-provider support using Vercel AI SDK.
 * Supports: OpenAI, Anthropic, xAI, Google, Mistral, DeepSeek, Groq, OpenRouter, Ollama, Custom
 */

import { streamText, type CoreMessage, type LanguageModel, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import type { AgentSettings, AgentProvider, ProviderApiKeys } from '@/types/agent';

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Base URLs for OpenAI-compatible providers
 */
const PROVIDER_BASE_URLS: Partial<Record<AgentProvider, string>> = {
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api/v1',
};

/**
 * Create a language model instance based on provider settings
 */
export function createProviderModel(settings: AgentSettings): LanguageModel {
  const { provider, model, apiKeys, baseUrl } = settings;
  const apiKey = apiKeys?.[provider as keyof ProviderApiKeys] || '';

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }

    case 'xai': {
      const xai = createXai({ apiKey });
      return xai(model);
    }

    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }

    case 'mistral': {
      const mistral = createMistral({ apiKey });
      return mistral(model);
    }

    case 'groq': {
      const groq = createGroq({ apiKey });
      return groq(model);
    }

    case 'deepseek': {
      // DeepSeek uses OpenAI-compatible API (Chat Completions)
      const deepseek = createOpenAI({
        apiKey,
        baseURL: PROVIDER_BASE_URLS.deepseek,
      });
      return deepseek.chat(model);
    }

    case 'openrouter': {
      // OpenRouter uses OpenAI-compatible API but doesn't support the Responses API
      // Use .chat() to force Chat Completions API instead
      const openrouter = createOpenAI({
        apiKey,
        baseURL: PROVIDER_BASE_URLS.openrouter,
      });
      return openrouter.chat(model);
    }

    case 'ollama': {
      // Ollama uses OpenAI-compatible API (Chat Completions)
      const ollamaUrl = baseUrl || 'http://localhost:11434/v1';
      const ollama = createOpenAI({
        apiKey: 'ollama', // Ollama doesn't require a real API key
        baseURL: ollamaUrl,
      });
      return ollama.chat(model);
    }

    case 'custom': {
      // Custom OpenAI-compatible endpoint (Chat Completions)
      if (!baseUrl) {
        throw new Error('Custom provider requires a base URL');
      }
      const custom = createOpenAI({
        apiKey,
        baseURL: baseUrl,
      });
      return custom.chat(model);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// =============================================================================
// Chat Streaming
// =============================================================================

export interface StreamChatOptions {
  messages: CoreMessage[];
  settings: AgentSettings;
  tools?: ToolSet;
  systemPrompt?: string;
  abortSignal?: AbortSignal;
}

export interface StreamChatResult {
  textStream: AsyncIterable<string>;
  fullText: Promise<string>;
}

/**
 * Default system prompt for the agent
 */
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant specialized in diagnosing and fixing Windows computer issues. You have access to tools that can:

1. Execute PowerShell commands to diagnose and fix issues
2. Search the web for solutions and documentation
3. Save and recall information from memory
4. Read and write files
5. List available CLI programs

When helping users:
- Ask clarifying questions if needed
- Explain what you're doing and why
- Use appropriate tools to gather information before suggesting fixes
- Save successful solutions to memory for future reference
- Be cautious with system-modifying commands

Commands may require user approval before execution. Always explain what a command does before requesting to run it.`;

/**
 * Stream a chat response from the AI provider
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamChatResult> {
  const {
    messages,
    settings,
    tools,
    systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    abortSignal,
  } = options;

  const model = createProviderModel(settings);

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    abortSignal,
  });

  return {
    textStream: result.textStream,
    fullText: result.text,
  };
}

/**
 * Convert local message format to CoreMessage format
 */
export function convertToCoreMessages(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): CoreMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}
