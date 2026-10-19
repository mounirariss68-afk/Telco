/**
 * Dhow server: the agentic layer's API, the simulated operator systems behind
 * the connector, the Demo Director, Dalil, and the built web app. One process,
 * one port. First run creates and seeds the database.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { aiConfigured, aiStatus } from './ai.js';
import { pool } from './db.js';
import { loadClock } from './clock.js';
import { reseed, isSeeded, ensureSchema } from './seed/index.js';
import { data } from './api/data.js';
import { actions } from './api/actions.js';
import { scenarios } from './api/scenarios.js';
import { assistant } from './assistant/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '../../web/dist');
const PORT = Number(process.env.PORT ?? 5000);

const app = express();
app.use(express.json({ limit: '4mb' }));
app.get('/api/healthz', async (_req, res) => { const ok = await pool.query('SELECT 1').then(() => true).catch(() => false); res.json({ ok, ai: aiStatus().mode }); });
let seeding: Promise<unknown> | null = null;
app.use('/api', (req, res, next) => { if (seeding && req.path !== '/healthz') return res.status(503).json({ error: 'Building the synthetic world; try again in a minute' }); next(); });
app.use('/api', data, actions, scenarios, assistant);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('[api]', err?.message ?? err); res.status(err?.status ?? 500).json({ error: err?.message ?? 'Server error' }); });

if (existsSync(WEB)) {
  app.use(express.static(WEB, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(WEB, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Dhow API is running. Build the web app with `npm run build` to serve the interface here.'));
}

async function main() {
  await ensureSchema();
  if (!(await isSeeded())) {
    console.log('First run: building the synthetic Dhow Telecom world (about a minute)...');
    seeding = reseed().finally(() => { seeding = null; });
    await seeding;
  }
  await loadClock();
  app.listen(PORT, '0.0.0.0', () => console.log(`Dhow is running on port ${PORT}. AI: ${aiConfigured() ? 'Claude via Replit AI Integrations' : 'offline (Replit AI Integrations not connected)'}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
