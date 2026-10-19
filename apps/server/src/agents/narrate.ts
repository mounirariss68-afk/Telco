/**
 * Claude writes the words; the engine decides the facts. Fahis's finding and
 * Mushir's proposal are computed deterministically from the records; when
 * Replit AI Integrations is connected, Claude turns the structured finding
 * into the two or three sentences an approver and a customer read. Offline,
 * the templates below are used and the UI says "Offline".
 */
import { aiConfigured, createMessage } from '../ai.js';

export type Narration = { text: string; mode: 'claude' | 'offline'; model?: string };

const SYSTEM = 'You write for Dhow Telecom, a telecom operator. Plain English, British spelling, no marketing language, no exclamation marks, no bullet points. You never invent a fact: every number, name and date comes from the structured input. Two to four short sentences.';

async function ask(instruction: string, input: Record<string, unknown>, fallback: string, maxTokens = 260): Promise<Narration> {
  if (!aiConfigured()) return { text: fallback, mode: 'offline' };
  try {
    const { msg, model } = await createMessage({ max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: `${instruction}\n\nStructured input (the only facts you may use):\n${JSON.stringify(input, null, 1)}` }] });
    const text = msg.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return text ? { text, mode: 'claude', model } : { text: fallback, mode: 'offline' };
  } catch (e: any) {
    console.warn('[narrate] Claude unavailable, using the template:', e?.message);
    return { text: fallback, mode: 'offline' };
  }
}

export const narrateFinding = (input: Record<string, unknown>, fallback: string) =>
  ask('Write the investigator’s finding for the approver: what records were compared, what they show, and what is uncertain if anything.', input, fallback);
export const narrateProposal = (input: Record<string, unknown>, fallback: string) =>
  ask('Write the proposal for the approver: the action, the amount if any, why, the alternative considered, and the permission it needs. End with one sentence on what the customer will be told.', input, fallback);
