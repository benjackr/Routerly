import OpenAI from 'openai';

export interface DiscoveredModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface DiscoverResult {
  success: boolean;
  models: DiscoveredModel[];
  error?: string;
}

/**
 * Discover models from any OpenAI-compatible /v1/models endpoint.
 * Uses raw fetch for maximum compatibility — no SDK assumptions.
 */
export async function discoverModels(
  endpoint: string,
  apiKey?: string,
): Promise<DiscoverResult> {
  const baseUrl = endpoint.endsWith('/') ? endpoint : endpoint + '/';
  const modelsUrl = `${baseUrl}v1/models`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        success: false,
        models: [],
        error: `Provider returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const body = await res.json() as { data?: DiscoveredModel[]; object?: string };
    const models = body.data ?? [];

    return { success: true, models };
  } catch (err) {
    return {
      success: false,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if an OpenAI-compatible endpoint is reachable and returns valid models.
 * Returns the first 3 model IDs as a sample for UI preview.
 */
export async function probeEndpoint(
  endpoint: string,
  apiKey?: string,
): Promise<{ ok: boolean; sample?: string[]; error?: string }> {
  const result = await discoverModels(endpoint, apiKey);
  if (!result.success) {
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    sample: result.models.slice(0, 3).map(m => m.id),
  };
}
