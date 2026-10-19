/**
 * Claude through Replit AI Integrations.
 *
 * On Replit, the platform's Anthropic connection sets
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY
 * (Replit authenticates and bills the call against the workspace's credits).
 * No Anthropic key of our own is stored anywhere. Should the platform expose
 * the connection under the SDK's standard names instead (ANTHROPIC_BASE_URL /
 * ANTHROPIC_API_KEY), those are honoured too. Without any connection the
 * Claude steps fall back to offline answers and the UI says so.
 *
 * Model: the first of MODELS that the connection accepts. If a model is not
 * offered, the next one is tried and the working one is remembered.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODELS = ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-4-5'];
let working: string | null = null;
let client: Anthropic | null = null;

const env = (k: string) => { const v = process.env[k]; return v && v.trim() ? v.trim() : undefined; };

/** The connection as the environment presents it, Replit's names first. */
function connection(): { baseURL?: string; apiKey: string; via: string } | null {
  const replitUrl = env('AI_INTEGRATIONS_ANTHROPIC_BASE_URL'), replitKey = env('AI_INTEGRATIONS_ANTHROPIC_API_KEY');
  if (replitUrl || replitKey) return { baseURL: replitUrl, apiKey: replitKey ?? 'replit-ai-integrations', via: 'Replit AI Integrations' };
  const key = env('ANTHROPIC_API_KEY');
  if (key) return { baseURL: env('ANTHROPIC_BASE_URL'), apiKey: key, via: env('ANTHROPIC_BASE_URL') ? 'Anthropic-compatible endpoint' : 'Anthropic API' };
  return null;
}

export function aiConfigured(): boolean {
  return connection() !== null;
}

export function aiStatus() {
  const c = connection();
  return { mode: c ? ('claude' as const) : ('offline' as const), model: working ?? MODELS[0], via: c?.via ?? 'Replit AI Integrations' };
}

function getClient(): Anthropic | null {
  const c = connection();
  if (!c) return null;
  return (client ??= new Anthropic({ baseURL: c.baseURL, apiKey: c.apiKey }));
}

const modelRejected = (e: any) =>
  e?.status === 404 || (e?.status === 400 && /model/i.test(String(e?.message ?? '')));

/** messages.create with the first model the connection accepts. */
export async function createMessage(params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>): Promise<{ msg: Anthropic.Message; model: string }> {
  const c = getClient();
  if (!c) throw new Error('Replit AI Integrations is not connected');
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS;
  let last: any;
  for (const model of order) {
    try {
      const msg = await c.messages.create({ ...params, model });
      working = model;
      return { msg, model };
    } catch (e: any) {
      last = e;
      if (!modelRejected(e)) throw e;
      console.warn(`[ai] model ${model} not available, trying the next one`);
    }
  }
  throw last;
}
