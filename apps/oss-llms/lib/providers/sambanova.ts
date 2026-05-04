import type { ModelEntry } from '../types';
import { inferFamily, inferParams, isOssModel } from '../utils';

interface SambanovaModel {
  id: string;
  object?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;      // USD per token
    completion?: string;  // USD per token
  };
}

export async function fetchSambanova(): Promise<ModelEntry[]> {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.sambanova.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const { data }: { data: SambanovaModel[] } = await res.json();

    return data
      .filter(m => isOssModel(m.id))
      .map(m => {
        const inputPrice = m.pricing?.prompt != null ? parseFloat(m.pricing.prompt) * 1_000_000 : null;
        const outputPrice = m.pricing?.completion != null ? parseFloat(m.pricing.completion) * 1_000_000 : null;
        return {
          modelId: `sambanova/${m.id}`,
          modelName: m.id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          family: inferFamily(m.id),
          params: inferParams(m.id),
          providerId: 'sambanova',
          providerModelId: m.id,
          inputPrice,
          outputPrice,
          freeTier: false,
          contextLength: m.context_length ?? null,
          rpm: null,
          tpm: null,
          rpd: null,
          quantization: null,
          source: 'direct' as const,
        };
      });
  } catch {
    return [];
  }
}
