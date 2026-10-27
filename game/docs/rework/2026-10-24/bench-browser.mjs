/**
 * 浏览器实测性能采样（rework T15 / 待办 #10）
 *
 * 与 bench-logic.mjs 的区别：
 *   · bench-logic 只测**纯逻辑**（无 DOM、无布局、无合成）；
 *   · 本脚本用**真实 Chrome**打开真实页面，测
 *       - 首帧/就绪耗时
 *       - 选卡预览的 DOM 更新时间（含布局）
 *       - 连续切卡/切页的资源占用与稳定性
 *       - 长时间空闲后的内存变化（粗测泄漏迹象）
 *
 * 明确边界：
 *   · 这是**桌面 Chrome**（真机不是桌面），因此不等于移动设备帧率；
 *   · 报告里必须标注设备、样本、冷/热状态（脚本会打印）。
 *
 * 运行（需服务已启动在 8123）：
 *   node docs/rework/2026-10-24/bench-browser.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const ms = (v) => `${v.toFixed(1)}ms`;

if (!PW || !fs.existsSync(PW)) {
  console.error('找不到 Playwright。设置 PLAYWRIGHT_MODULE 指向 playwright 的 index.mjs。');
  process.exit(2);
}

const { chromium } = await import(pathToFileURL(PW).href);

const browser = await chromium.launch({
  executablePath: CHROME || undefined,
  /* ★ 默认 headless 会让 rAF 不受垂直同步限速（实测 180FPS）、
     且 WebGL 可能走软件渲染 —— 那样的帧率与预览耗时**不能**当设备结论。
     所以默认改用**有头模式**（真实 GPU 合成 + vsync）；
     需要对比无头时设 FORGE_HEADLESS=1。 */
  headless: process.env.FORGE_HEADLESS === '1',
  args: ['--disable-dev-shm-usage'],
});

/* 隔离存档：使用全新 context，不触碰用户真实存档 */
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

console.log('=== 环境 ===');
console.log('browser   :', CHROME ? path.basename(CHROME) : 'bundled chromium');
console.log('mode      :', process.env.FORGE_HEADLESS === '1' ? 'headless（rAF 不限速，仅作对比）' : 'headed（真实 GPU 合成 + vsync）');
console.log('viewport  : 390x844 @DPR3 (手机视口模拟，非真机)');
console.log('url       :', BASE);

/* ── 1. 冷启动到就绪 ── */
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const domReady = Date.now() - t0;

// 等 WebGL/首页就绪标记（项目会在准备完成时移除 .stage-readiness 或出现 home 内容）
await page.waitForFunction(() => {
  const ready = document.querySelector('.stage-readiness');
  const home = document.querySelector('#homeBody');
  return (!ready || getComputedStyle(ready).display === 'none') && !!home;
}, { timeout: 60000 }).catch(() => {});
const readyAt = Date.now() - t0;

console.log('\n=== 冷启动（首次进入） ===');
console.log('DOMContentLoaded 完成 :', ms(domReady));
console.log('首页就绪（含着色器） :', ms(readyAt));

/* ── 2. 选卡预览的 DOM 更新时间（含布局） ── */
/* 注入隔离夹具，直接进锻造页，避免依赖手动点击流程 */
await page.evaluate(async () => {
  const mod = await import('/src/core/saveSchema.js');
  const s = mod.makeSave();
  s.collection = [];
  s.cr = 500;
  localStorage.setItem('bladeforge.save', JSON.stringify(s));
});

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 30000 });

// 进锻造页
await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  g.startForge({ mode: 'normal', seed: 20261024 });
  const r = (await import('/src/ui/router.js')).default;
  r.go('forge');
});
await page.waitForSelector('.cards .dcard', { timeout: 30000 });

/* 选卡预览：点击 → 读取布局完成的耗时（用 rAF 双帧确认） */
const previewTimes = [];
for (let i = 0; i < 20; i++) {
  /* 必须把 i 作为参数传入浏览器上下文 —— 
     直接引用外层 let i 会报 ReferenceError: i is not defined。 */
  const t = await page.evaluate(async (idx) => {
    const cards = document.querySelectorAll('.cards .dcard');
    if (cards.length < 2) return null;
    const target = cards[idx % cards.length];
    const start = performance.now();
    target.click();
    // 等两帧：一帧提交样式，一帧完成布局+绘制
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - start;
  }, i);
  if (t != null) previewTimes.push(t);
  await page.waitForTimeout(30);
}

console.log('\n=== 选卡预览（点击 → 两帧后，含布局） ===');
console.log('n =', previewTimes.length,
  '| p50', ms(pct(previewTimes, 50)),
  '| p95', ms(pct(previewTimes, 95)),
  '| max', ms(Math.max(...previewTimes)));

/* ── 3. 连续切卡/重铸的资源稳定性 ── */
const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
const tSwitch = Date.now();
for (let i = 0; i < 30; i++) {
  await page.evaluate(async () => {
    const cards = document.querySelectorAll('.cards .dcard');
    // 交替点击同一批卡，制造预览/取消的重复路径
    if (cards.length) cards[0].click();
    await new Promise((r) => requestAnimationFrame(r));
    if (cards.length) cards[0].click();
  });
}
const switchTotal = Date.now() - tSwitch;
const heapAfterSwitch = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);

/* ── 4. 切页往返（forge ↔ home） ── */
const tNav = Date.now();
for (let i = 0; i < 10; i++) {
  await page.evaluate(async () => (await import('/src/ui/router.js')).default.go('home'));
  await page.waitForTimeout(60);
  await page.evaluate(async () => (await import('/src/ui/router.js')).default.go('forge'));
  await page.waitForTimeout(60);
}
const navTotal = Date.now() - tNav;
const heapAfterNav = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);

const mb = (v) => (v == null ? 'n/a (performance.memory 不可用)' : `${(v / 1048576).toFixed(1)}MB`);

console.log('\n=== 连续操作稳定性 ===');
console.log('30 次卡预览往返      :', ms(switchTotal), '→ 平均', ms(switchTotal / 30));
console.log('10 次切页往返        :', ms(navTotal), '→ 平均', ms(navTotal / 10));
console.log('JS heap 初始         :', mb(heapBefore));
console.log('JS heap 预览后       :', mb(heapAfterSwitch));
console.log('JS heap 切页后       :', mb(heapAfterNav));

/* ── 5. 帧率粗测（空闲时 2 秒） ── */
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames++;
    if (performance.now() - start >= 2000) resolve(frames / ((performance.now() - start) / 1000));
    else requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}));
console.log('\n=== 空闲帧率（2 秒，锻造页带 3D 舞台） ===');
console.log('约', fps.toFixed(1), 'FPS（手机视口模拟，桌面 GPU；非真机结论）');

/* ── 7. 低端设备近似：CPU 限速（CDP） ──
   这不是真机，但是业界通行的**低端设备代理指标**：
   把 CPU 降速 N 倍，观察预览耗时与帧率是否仍可用。
   仍需明确：它**不能**模拟真实手机的 GPU 能力、发热降频与内存压力。 */
const throttle = Number(process.env.FORGE_CPU_THROTTLE || 6);
let throttled = null;
if (throttle > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  /* 限速下重新回到锻造页，确保测的是同一页面 */
  await page.evaluate(async () => (await import('/src/ui/router.js')).default.go('forge'));
  await page.waitForSelector('.cards .dcard', { timeout: 30000 });

  /* ★ 任务书要求注明**冷/热状态**。
     上一版 n=20 且 p95 == max，无法区分「单次冷启动尖峰」与「稳态偏慢」。
     这里把前 5 次单独记为“冷”（首次点每张卡会触发视觉切换/编译路径），
     其余 45 次记为“热”（稳态重覆点击），分开报。 */
  const coldTimes = [];
  const warmTimes = [];
  const SAMPLES = 50;
  const COLD = 5;
  for (let i = 0; i < SAMPLES; i++) {
    const t = await page.evaluate(async (idx) => {
      const cards = document.querySelectorAll('.cards .dcard');
      if (cards.length < 2) return null;
      const target = cards[idx % cards.length];
      const start = performance.now();
      target.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - start;
    }, i);
    if (t != null) (i < COLD ? coldTimes : warmTimes).push(t);
    await page.waitForTimeout(30);
  }
  const tTimes = [...coldTimes, ...warmTimes];

  const tFps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    function tick() {
      frames++;
      if (performance.now() - start >= 2000) resolve(frames / ((performance.now() - start) / 1000));
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));

  throttled = {
    rate: throttle,
    p50: +pct(tTimes, 50).toFixed(1),
    p95: +pct(tTimes, 95).toFixed(1),
    max: +Math.max(...tTimes).toFixed(1),
    samples: tTimes.length,
    fps: +tFps.toFixed(1),
    cold: {
      n: coldTimes.length,
      p50: +pct(coldTimes, 50).toFixed(1),
      max: coldTimes.length ? +Math.max(...coldTimes).toFixed(1) : null,
    },
    warm: {
      n: warmTimes.length,
      p50: +pct(warmTimes, 50).toFixed(1),
      p95: +pct(warmTimes, 95).toFixed(1),
      max: warmTimes.length ? +Math.max(...warmTimes).toFixed(1) : null,
    },
  };

  console.log(`\n=== CPU ${throttle}× 限速（低端设备近似，**非真机**） ===`);
  console.log('选卡预览 n =', throttled.samples,
    '| p50', ms(throttled.p50), '| p95', ms(throttled.p95), '| max', ms(throttled.max));
  console.log('  冷（前', throttled.cold.n, '次）: p50', ms(throttled.cold.p50), '| max', ms(throttled.cold.max));
  console.log('  热（其余', throttled.warm.n, '次）: p50', ms(throttled.warm.p50),
    '| p95', ms(throttled.warm.p95), '| max', ms(throttled.warm.max));
  console.log('空闲帧率约', throttled.fps, 'FPS');

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}

/* ── 8. 控制台错误 ── */
console.log('\n=== 控制台错误 ===');
if (!consoleErrors.length) console.log('无 error / pageerror');
else consoleErrors.slice(0, 10).forEach((e) => console.log(' -', e));

await browser.close();

/* 结果摘要，便于写入文档 */
console.log('\n=== 摘要（可直接引用） ===');
console.log(JSON.stringify({
  viewport: '390x844@DPR3 (emulated mobile)',
  device: CHROME ? path.basename(CHROME) : 'bundled chromium',
  coldStartMs: readyAt,
  previewP50: +pct(previewTimes, 50).toFixed(1),
  previewP95: +pct(previewTimes, 95).toFixed(1),
  previewMax: +Math.max(...previewTimes).toFixed(1),
  previewSamples: previewTimes.length,
  fpsIdle: +fps.toFixed(1),
  heapGrowthMB: (heapBefore != null && heapAfterNav != null) ? +((heapAfterNav - heapBefore) / 1048576).toFixed(1) : null,
  consoleErrors: consoleErrors.length,
  cpuThrottled: throttled,
}, null, 2));
