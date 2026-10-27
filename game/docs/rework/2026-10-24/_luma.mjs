/**
 * 亮度分布测量：确认画面是"暗但有层次"还是"暗死"
 *
 * 背景：用户要求「暗一大半」，我已把环境能量降到约一半。
 * 但 hiPct（luma>0.784 的占比）全部变成 0 —— 这有两种可能：
 *   ① 金属确实没有高光了（看起来像陶土，需要救回内核）
 *   ② 只是整体压暗，最亮点还在 0.6~0.75 之间（正常，暗调金属就该这样）
 *
 * 所以要看**分位数**，而不是只看阈值占比。
 * 出 max / p99 / p90 / p50 / mean，一眼分清上面两种情况。
 *
 * 用法：node docs/rework/2026-10-24/_luma.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.sheet-mask')))) return;
    await page.evaluate(() => document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(180);
  }
};

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
await page.waitForTimeout(3000);
await dismiss();
await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  g.startForge({ mode: 'normal', seed: 20261024 });
  (await import('/src/ui/router.js')).default.go('forge');
});
await page.waitForSelector('.cards .dcard', { timeout: 30000 });
await page.waitForTimeout(1400);
await dismiss();

const measure = () => page.evaluate(async () => {
  const { getStage } = await import('/src/render/index.js');
  const v = getStage()?.viewer;
  if (!v || !v.renderer) return { error: 'no viewer' };
  v.renderer.render(v.scene, v.camera);
  const cv = v.renderer.domElement;
  const W = cv.width, H = cv.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  const vals = [];
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (d[i + 3] / 255 < 0.02) continue;
    if (lum >= 0.965) continue;   // 背景
    vals.push(lum);
  }

  /* ★★ 2026-10-27：排除**边缘像素**再统计。

     病象：S4 的 max 在“调暗前”和“调暗后”都是 **0.9518**，一位小数都没变。
     真正的高光不可能对光照改动毫无反应 —— 这说明 max 采到的不是高光，
     而是模型与白色背景之间的**抗锯齿过渡像素**（它们接近背景 0.965，
     但又被 0.965 的阈值筛不干净）。用这种像素判断“亮部过亮”是错的。

     修法：只统计**内部像素**（四个邻居都是前景），把轮廓带整圈剔掉。
     这样得到的 p99 / max 才是模型内部的真实高光。 */
  const isBg = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = d[i + 3] / 255;
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    isBg[p] = (a < 0.02 || lum >= 0.965) ? 1 : 0;
  }
  const inner = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (isBg[p]) continue;
      if (isBg[p - 1] || isBg[p + 1] || isBg[p - W] || isBg[p + W]) continue;
      inner.push((0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]) / 255);
    }
  }

  if (!vals.length) return { error: 'empty' };
  const stat = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    const q = (t) => +s[Math.min(s.length - 1, Math.floor(s.length * t))].toFixed(4);
    return {
      n: s.length, min: +s[0].toFixed(4),
      p10: q(0.10), p50: q(0.50), p90: q(0.90), p99: q(0.99), p995: q(0.995),
      max: +s[s.length - 1].toFixed(4),
      mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(4),
      hiPct: +(100 * s.filter((v2) => v2 > 0.784).length / s.length).toFixed(2),
      darkPct: +(100 * s.filter((v2) => v2 < 0.10).length / s.length).toFixed(2),
    };
  };
  const all = stat(vals);
  const inr = inner.length ? stat(inner) : null;
  return { all, inner: inr };
});

const waitCompile = async () => {
  for (let i = 0; i < 12; i++) {
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

const rows = [];
for (let step = 0; step < 30; step++) {
  const st = await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    if (!g.run) return null;
    return { phase: g.run.phase, idx: g.run.stageIndex, id: g.run.stageId };
  });
  if (!st) break;
  if (['S1', 'S2', 'S3', 'S4', 'S5'].includes(st.id) && st.phase === 'select') {
    await page.evaluate(async () => {
      document.querySelector('.cards .dcard')?.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await waitCompile();
    await dismiss();
    const r = await measure();
    if (!r.error) rows.push({ stage: st.id, ...r });
    else console.log(`  ${st.id} ✗ ${r.error}`);
    await page.evaluate(() => document.querySelector('.actions .btn--primary')?.click());
    await page.waitForTimeout(400);
    continue;
  }
  await dismiss();
  if (st.phase === 'select') {
    await page.evaluate(() => document.querySelector('.cards .dcard')?.click());
    await page.waitForTimeout(280);
    await page.evaluate(() => document.querySelector('.actions .btn--primary')?.click());
    await page.waitForTimeout(400);
    continue;
  }
  if (st.phase === 'hammer') {
    await page.evaluate(() => { document.querySelector('.hammer-stage-hit')?.click(); document.querySelector('.hammer-actions .btn')?.click(); });
    await page.waitForTimeout(320); continue;
  }
  if (st.phase === 'edge') {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('跳过')); (b || document.querySelector('.actions .btn--primary'))?.click(); });
    await page.waitForTimeout(320); continue;
  }
  break;
}

console.log('=== 亮度分布（已排除背景；"内部"= 剔除轮廓带后的纯内部像素）===');
console.log('stage  scope    n      mean    min    p10    p50    p90    p99   p995    max   hi%  dark%');
for (const r of rows) {
  for (const [scope, s] of [['all', r.all], ['inner', r.inner]]) {
    if (!s) continue;
    console.log(
      `${r.stage.padEnd(6)} ${scope.padEnd(7)} ${String(s.n).padStart(6)} ${String(s.mean).padStart(6)} `
      + `${String(s.min).padStart(6)} ${String(s.p10).padStart(6)} ${String(s.p50).padStart(6)} `
      + `${String(s.p90).padStart(6)} ${String(s.p99).padStart(6)} ${String(s.p995).padStart(6)} `
      + `${String(s.max).padStart(6)} ${String(s.hiPct).padStart(5)} ${String(s.darkPct).padStart(6)}`,
    );
  }
}

console.log('\n判读（只看 inner 那行）：');
console.log('  hi%   > 3     → 亮部占比偏高（过曝感）');
console.log('  dark% > 8     → 死黑像素太多（暗部太暗）');
console.log('  p995 与 p50 差 > 0.45 → 动态范围过宽');
console.log('pageerror:', errs.length ? errs.slice(0, 3) : '无');
await browser.close();
