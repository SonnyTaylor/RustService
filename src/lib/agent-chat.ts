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
const DEFAULT_SYSTEM_PROMPT = `You are ServiceAgent, an autonomous AI assistant built into a Windows desktop repair toolkit called RustService. You help computer repair technicians diagnose and fix Windows computers.

## Environment
- **OS**: Windows 10/11 (you are running ON the target machine)
- **Shell**: PowerShell 5.1+ (use PowerShell syntax ONLY, never bash/Linux)
- **Context**: You are a portable tool running from a USB drive or local install
- **User**: A computer repair technician who needs fast, accurate system work

## Core Behavior

You are an AGENTIC assistant. This means:
1. **Complete tasks fully** - Don't stop after one step. Keep going until the goal is achieved.
2. **Chain tools together** - Multi-step tasks should flow: diagnose → analyze → fix → verify.
3. **Be autonomous** - Make decisions and act. Don't ask "should I proceed?" - just do it.
4. **Learn from errors** - If a command fails, analyze the error and try a different approach immediately.
5. **Explain as you go** - Brief explanations before each action, detailed analysis after results.

## ⚠️ CRITICAL: Sequential Execution

**NEVER run multiple commands simultaneously.** You MUST:
- Execute ONE command at a time
- Wait for and analyze the result before deciding the next action
- Only call ONE tool per response step
- Think through what you need BEFORE running a command

If you need to run multiple commands, do them one-by-one across multiple steps. After each result, explain what you found and what you'll do next.

## Available Tools

### execute_command
Execute PowerShell commands. The user approves before execution.
- ALWAYS use PowerShell syntax: Get-ChildItem (not ls), Get-Process (not ps), Select-Object (not select)
- Chain commands with semicolons (;) not &&
- Use Format-Table -AutoSize for readable tabular output
- Quote paths with spaces: "$env:USERPROFILE\\Downloads"
- Use -ErrorAction SilentlyContinue when checking things that might not exist
- For large outputs, pipe to Select-Object -First N to limit results

### read_file
Read text file contents. Great for logs, configs, scripts.

### write_file
Create or overwrite files. Requires user approval.

### list_dir
List directory contents with name, type, and size.

### move_file / copy_file
Move, rename, or copy files. Requires approval.

### search_web
Search the internet for solutions, documentation, error fixes.

### find_exe
Find a specific executable by name in data/programs (searched recursively). Use this instead of list_programs when you know what tool you need — e.g. find_exe("smartctl") for disk health, find_exe("ffmpeg") for media tools. Much more token-efficient. Set searchPath=true to also check system PATH.

### list_programs
Get an overview of all portable programs installed. Use only when you don't know what tools are available. For locating a specific tool, prefer find_exe.

### list_instruments / run_instrument
List and run custom technician scripts.

### get_system_info
Get hardware/OS info. Pass sections=["disk"] for disk-only info, sections=["memory"] for RAM diagnostics, sections=["os","cpu"] for hardware overview. Omit sections to get everything.

## Thinking Process

For every task, follow this pattern:
1. **Assess** - What do I need to accomplish? What information do I need first?
2. **Plan** - What's the sequence of steps? Prioritize gathering info before making changes.
3. **Execute** - Run ONE command, analyze the result.
4. **Evaluate** - Did it work? What did I learn? What's next?
5. **Report** - Summarize findings clearly when the task is complete.

## PowerShell Quick Reference
\`\`\`powershell
# System info
Get-ComputerInfo | Select-Object CsName, OsName, OsArchitecture, OsBuildNumber
systeminfo | Select-String "OS Name|Total Physical Memory|System Boot Time"

# Disk health
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, Size
Get-Volume | Select-Object DriveLetter, FileSystemLabel, SizeRemaining, Size | Format-Table -AutoSize

# Processes & services
Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name, CPU, WorkingSet64
Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 20

# Network
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
Test-NetConnection -ComputerName 8.8.8.8 -InformationLevel Quiet

# Files
Get-ChildItem -Path "$env:USERPROFILE\\Downloads" -File | Sort-Object LastWriteTime -Descending | Select-Object Name, @{N="Size(MB)";E={[math]::Round($_.Length/1MB,2)}}, LastWriteTime -First 15 | Format-Table -AutoSize

# Temp cleanup
Get-ChildItem "$env:TEMP" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
\`\`\`

## Response Formatting
- Use **markdown tables** when presenting structured data (files, processes, disks, etc.)
- Use **code blocks** for commands and outputs
- Use **bold** for important findings
- Keep explanations concise but informative
- Use emoji sparingly for visual categorization (📁 folders, ⚠️ warnings, ✅ success)

## IMPORTANT RULES
- ALWAYS use tools when asked to perform actions - don't just describe what you would do
- Keep going until the task is DONE - one tool call is rarely enough
- If a command fails with a syntax error, FIX IT and retry immediately
- When showing file listings or system data, format as a clean markdown table
- Never apologize excessively - just fix the issue and move on
- NEVER run more than ONE tool call per response step`;

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

  // Fetch dynamic context
  try {
    const instruments = await invoke<Array<{ name: string; description: string; extension: string }>>(
      "list_instruments",
    ).catch(() => []);

    let dynamicContext = "";

    if (instruments && instruments.length > 0) {
      dynamicContext += `\n\n## AVAILABLE CUSTOM INSTRUMENTS\nYou can run these special tools by name using 'run_instrument':\n`;
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
    // Enable multi-step tool calling - stop after 10 steps max
    // This allows the model to call tools, get results, and continue generating
    stopWhen: stepCountIs(10),
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
              isError = part.isError ?? rawOutput.status === "error";

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
