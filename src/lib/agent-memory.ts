import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { invoke } from '@tauri-apps/api/core';
import type { Memory, MemoryMetadata, MemoryScope, AgentSettings } from '@/types/agent';
import { getDefaultScopeForType } from '@/types/agent';

// =============================================================================
// Machine Identification
// =============================================================================

/**
 * Get the current machine's identifier
 * Used to distinguish machine-specific memories
 */
export async function getCurrentMachineId(): Promise<string> {
  try {
    return await invoke<string>('get_machine_id');
  } catch (error) {
    console.error('Failed to get machine ID:', error);
    return 'unknown';
  }
}

// =============================================================================
// Embedding Generation
// =============================================================================

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // 1. Get Settings
    const settings = await invoke<{ 
      agent: { 
        embeddingProvider: string; 
        openaiApiKey?: string;
        ollamaUrl?: string;
        embeddingModel?: string;
      } 
    }>('get_settings');

    const providerName = settings.agent.embeddingProvider || 'openai';
    
    // Default config
    let apiKey = settings.agent.openaiApiKey || '';
    let baseURL = undefined;
    let modelName = settings.agent.embeddingModel || 'text-embedding-3-small';

    if (providerName === 'ollama') {
        apiKey = 'ollama'; // Dummy key for local ollama
        baseURL = settings.agent.ollamaUrl || 'http://localhost:11434/api'; 
        // Note: OpenAI provider with Ollama might need /v1 suffix depending on setup, 
        // ensuring standard compatibility.
        if (!baseURL.endsWith('/v1')) {
             baseURL = `${baseURL.replace(/\/api$/, '')}/v1`;
        }
        modelName = settings.agent.embeddingModel || 'nomic-embed-text';
    }

    const openai = createOpenAI({
        apiKey,
        baseURL,
    });
    
    const model = openai.embedding(modelName);

    // 2. Generate Embedding
    const { embedding } = await embed({
      model,
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return []; // Return empty or throw? Return empty for graceful degradation to keyword search
  }
}

// =============================================================================
// Auto-Solution Memorization
// =============================================================================

export interface SolutionData {
  /** The problem/issue that was fixed */
  problem: string;
  /** The command or action that fixed it */
  solution: string;
  /** Exit code of the successful command */
  exitCode: number;
  /** Command output */
  output?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Source conversation ID */
  conversationId?: string;
}

/**
 * Save a successful solution to memory
 * Called when a command successfully fixes a problem (exit code 0)
 * 
 * Solutions are saved with GLOBAL scope - they are portable across machines
 * because a fix that works on one Windows machine usually works on others.
 */
export async function saveSolution(data: SolutionData): Promise<Memory | null> {
  try {
    // Check if auto-solution is enabled
    const settings = await invoke<{ agent: AgentSettings }>('get_settings');
    if (!settings.agent.autoMemorySolutions) {
      console.log('Auto-solution memorization is disabled');
      return null;
    }

    // Format the solution content
    const content = formatSolutionContent(data);
    
    // Generate embedding for vector search
    const embedding = await generateEmbedding(content);

    // Create metadata
    const metadata: MemoryMetadata = {
      problem: data.problem,
      solutionCommand: data.solution,
      tags: data.tags || [],
      source: 'auto-solution',
    };

    // Save to memory with high importance (solutions are valuable)
    // Use GLOBAL scope - solutions are portable across machines
    const memory = await invoke<Memory>('save_memory', {
      memory_type: 'solution',
      content,
      metadata,
      embedding: embedding.length > 0 ? embedding : undefined,
      importance: 80, // Solutions are important
      source_conversation_id: data.conversationId,
      scope: 'global', // Solutions are portable - they work on other machines too
    });

    console.log('Auto-saved solution to memory (global scope):', memory.id);
    return memory;
  } catch (error) {
    console.error('Failed to auto-save solution:', error);
    return null;
  }
}

/**
 * Format solution content for storage and retrieval
 */
function formatSolutionContent(data: SolutionData): string {
  let content = `Problem: ${data.problem}\n\nSolution: ${data.solution}`;
  
  if (data.output) {
    // Truncate long outputs
    const truncatedOutput = data.output.length > 500 
      ? data.output.substring(0, 500) + '...(truncated)'
      : data.output;
    content += `\n\nResult: ${truncatedOutput}`;
  }
  
  return content;
}

// =============================================================================
// System State Learning
// =============================================================================

export interface SystemStateData {
  /** Type of system info (network, hardware, software, etc.) */
  category: string;
  /** The actual system information */
  info: string;
  /** Command that retrieved this info */
  command?: string;
  /** Source conversation ID */
  conversationId?: string;
}

/**
 * Save system state information to memory
 * Called when agent runs system info commands (systeminfo, ipconfig, etc.)
 * 
 * System state is saved with MACHINE scope - it's specific to the current computer
 * and won't be recalled when running on a different machine.
 */
export async function saveSystemState(data: SystemStateData): Promise<Memory | null> {
  try {
    const machineId = await getCurrentMachineId();
    const content = `[${data.category.toUpperCase()}] (${machineId})\n${data.info}`;
    
    const embedding = await generateEmbedding(content);

    const metadata: MemoryMetadata = {
      source: 'system-info',
      tags: ['system', data.category.toLowerCase()],
    };

    if (data.command) {
      metadata.solutionCommand = data.command;
    }

    // Use MACHINE scope - system info is specific to this computer
    const memory = await invoke<Memory>('save_memory', {
      memory_type: 'system',
      content,
      metadata,
      embedding: embedding.length > 0 ? embedding : undefined,
      importance: 60, // System state is moderately important
      source_conversation_id: data.conversationId,
      scope: 'machine', // System info is machine-specific
    });

    console.log('Saved system state to memory (machine scope):', memory.id);
    return memory;
  } catch (error) {
    console.error('Failed to save system state:', error);
    return null;
  }
}

// =============================================================================
// Knowledge Base Helpers
// =============================================================================

/**
 * Get relevant knowledge from memory based on query
 */
export async function getRelevantKnowledge(
  query: string,
  limit: number = 5
): Promise<Memory[]> {
  try {
    const embedding = await generateEmbedding(query);
    
    if (embedding.length > 0) {
      // Use vector search for semantic matching
      const memories = await invoke<Memory[]>('search_memories_vector', {
        embedding,
        memory_type: 'knowledge',
        limit,
      });
      
      // Increment access count for retrieved memories
      for (const memory of memories) {
        await invoke('increment_memory_access', { memory_id: memory.id });
      }
      
      return memories;
    } else {
      // Fallback to keyword search
      return await invoke<Memory[]>('search_memories', {
        query,
        memory_type: 'knowledge',
        limit,
      });
    }
  } catch (error) {
    console.error('Failed to get relevant knowledge:', error);
    return [];
  }
}

/**
 * Get relevant memories of any type for context enrichment
 */
export async function getRelevantContext(
  query: string,
  types?: string[],
  limit: number = 5
): Promise<Memory[]> {
  try {
    const embedding = await generateEmbedding(query);
    
    if (embedding.length > 0) {
      // Use vector search
      let memories = await invoke<Memory[]>('search_memories_vector', {
        embedding,
        limit: limit * 2, // Get more then filter
      });
      
      // Filter by types if specified
      if (types && types.length > 0) {
        memories = memories.filter(m => types.includes(m.type));
      }
      
      // Increment access count for retrieved memories
      for (const memory of memories.slice(0, limit)) {
        await invoke('increment_memory_access', { memory_id: memory.id });
      }
      
      return memories.slice(0, limit);
    } else {
      return await invoke<Memory[]>('search_memories', {
        query,
        limit,
      });
    }
  } catch (error) {
    console.error('Failed to get relevant context:', error);
    return [];
  }
}

// =============================================================================
// Behavior Memory Helpers
// =============================================================================

/**
 * Get all active behavior rules
 */
export async function getActiveBehaviors(): Promise<Memory[]> {
  try {
    const memories = await invoke<Memory[]>('get_all_memories', {
      memory_type: 'behavior',
      limit: 50,
    });
    
    return memories;
  } catch (error) {
    console.error('Failed to get behaviors:', error);
    return [];
  }
}

/**
 * Save a behavior adjustment
 * 
 * Behaviors are saved with GLOBAL scope - they represent the technician's
 * preferences and should apply across all machines.
 */
export async function saveBehavior(
  rule: string,
  reason: string,
  conversationId?: string
): Promise<Memory | null> {
  try {
    const content = `Rule: ${rule}\nReason: ${reason}`;
    
    const embedding = await generateEmbedding(content);

    // Use GLOBAL scope - behaviors are technician preferences, portable across machines
    const memory = await invoke<Memory>('save_memory', {
      memory_type: 'behavior',
      content,
      metadata: {
        rule,
        reason,
        source: 'agent-adjustment',
      },
      embedding: embedding.length > 0 ? embedding : undefined,
      importance: 90, // Behavior rules are very important
      source_conversation_id: conversationId,
      scope: 'global', // Behaviors are portable - technician preferences
    });

    console.log('Saved behavior rule (global scope):', memory.id);
    return memory;
  } catch (error) {
    console.error('Failed to save behavior:', error);
    return null;
  }
}

// =============================================================================
// Fact Extraction
// =============================================================================

export interface ExtractedFact {
  fact: string;
  category: string;
  importance: number;
}

/**
 * Save extracted facts from a conversation
 * Called when facts are identified in user messages
 * 
 * Facts are saved with GLOBAL scope by default - they typically represent
 * technician preferences and general knowledge that applies across machines.
 */
export async function saveExtractedFacts(
  facts: ExtractedFact[],
  conversationId?: string
): Promise<Memory[]> {
  const savedMemories: Memory[] = [];
  
  try {
    // Check if auto-fact extraction is enabled
    const settings = await invoke<{ agent: AgentSettings }>('get_settings');
    if (!settings.agent.autoExtractFacts) {
      console.log('Auto-fact extraction is disabled');
      return savedMemories;
    }

    for (const fact of facts) {
      try {
        // Check for duplicates using semantic search
        const embedding = await generateEmbedding(fact.fact);
        
        if (embedding.length > 0) {
          const existingFacts = await invoke<Memory[]>('search_memories_vector', {
            embedding,
            memory_type: 'fact',
            limit: 3,
          });
          
          // Check if very similar fact already exists (similarity > 0.9 is considered duplicate)
          // We can't easily get similarity scores from the backend, so we'll check content similarity
          const isDuplicate = existingFacts.some(existing => {
            const similarity = calculateTextSimilarity(existing.content.toLowerCase(), fact.fact.toLowerCase());
            return similarity > 0.8;
          });
          
          if (isDuplicate) {
            console.log('Skipping duplicate fact:', fact.fact.substring(0, 50));
            continue;
          }
        }

        // Use GLOBAL scope - facts are typically about the technician or general knowledge
        const memory = await invoke<Memory>('save_memory', {
          memory_type: 'fact',
          content: fact.fact,
          metadata: {
            category: fact.category,
            source: 'fact-extraction',
            tags: [fact.category],
          },
          embedding: embedding.length > 0 ? embedding : undefined,
          importance: fact.importance,
          source_conversation_id: conversationId,
          scope: 'global', // Facts are typically portable (technician preferences)
        });

        savedMemories.push(memory);
        console.log('Saved extracted fact (global scope):', memory.id);
      } catch (error) {
        console.error('Failed to save fact:', error);
      }
    }
  } catch (error) {
    console.error('Failed to save extracted facts:', error);
  }
  
  return savedMemories;
}

/**
 * Simple text similarity calculation (Jaccard similarity on words)
 * Used for duplicate detection
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Save a conversation fragment
 * Stores key context from a conversation for future reference
 * 
 * Conversation fragments are saved with MACHINE scope - they're about
 * the current machine being worked on.
 */
export async function saveConversationFragment(
  content: string,
  conversationId: string,
  importance: number = 50
): Promise<Memory | null> {
  try {
    const embedding = await generateEmbedding(content);

    // Use MACHINE scope - conversation context is typically machine-specific
    const memory = await invoke<Memory>('save_memory', {
      memory_type: 'conversation',
      content,
      metadata: {
        source: 'conversation-fragment',
      },
      embedding: embedding.length > 0 ? embedding : undefined,
      importance,
      source_conversation_id: conversationId,
      scope: 'machine', // Conversation context is machine-specific
    });

    console.log('Saved conversation fragment (machine scope):', memory.id);
    return memory;
  } catch (error) {
    console.error('Failed to save conversation fragment:', error);
    return null;
  }
}

// =============================================================================
// Conversation Summarization
// =============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SummarizationResult {
  summary: string;
  keyPoints: string[];
  messageRange: { start: number; end: number };
}

/**
 * Save a conversation summary to memory
 * 
 * Summaries are saved with MACHINE scope - they summarize conversations
 * about the current machine being worked on.
 */
export async function saveConversationSummary(
  summary: string,
  conversationId: string,
  messageRange: { start: number; end: number }
): Promise<Memory | null> {
  try {
    const embedding = await generateEmbedding(summary);

    // Use MACHINE scope - summaries are about conversations on this machine
    const memory = await invoke<Memory>('save_memory', {
      memory_type: 'summary',
      content: summary,
      metadata: {
        summarizedConversationId: conversationId,
        messageRange,
        source: 'context-compression',
      },
      embedding: embedding.length > 0 ? embedding : undefined,
      importance: 70, // Summaries are important for context
      source_conversation_id: conversationId,
      scope: 'machine', // Summaries are machine-specific
    });

    console.log('Saved conversation summary (machine scope):', memory.id);
    return memory;
  } catch (error) {
    console.error('Failed to save conversation summary:', error);
    return null;
  }
}

/**
 * Get existing summaries for a conversation
 */
export async function getConversationSummaries(
  conversationId: string
): Promise<Memory[]> {
  try {
    const allSummaries = await invoke<Memory[]>('get_all_memories', {
      memory_type: 'summary',
      limit: 50,
    });
    
    return allSummaries.filter(
      s => s.metadata?.summarizedConversationId === conversationId
    );
  } catch (error) {
    console.error('Failed to get conversation summaries:', error);
    return [];
  }
}

/**
 * Check if context compression is needed based on message count
 */
export async function shouldCompressContext(
  messageCount: number
): Promise<{ shouldCompress: boolean; threshold: number }> {
  try {
    const settings = await invoke<{ agent: AgentSettings }>('get_settings');
    const threshold = settings.agent.contextCompressionThreshold || 20;
    const enabled = settings.agent.contextCompressionEnabled || false;
    
    return {
      shouldCompress: enabled && messageCount > threshold,
      threshold,
    };
  } catch (error) {
    console.error('Failed to check compression settings:', error);
    return { shouldCompress: false, threshold: 20 };
  }
}

/**
 * Format messages for summarization prompt
 */
export function formatMessagesForSummary(messages: ConversationMessage[]): string {
  return messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

/**
 * Create a summarization prompt
 */
export function createSummarizationPrompt(messages: ConversationMessage[]): string {
  const formattedMessages = formatMessagesForSummary(messages);
  
  return `Please summarize the following conversation, focusing on:
1. The main topics discussed
2. Any problems identified and solutions provided
3. Key decisions or conclusions
4. Any important facts or preferences mentioned

Keep the summary concise but comprehensive. Focus on information that would be useful for continuing the conversation later.

CONVERSATION:
${formattedMessages}

SUMMARY:`;
}

/**
 * Build context with compressed history
 * Returns recent messages plus summaries of older messages
 */
export async function buildCompressedContext(
  allMessages: ConversationMessage[],
  conversationId: string,
  keepRecentCount: number = 10
): Promise<{
  recentMessages: ConversationMessage[];
  summaries: Memory[];
  compressedMessageCount: number;
}> {
  const recentMessages = allMessages.slice(-keepRecentCount);
  const olderMessageCount = Math.max(0, allMessages.length - keepRecentCount);
  
  // Get existing summaries for this conversation
  const summaries = await getConversationSummaries(conversationId);
  
  return {
    recentMessages,
    summaries,
    compressedMessageCount: olderMessageCount,
  };
}

/**
 * Get context injection content for the system prompt
 * Combines relevant memories, behaviors, and summaries
 */
export async function getContextInjection(
  currentMessage: string,
  conversationId?: string
): Promise<string> {
  const parts: string[] = [];
  
  try {
    // Get relevant memories
    const relevantMemories = await getRelevantContext(currentMessage, undefined, 5);
    if (relevantMemories.length > 0) {
      parts.push('## Relevant Memories\n');
      relevantMemories.forEach(m => {
        parts.push(`- [${m.type}] ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`);
      });
      parts.push('');
    }
    
    // Get active behaviors
    const behaviors = await getActiveBehaviors();
    if (behaviors.length > 0) {
      parts.push('## Behavioral Guidelines\n');
      behaviors.forEach(b => {
        parts.push(`- ${b.content}`);
      });
      parts.push('');
    }
    
    // Get conversation summaries if we have a conversation ID
    if (conversationId) {
      const summaries = await getConversationSummaries(conversationId);
      if (summaries.length > 0) {
        parts.push('## Previous Conversation Summary\n');
        // Use the most recent summary
        const latestSummary = summaries[0];
        parts.push(latestSummary.content);
        parts.push('');
      }
    }
  } catch (error) {
    console.error('Failed to get context injection:', error);
  }
  
  return parts.join('\n');
}
