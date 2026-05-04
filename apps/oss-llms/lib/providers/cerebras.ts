import type { ModelEntry } from '../types';
import { inferFamily, inferParams } from '../utils';

interface CerebrasModel {
  id: string;
  object?: string;
  context_window?: number;
}

export async function fetchCerebras(): Promise<ModelEntry[]> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const { data }: { data: CerebrasModel[] } = await res.json();

    return data.map(m => ({
      modelId: `cerebras/${m.id}`,
      modelName: m.id.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      family: inferFamily(m.id),
      params: inferParams(m.id),
      providerId: 'cerebras',
      providerModelId: m.id,
      inputPrice: null,
      outputPrice: null,
      freeTier: false,
      contextLength: m.context_window ?? null,
      rpm: null,
      tpm: null,
      rpd: null,
      quantization: null,
      source: 'direct' as const,
    }));
  } catch {
    return [];
  }
}
