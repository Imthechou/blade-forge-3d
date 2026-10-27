/**
 * Full-screen capture (UI + model together).
 *
 * Why this exists: _p3look.mjs crops only the model bounding box, which hides
 * the overall brightness relationship. Users judge "too bright / contrast too
 * high" from the whole screen, so we need full frames.
 *
 * Usage:
 *   SCREENS_TAG=c1 node docs/rework/2026-10-24/_screens.mjs
 *   SCREENS_STAGES=home,s1,s2,s4 SCREENS_TAG=x node ..._screens.mjs
 *
 * Output: shots/screens/<tag>-<stage>.jpg (390 wide, ~25-45KB each)
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const OUT = path.join('docs', 'rework', '2026-10-24', 'shots', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const TAG = process.env.SCREENS_TAG || 'now';
const WANT = (process.env.SCREENS_STAGES || 'home,s1,s4')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.sheet-mask')))) return;
    await page.evaluate(() => document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(180);
  }
};

const waitCompile = async () => {
  for (let i = 0; i < 14; i++) {
    const busy = await page.evaluate(async () => {
      const { getStage } = await import('/src/render/index.js');
      const v = getStage()?.viewer;
      return !!(v && (v._compiling || v._compilePromise || v.deferCompile));
    });
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
};

async function shot(name) {
  const raw = path.join(OUT, `_raw-${TAG}-${name}.png`);
  await page.waitForTimeout(320);
  await page.screenshot({ path: raw });
  const small = await page.evaluate(async ({ dataUrl, targetW }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const scale = targetW / img.width;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }, { dataUrl: 'data:image/png;base64,' + fs.readFileSync(raw).toString('base64'), targetW: 390 });
  const jpg = path.join(OUT, `${TAG}-${name}.jpg`);
  fs.writeFileSync(jpg, Buffer.from(small.split(',')[1], 'base64'));
  fs.unlinkSync(raw);
  console.log(`  ${name.padEnd(5)} -> ${jpg}  (${(fs.statSync(jpg).size / 1024).toFixed(1)} KB)`);
}

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
await page.waitForTimeout(3200);
await dismiss();
if (WANT.includes('home')) await shot('home');

await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  g.startForge({ mode: 'normal', seed: 20261024 });
  (await import('/src/ui/router.js')).default.go('forge');
});
await page.waitForSelector('.cards .dcard', { timeout: 30000 });
await page.waitForTimeout(1600);
await dismiss();

const captured = new Set();
for (let step = 0; step < 40; step++) {
  const st = await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    if (!g.run) return null;
    return { phase: g.run.phase, idx: g.run.stageIndex, id: g.run.stageId };
  });
  if (!st) break;
  await dismiss();

  if (st.phase === 'select') {
    const sid = st.id.toLowerCase();
    const want = WANT.includes(sid);
    await page.evaluate(async () => {
      document.querySelector('.cards .dcard')?.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    if (want) {
      await waitCompile();
      await dismiss();
      await shot(sid);
      captured.add(sid);
    }
    await page.evaluate(() => document.querySelector('.actions .btn--primary')?.click());
    await page.waitForTimeout(400);
    continue;
  }
  if (st.phase === 'hammer') {
    await page.evaluate(() => { document.querySelector('.hammer-stage-hit')?.click(); document.querySelector('.hammer-actions .btn')?.click(); });
    await page.waitForTimeout(340); continue;
  }
  if (st.phase === 'edge') {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('\u8df3\u8fc7')); (b || document.querySelector('.actions .btn--primary'))?.click(); });
    await page.waitForTimeout(340); continue;
  }
  break;
}

const missing = WANT.filter((w) => w !== 'home' && !captured.has(w));
if (missing.length) console.log(`  未截到: ${missing.join(',')}`);
console.log('pageerror:', errs.length ? errs.slice(0, 3) : '无');
await browser.close();
