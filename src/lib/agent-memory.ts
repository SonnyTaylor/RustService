import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { invoke } from '@tauri-apps/api/core';

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
