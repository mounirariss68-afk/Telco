import { reseed } from './index.js';
import { pool } from '../db.js';
reseed().then((r) => { console.log('seeded', r); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
