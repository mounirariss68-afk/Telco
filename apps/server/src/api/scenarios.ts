/** The Director's routes. */
import { Router } from 'express';
import { runStep, startScenario, stopScenario } from '../director.js';

export const scenarios = Router();
scenarios.post('/scenarios/:key/start', async (req, res) => { res.json(await startScenario(req.params.key)); });
scenarios.post('/scenarios/:key/step', async (req, res) => { res.json(await runStep(req.params.key, Number(req.body?.index ?? 0))); });
scenarios.post('/scenarios/stop', async (_req, res) => { stopScenario(); res.json({ ok: true }); });
