/** Who is asking. The persona comes from the x-persona header (the switcher in the shell); every data route applies that persona's scope on the server. */
import type { Request } from 'express';
import { PERSONA, PERSONAS, may, type ActionType, type Persona, type PersonaKey } from '@dhow/domain';

export function personaOf(req: Request): Persona {
  const key = String(req.header('x-persona') ?? req.query.persona ?? 'coo') as PersonaKey;
  return PERSONA[key] ?? PERSONA.coo;
}
/** SQL fragment restricting cases (alias k) to the persona's domains. */
export function scopeSql(p: Persona, alias = 'k'): { sql: string; params: unknown[] } {
  if (!p.domains) return { sql: 'TRUE', params: [] };
  return { sql: `${alias}.domain = ANY($1)`, params: [p.domains] };
}
export function rebase(sql: string, offset: number) { return sql.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) + offset}`); }
export function assertAllowed(p: Persona, action: ActionType, amount = 0) {
  if (!may(p.key, action, amount)) { const e: any = new Error(`${p.role} may not decide ${action.replace(/_/g, ' ').toLowerCase()}${amount ? ` of ${amount}` : ''} (authority matrix)`); e.status = 403; throw e; }
}
export const personas = () => PERSONAS.map((p) => ({ key: p.key, name: p.name, role: p.role, initials: p.initials, sees: p.sees, owns: p.owns, home: p.home, suggestions: p.suggestions, domains: p.domains, approvesNothing: !!p.approvesNothing }));
