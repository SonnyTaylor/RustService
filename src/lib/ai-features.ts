/**
 * AI Features Utility Module
 *
 * Shared AI generation functions for targeted single-purpose AI features
 * spread across the app. Uses the Vercel AI SDK with the user's configured
 * provider from Settings → AI Agent.
 *
 * Features:
 * - Programs Page: AI-powered semantic search
 * - Scripts Page: AI script generation
 * - Service Report: AI summary generation
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { createProviderModel } from '@/lib/agent-chat';
import type { AgentSettings } from '@/types/agent';
import type { Program } from '@/types/programs';
import type { ServiceReport, ServiceDefinition } from '@/types/service';

// =============================================================================
// Configuration Check
// =============================================================================

/**
 * Check if AI is configured with a valid provider and API key.
 * Ollama doesn't require an API key.
 */
export function isAiConfigured(settings: AgentSettings): boolean {
  if (!settings.provider || !settings.model) return false;
  if (settings.provider === 'ollama') return true;
  const key = settings.apiKeys?.[settings.provider as keyof typeof settings.apiKeys];
  return !!key && key.length > 0;
}

// =============================================================================
// Programs AI Search
// =============================================================================

export interface AiSearchResult {
  programId: string;
  reason: string;
  relevance: number;
}

/**
 * Use AI to find the best program(s) matching a natural language query.
 * Returns ranked results with relevance scores and explanations.
 */
export async function aiSearchPrograms(
  programs: Program[],
  query: string,
  settings: AgentSettings,
  abortSignal?: AbortSignal
): Promise<AiSearchResult[]> {
  if (!isAiConfigured(settings)) {
    throw new Error('AI not configured. Set up a provider in Settings → AI Agent.');
  }
  if (programs.length === 0) {
    return [];
  }

  const model = createProviderModel(settings);

  const programList = programs
    .map((p) => `- ID: "${p.id}" | Name: "${p.name}" | Description: "${p.description}"`)
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: z.object({
      results: z.array(
        z.object({
          programId: z.string().describe('The exact ID of the matching program'),
          reason: z.string().describe('Brief explanation of why this program matches (1-2 sentences)'),
          relevance: z.number().min(0).max(100).describe('Relevance score 0-100'),
        })
      ),
    }),
    system: `You are a computer repair technician's assistant. Given a list of portable programs/tools and a user's need, pick the most relevant program(s).

Rules:
- Only return programs that genuinely match the user's need
- Order by relevance (best match first)
- Relevance score: 90-100 = perfect match, 70-89 = good match, 50-69 = partial match, below 50 = don't include
- Only include programs with relevance >= 50
- If no programs match, return an empty results array
- Keep reasons concise and practical`,
    prompt: `Available programs:\n${programList}\n\nUser needs: "${query}"`,
    abortSignal,
  });

  return object?.results ?? [];
}

// =============================================================================
// Scripts AI Writer
// =============================================================================

export interface AiGeneratedScript {
  name: string;
  description: string;
  content: string;
  runAsAdmin: boolean;
}

/**
 * Use AI to generate a PowerShell or CMD script based on a natural language description.
 */
export async function aiGenerateScript(
  prompt: string,
  scriptType: 'powershell' | 'cmd',
  settings: AgentSettings,
  abortSignal?: AbortSignal
): Promise<AiGeneratedScript> {
  if (!isAiConfigured(settings)) {
    throw new Error('AI not configured. Set up a provider in Settings → AI Agent.');
  }

  const model = createProviderModel(settings);

  const { object } = await generateObject({
    model,
    schema: z.object({
      name: z.string().describe('Short descriptive name for the script (3-6 words)'),
      description: z.string().describe('Brief description of what the script does (1-2 sentences)'),
      content: z.string().describe('The complete script content, ready to run'),
      runAsAdmin: z.boolean().describe('Whether this script requires administrator privileges'),
    }),
    system: `You are an expert Windows systems administrator and computer repair technician. Generate ${scriptType === 'powershell' ? 'PowerShell' : 'CMD/Batch'} scripts for Windows 10/11.

Rules:
- Write clean, well-commented scripts
- Include error handling where appropriate
- Use best practices for ${scriptType === 'powershell' ? 'PowerShell' : 'CMD/Batch'} scripting
- Set runAsAdmin to true only if the script genuinely needs elevated privileges (e.g., modifying system files, services, registry HKLM)
- The script should be complete and ready to execute
- Do NOT wrap the script content in markdown code fences
- Focus on practical, safe operations for computer repair/maintenance`,
    prompt: `Write a ${scriptType === 'powershell' ? 'PowerShell' : 'CMD/Batch'} script that: ${prompt}`,
    abortSignal,
  });

  if (!object) {
    throw new Error('AI failed to generate a script. Please try again.');
  }

  return object;
}

// =============================================================================
// Service Report AI Summarizer
// =============================================================================

export interface AiReportSummary {
  summary: string;
  healthScore: number;
}

/**
 * Use AI to generate an executive summary and health score for a service report.
 */
export async function aiSummarizeReport(
  report: ServiceReport,
  definitions: ServiceDefinition[],
  settings: AgentSettings,
  abortSignal?: AbortSignal
): Promise<AiReportSummary> {
  if (!isAiConfigured(settings)) {
    throw new Error('AI not configured. Set up a provider in Settings → AI Agent.');
  }

  const model = createProviderModel(settings);
  const defMap = new Map(definitions.map((d) => [d.id, d]));

  // Build a structured report context for the AI
  const totalServices = report.results.length;
  const passed = report.results.filter((r) => r.success).length;
  const failed = totalServices - passed;
  const totalDuration = report.totalDurationMs
    ? (report.totalDurationMs / 1000).toFixed(1)
    : 'unknown';

  const serviceDetails = report.results
    .map((result) => {
      const def = defMap.get(result.serviceId);
      const serviceName = def?.name || result.serviceId;
      const status = result.success ? 'PASSED' : 'FAILED';
      const findings = result.findings
        .map((f) => `  [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`)
        .join('\n');
      const error = result.error ? `  Error: ${result.error}` : '';
      return `${serviceName} (${status}, ${(result.durationMs / 1000).toFixed(1)}s):\n${findings}${error}`;
    })
    .join('\n\n');

  const { object } = await generateObject({
    model,
    schema: z.object({
      summary: z
        .string()
        .describe(
          'Executive summary of the service report (3-6 sentences). Highlight key findings, issues found, and overall system health. Be practical and actionable.'
        ),
      healthScore: z
        .number()
        .min(0)
        .max(100)
        .describe(
          'Overall system health score 0-100. 90-100=excellent, 70-89=good, 50-69=fair (some issues), 30-49=poor (significant issues), 0-29=critical'
        ),
    }),
    system: `You are a computer repair technician's AI assistant. Analyze service report results and provide a brief executive summary with an overall health score.

Rules:
- Be concise and practical — this is for a technician, not a customer
- Highlight the most important findings (critical/error/warning severity)
- Mention what passed and what needs attention
- The health score should reflect the overall state: deduct points for errors, warnings, and failures
- If all services passed with no warnings, score should be 85-100
- If there are warnings but no errors, score should be 60-85
- If there are errors or failures, score should be lower accordingly
- Format the summary as plain text paragraphs, no markdown`,
    prompt: `Service Report Summary:
- Services: ${totalServices} total, ${passed} passed, ${failed} failed
- Duration: ${totalDuration}s
- Parallel Mode: ${report.parallelMode ? 'Yes' : 'No'}

Detailed Results:
${serviceDetails}`,
    abortSignal,
  });

  if (!object) {
    throw new Error('AI failed to generate a summary. Please try again.');
  }

  return object;
}
