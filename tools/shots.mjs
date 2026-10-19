// Render check: every screen, two themes, console errors and horizontal overflow. Usage: node tools/shots.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5177';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });
const screens = ['overview', 'inbox', 'cases', 'subscribers', 'roaming', 'cvm', 'service', 'enterprise', 'agents', 'workflows', 'authority', 'scenarios', 'measures', 'trail', 'settings'];
const browser = await chromium.launch();
const problems = [];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${theme}] console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`[${theme}] pageerror: ${e.message.slice(0, 200)}`));
  await page.goto(base + '/');
  await page.evaluate((t) => { localStorage.setItem('atelier-theme', t); localStorage.setItem('dhow-persona', 'billing_officer'); }, theme);
  for (const s of screens) {
    await page.goto(`${base}/#/${s}`);
    await page.waitForTimeout(1800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) problems.push(`[${theme}] ${s}: horizontal overflow ${over}px`);
    const empty = await page.evaluate(() => document.body.innerText.trim().length < 200);
    if (empty) problems.push(`[${theme}] ${s}: page nearly empty`);
    await page.screenshot({ path: `${out}/${s}-${theme}.png`, fullPage: false });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'No problems found.');
