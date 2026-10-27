/** 独立浏览器存档：启动、3D、设置、真实选卡、归档失败重试和异常旧档。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable, baseUrl } from './lib/browser.mjs';

const out = path.resolve(import.meta.dirname, '../docs/validation/2026-10-24');
fs.mkdirSync(out, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });
const report = { url: baseUrl, testedAt: new Date().toISOString(), scenarios: [], errors: [], failedRequests: [] };
let current;
function watch(page, label) {
  page.on('pageerror', error => report.errors.push({ label, message: String(error) }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ label, message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) report.failedRequests.push({ label, status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => report.failedRequests.push({ label, url: request.url(), error: request.failure()?.errorText }));
}
async function ready(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'), null, { timeout: 120000 });
  const close = page.getByRole('button', { name: '关闭', exact: true });
  // 首次引导按启动流程延迟弹出，等待其出现后真实关闭。
  try {
    await close.first().waitFor({ timeout: 2500 });
    await close.first().click();
    await page.locator('.sheet-mask').waitFor({ state: 'detached', timeout: 3000 });
  } catch (error) { if (error.name !== 'TimeoutError') throw error; }
}
async function scenario(name, action) {
  try { const detail = await action(); report.scenarios.push({ name, ok: true, detail }); console.log('PASS', name); }
  catch (error) {
    report.scenarios.push({ name, ok: false, error: String(error.stack || error) });
    if (current) await current.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  }
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = current = await context.newPage(); watch(page, 'desktop');
  await scenario('桌面首页与 3D 首帧', async () => {
    await ready(page);
    const detail = await page.evaluate(() => ({ prep: window.__FORGE_PREP, canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
    assert.ok(detail.canvases.some(c => c.width > 1 && c.height > 1));
    assert.equal(detail.prep.problems.length, 0);
    await page.screenshot({ path: path.join(out, 'desktop-home.png'), fullPage: true });
    return { elapsedMs: detail.prep.elapsedMs, readyStages: detail.prep.readyStages };
  });
  await scenario('设置保存并刷新恢复', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('switch').first().click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bladeforge.save')).settings.sound), false);
    await ready(page);
    assert.equal(await page.evaluate(async () => (await import('/src/core/progress.js')).get().settings.sound), false);
  });
  await scenario('真实点击开始、选卡与阶段推进', async () => {
    await page.getByRole('button', { name: /开始锻刀/ }).click();
    await page.locator('.page.is-active .dcard').first().waitFor({ timeout: 45000 });
    await page.locator('.page.is-active .dcard').first().click();
    const confirm = page.getByRole('button', { name: '确认工艺 →', exact: true });
    await confirm.waitFor({ timeout: 30000 });
    await confirm.click();
    await page.waitForFunction(async () => (await import('/src/app/game.js')).Game.run.stageIndex === 1, null, { timeout: 30000 });
    await page.screenshot({ path: path.join(out, 'forge-stage2.png'), fullPage: true });
  });
  await scenario('鉴定保存失败提示、重试与重复归档保护', async () => {
    await page.evaluate(async () => {
      const P = await import('/src/core/progress.js');
      const { Game } = await import('/src/app/game.js');
      const { createRun } = await import('/src/core/forge.js');
      const run = createRun({ seed: 123 }); run.fractured = true;
      Game.run = run; Game.mode = 'normal'; Game.appraise();
      window.__beforeArchive = JSON.stringify(P.get());
      window.__originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'bladeforge.save') throw new Error('simulated quota'); return window.__originalSetItem.call(this, key, value); };
      (await import('/src/ui/router.js')).go('appraise');
    });
    await page.getByRole('button', { name: '重试保存', exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => JSON.stringify((await import('/src/core/progress.js')).get()) === window.__beforeArchive), true);
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    const before = await page.evaluate(async () => (await import('/src/core/progress.js')).get().stats.forgeCount);
    assert.equal(before, 1);
    await page.evaluate(async () => { const r = await import('/src/ui/router.js'); r.go('home'); r.go('appraise'); });
    assert.equal(await page.evaluate(async () => (await import('/src/core/progress.js')).get().stats.forgeCount), before);
  });
  await scenario('赛事与工坊页面切换', async () => {
    for (const name of ['arena', 'workshop', 'home']) {
      await page.evaluate(async name => (await import('/src/ui/router.js')).go(name), name);
      await page.locator(`.page[data-page="${name}"].is-active`).waitFor();
    }
  });
  await scenario('切割整场保存失败不锁定结算，恢复后只发一次奖励', async () => {
    const detail = await page.evaluate(async () => {
      const { Game } = await import('/src/app/game.js');
      const P = await import('/src/core/progress.js');
      Game.sliceMatch = { id: 'audit-slice', done: true, kind: 'team', tier: 'apex', blade: { id: 'audit' },
        result: { win: false, score: 0, runs: [], buffs: [], wins: 0, losses: 1 } };
      const before = JSON.stringify(P.get());
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'bladeforge.save') throw new Error('simulated quota'); return original.call(this, key, value); };
      let failed, locked, unchanged;
      try {
        failed = Game.retrySliceSave(); locked = !!Game.sliceMatch.settled;
        unchanged = JSON.stringify(P.get()) === before;
      } finally { Storage.prototype.setItem = original; }
      const retry = Game.retrySliceSave();
      const balance = P.get().cr;
      Game.retrySliceSave();
      return { failed: failed.code, locked, unchanged, retryReward: retry.cr,
        settled: Game.sliceMatch.settled, noDuplicate: balance === P.get().cr };
    });
    assert.equal(detail.failed, 'PERSIST_FAILED'); assert.equal(detail.locked, false);
    assert.equal(detail.unchanged, true); assert.equal(detail.settled, true);
    assert.equal(detail.noDuplicate, true); assert.ok(detail.retryReward > 0);
    return detail;
  });
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await mobile.addInitScript(() => localStorage.setItem('bladeforge.save', JSON.stringify({ version: 1, collection: null, fractured: null, stats: null, codex: null, arena: null, settings: { tutorialSeen: true } })));
  const phone = current = await mobile.newPage(); watch(phone, 'mobile-malformed');
  await scenario('手机尺寸和异常旧档启动', async () => {
    await ready(phone);
    const detail = await phone.evaluate(async () => {
      const save = (await import('/src/core/progress.js')).get();
      return { collection: save.collection, bestScore: save.stats.bestScore, backup: !!localStorage.getItem('bladeforge.save.recovery'), viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert.deepEqual(detail.collection, []);
    assert.equal(detail.bestScore, 0);
    assert.equal(detail.backup, true);
    assert.ok(detail.pageWidth <= detail.viewport + 1);
    await phone.screenshot({ path: path.join(out, 'mobile-home.png'), fullPage: true });
    return detail;
  });
  await mobile.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  report.ok = !report.failure && !report.errors.length && !report.failedRequests.length;
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(`浏览器验收 ${report.ok ? '通过' : '失败'}；报告 ${path.join(out, 'browser.json')}`);
}
