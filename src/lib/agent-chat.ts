/**
 * Agent Chat Service
 *
 * Handles AI streaming with multi-provider support using Vercel AI SDK.
 * Supports: OpenAI, Anthropic, xAI, Google, Mistral, DeepSeek, Groq, OpenRouter, Ollama, Custom
 */

import {
  streamText,
  stepCountIs,
  type CoreMessage,
  type LanguageModel,
  type ToolSet,
  type TextStreamPart,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import type {
  AgentSettings,
  AgentProvider,
  ProviderApiKeys,
} from "@/types/agent";
import { invoke } from "@tauri-apps/api/core";

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Base URLs for OpenAI-compatible providers
 */
const PROVIDER_BASE_URLS: Partial<Record<AgentProvider, string>> = {
  deepseek: "https://api.deepseek.com",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Create a language model instance based on provider settings
 */
export function createProviderModel(settings: AgentSettings): LanguageModel {
  const { provider, model, apiKeys, baseUrl } = settings;
  const apiKey = apiKeys?.[provider as keyof ProviderApiKeys] || "";

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }

    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }

    case "xai": {
      const xai = createXai({ apiKey });
      return xai(model);
    }

    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }

    case "mistral": {
      const mistral = createMistral({ apiKey });
      return mistral(model);
    }

    case "groq": {
      const groq = createGroq({ apiKey });
      return groq(model);
    }

    case "deepseek": {
      // DeepSeek uses OpenAI-compatible API (Chat Completions)
      const deepseek = createOpenAI({
        apiKey,
        baseURL: PROVIDER_BASE_URLS.deepseek,
      });
      return deepseek.chat(model);
    }

    case "openrouter": {
      // OpenRouter uses OpenAI-compatible API but doesn't support the Responses API
      // Use .chat() to force Chat Completions API instead
      const openrouter = createOpenAI({
        apiKey,
        baseURL: PROVIDER_BASE_URLS.openrouter,
      });
      return openrouter.chat(model);
    }

    case "ollama": {
      // Ollama uses OpenAI-compatible API (Chat Completions)
      const ollamaUrl = baseUrl || "http://localhost:11434/v1";
      const ollama = createOpenAI({
        apiKey: "ollama", // Ollama doesn't require a real API key
        baseURL: ollamaUrl,
      });
      return ollama.chat(model);
    }

    case "custom": {
      // Custom OpenAI-compatible endpoint (Chat Completions)
      if (!baseUrl) {
        throw new Error("Custom provider requires a base URL");
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
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>;
  fullText: Promise<string>;
}

/**
 * Default system prompt for the agent
 */
const DEFAULT_SYSTEM_PROMPT = `You are an autonomous AI agent specialized in diagnosing and fixing Windows computer issues. You have full capability to execute multi-step tasks and should complete them fully.

## Core Behavior - IMPORTANT

You are an AGENTIC assistant. This means:
- **Complete tasks fully** - Don't stop after one tool call. Keep going until the user's goal is achieved.
- **Chain tools together** - If a task requires multiple steps (search, then run command, then analyze), do them all.
- **Be autonomous** - Make decisions and take action. Don't ask "should I proceed?" - just proceed.
- **Learn from results** - If a command fails, analyze the error and try a different approach immediately.

## Available Tools

1. **execute_command** - Execute PowerShell/CMD commands. The user approves commands before they run.

2. **search_web** - Search the web for solutions, documentation, or error fixes.

3. **save_to_memory** / **recall_memory** - Store and retrieve information for future reference.

4. **read_file** / **write_file** - Read and modify files. Write operations require user approval.

5. **list_programs** - List available CLI programs in the programs folder.

## Multi-Step Task Examples

User: "Find a file called resume in downloads and move to USB"
→ Step 1: execute_command with "Get-ChildItem -Path $env:USERPROFILE\\Downloads -Recurse -Filter '*resume*'"
→ Step 2: Analyze output to find the file
→ Step 3: execute_command with "Get-Volume" to find USB drive letter
→ Step 4: execute_command with "Move-Item -Path '<found-path>' -Destination '<usb-path>'"
→ Step 5: Confirm success to user

User: "Why is my computer slow?"
→ Step 1: execute_command with "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10"
→ Step 2: execute_command with "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10"
→ Step 3: execute_command with "(Get-WmiObject Win32_OperatingSystem).FreePhysicalMemory"
→ Step 4: Analyze all results and provide comprehensive diagnosis with recommendations

## IMPORTANT RULES

- **ALWAYS use tools when asked to perform actions** - don't just describe what you would do
- **Keep going until the task is DONE** - one tool call is rarely enough
- Explain what each command does BEFORE calling execute_command
- If a command fails, immediately try an alternative approach
- Save successful solutions to memory for future reference`;

/**
 * Stream a chat response from the AI provider
 */
export async function streamChat(
  options: StreamChatOptions,
): Promise<StreamChatResult> {
  const { messages, settings, tools, abortSignal } = options;

  let { systemPrompt } = options;
  if (!systemPrompt)
    systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Fetch dynamic context (Agent Zero capabilities)
  try {
    const [behaviors, instruments] = await Promise.all([
      // Get latest behavior instruction
      invoke<Array<{ content: string }>>("search_memories", {
        query: "",
        memory_type: "behavior",
        limit: 1,
      }).catch(() => []),
      // Get available instruments
      invoke<Array<{ name: string; description: string; extension: string }>>(
        "list_instruments",
      ).catch(() => []),
    ]);

    let dynamicContext = "";

    // 1. Inject Behavior
    if (behaviors && behaviors.length > 0) {
      dynamicContext += `\n\n## CURRENT BEHAVIOR MODE (Override)\n${behaviors[0].content}\n`;
    }

    // 2. Inject Instruments
    if (instruments && instruments.length > 0) {
      dynamicContext += `\n\n## AVAILABLE CUSTOM INSTRUMENTS\nYou can use these special tools by name using 'run_instrument' or 'execute_command':\n`;
      instruments.forEach((i) => {
        dynamicContext += `- **${i.name}** (.${i.extension}): ${i.description}\n`;
      });
    }

    if (dynamicContext) {
      systemPrompt = (systemPrompt || DEFAULT_SYSTEM_PROMPT) + dynamicContext;
    }
  } catch (error) {
    console.warn("Failed to load dynamic agent context:", error);
  }

  const model = createProviderModel(settings);

  // Sanitize messages to ensure compatible format:
  // SDK streams tool-results with input/output but expects result/isError when consuming
  const sanitizedMessages = sanitizeMessagesForSDK(messages);

  const result = streamText({
    model,
    system: systemPrompt,
    messages: sanitizedMessages,
    // Only pass tools if there are any defined - some models don't support tools
    ...(tools && Object.keys(tools).length > 0 ? { tools } : {}),
    // Enable multi-step tool calling - stop after 15 steps max
    // This allows the model to call tools, get results, and continue generating
    stopWhen: stepCountIs(15),
    abortSignal,
  });

  return {
    textStream: result.textStream,
    fullStream: result.fullStream,
    fullText: result.text,
  };
}

/**
 * Sanitize messages for SDK compatibility
 * The SDK now uses ModelMessage format with ToolResultPart requiring 'output' field
 * with LanguageModelV2ToolResultOutput structure
 */
function sanitizeMessagesForSDK(messages: CoreMessage[]): CoreMessage[] {
  return messages.map((msg) => {
    if (msg.role === "tool" && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part: any) => {
          if (part.type === "tool-result") {
            // Extract the raw result value
            const rawOutput = part.output ?? part.result;
            let resultValue: string;
            let isError = false;

            if (rawOutput && typeof rawOutput === "object") {
              // Check for error status or isError flag
              isError = part.isError ?? rawOutput.status === "error" ?? false;

              if ("output" in rawOutput) {
                // Unwrap { status, output } format
                resultValue =
                  typeof rawOutput.output === "string"
                    ? rawOutput.output
                    : JSON.stringify(rawOutput.output);
              } else if ("error" in rawOutput) {
                resultValue =
                  typeof rawOutput.error === "string"
                    ? rawOutput.error
                    : JSON.stringify(rawOutput.error);
                isError = true;
              } else {
                resultValue = JSON.stringify(rawOutput);
              }
            } else {
              resultValue = String(rawOutput ?? "");
            }

            // Return in ModelMessage ToolResultPart format with LanguageModelV2ToolResultOutput
            return {
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: isError
                ? { type: "error-text" as const, value: resultValue }
                : { type: "text" as const, value: resultValue },
            };
          }
          return part;
        }),
      };
    }
    return msg;
  });
}

/**
 * Convert local message format to CoreMessage format
 */
export function convertToCoreMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): CoreMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}
