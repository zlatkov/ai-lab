import type { ModelEntry } from '../types';
import { inferFamily, inferParams } from '../utils';

// Free tier rate limits (requests/tokens per day for most models)
const GROQ_FREE_RPD = 14400;
const GROQ_FREE_RPM = 30;
const GROQ_FREE_TPM = 6000;

interface GroqModel {
  id: string;
  object: string;
  owned_by: string;
  context_window?: number;
  active?: boolean;
}

export async function fetchGroq(): Promise<ModelEntry[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const { data }: { data: GroqModel[] } = await res.json();

    return data
      .filter(m => m.active !== false && m.object === 'model')
      .map(m => ({
        modelId: `groq/${m.id}`,
        modelName: formatGroqName(m.id),
        family: inferFamily(m.id),
        params: inferParams(m.id),
        providerId: 'groq',
        providerModelId: m.id,
        inputPrice: null,
        outputPrice: null,
        freeTier: true,
        contextLength: m.context_window ?? null,
        rpm: GROQ_FREE_RPM,
        tpm: GROQ_FREE_TPM,
        rpd: GROQ_FREE_RPD,
        quantization: null,
        source: 'direct' as const,
      }));
  } catch {
    return [];
  }
}

function formatGroqName(id: string): string {
  return id
    .split(/[-/]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\b(\d+)\b/g, '$1');
}
