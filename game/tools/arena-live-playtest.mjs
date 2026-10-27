/**
 * 赛事真实浏览器冒烟：两条玩家入口 + 真实鼠标 PointerEvent 滑切。
 * 不改动游戏逻辑；使用独立存档 / 上下文；每次保存截图、判定与异常。
 *
 * Run: cd game && node serve.cjs 8123 127.0.0.1 &
 *      npm install --no-save --package-lock=false playwright
 *      node tools/arena-live-playtest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const out = path.resolve('arena-playtest');
fs.mkdirSync(out, { recursive: true });
const base = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle',
    '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const report = { url: base, testedAt: new Date().toISOString(), cases: [], issues: [], errors: [], httpFailures: [] };
const blade = {
  id: 'arena-probe-blade-1', bladeName: '赛事自动验收刀', knifeTypeId: 'tang',
  canEnterArena: true, fractured: false, score: 330, rarity: 'epic',
  stats: { strength: 160, toughness: 160, sharpness: 160, craft: 160, design: 160, spirit: 160 },
  traits: [], combos: [], tags: {},
};
function watch(page, label) {
  page.on('pageerror', e => report.errors.push({ label, error: String(e) }));
  page.on('console', m => { if (m.type() === 'error') report.errors.push({ label, error: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) report.httpFailures.push({ label, status: r.status(), url: r.url() }); });
  page.on('requestfailed', r => report.httpFailures.push({ label, url: r.url(), error: r.failure()?.errorText }));
}
async function snap(page, name) {
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 12000 }).catch(e => report.errors.push({ label: 'screenshot', error: String(e) }));
}
async function newGame(label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce',
  });
  // 测试存档只在隔离浏览器上下文；永远不写实际玩家存档。
  await context.addInitScript((record) => {
    localStorage.setItem('bladeforge.save', JSON.stringify({
      version: 1, cr: 2000, collection: [record],
      settings: { tutorialSeen: true, sound: false, motion: 'reduced', hintsSeen: {} },
    }));
  }, blade);
  const page = await context.newPage(); watch(page, label);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),
    null, { timeout: 90000 },
  );
  // 可能的引导/公告弹窗，不依赖它来生成存档。
  const close = page.getByRole('button', { name: '关闭', exact: true });
  if (await close.count()) await close.first().click().catch(() => {});
  await page.evaluate(async () => (await import('/src/ui/router.js')).go('arena'));
  await page.locator('.page[data-page="arena"].is-active .arena-body').waitFor();
  return { context, page };
}
async function scenario(name, fn) {
  let env;
  try {
    env = await newGame(name);
    const detail = await fn(env.page);
    report.cases.push({ name, status: 'PASS', detail });
    console.log('PASS', name, JSON.stringify(detail));
  } catch (e) {
    const message = String(e.stack || e);
    report.cases.push({ name, status: 'FAIL', error: message });
    console.error('FAIL', name, message);
    if (env?.page) await snap(env.page, name + '-failure');
  } finally { await env?.context.close().catch(() => {}); }
}
function parseCounter(text) {
  const nums = [...String(text).matchAll(/\d+/g)].map(x => Number(x[0]));
  return nums[0] || 0;
}
async function swipe(page, selector, ax, ay, bx, by) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.width > 40 && box.height > 40, selector + ' 画布不可操作');
  const pt = (x,y) => [box.x + box.width * x, box.y + box.height * y];
  const [x1,y1] = pt(ax,ay), [x2,y2] = pt(bx,by);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 20 });
  await page.mouse.up();
}
await scenario('quick-free-45s-real-pointer', async page => {
  const body = page.locator('.page[data-page="arena"].is-active');
  await snap(page, '01-quick-setup-entry');
  assert.ok(await body.locator('.arena-loadout').count(), '赛事内没有参赛刀选择');
  await body.getByRole('button', { name: '快速挑战' }).click();
  await snap(page, '02-quick-entry');
  await body.getByRole('button', { name: '开始自由快赛' }).click();
  await body.locator('.quick-canvas').waitFor({ timeout: 10000 });
  await snap(page, '03-quick-live-before-swipe');
  const before = await page.evaluate(() => {
    const run = window.__FORGE_ARENA?.run;
    return run && { phase: run.phase, score: run.score, kills: run.kills, targets: run.targets.map(t => ({type:t.type,x:t.x,y:t.y,progress:t.progress})) };
  });
  assert.ok(before && before.targets.length, '完整切割引擎未挂载至 45 秒画布');
  for (const t of before.targets) {
    await swipe(page, '.page.is-active .quick-canvas',
      Math.max(.01,t.x-.16), t.y, Math.min(.99,t.x+.16), t.y);
  }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const r = window.__FORGE_ARENA?.run;
    return r && { phase:r.phase,score:r.score,kills:r.kills,combo:r.combo,
      hits:r.log.filter(x=>x.type==='hit'||x.type==='contact').length,
      targets:r.targets.map(t=>({type:t.type,progress:t.progress,alive:t.alive})) };
  });
  await snap(page, '04-quick-live-after-swipe');
  assert.ok(after && (after.kills > before.kills || after.score > before.score || after.targets.some(t=>t.progress > 0)),
    '画布接收到实际滑切但没有命中、伤害或得分');
  // 真实经过完整45秒，不调用 core.tick 不改时间；选择浮层也通过真实按钮。
  for (const phase of ['route-choice', 'finale-choice']) {
    await page.waitForFunction(p => window.__FORGE_ARENA?.run?.phase === p
      || window.__FORGE_ARENA?.run?.done, phase, { timeout: 42000 });
    const state = await page.evaluate(() => window.__FORGE_ARENA?.run?.phase);
    if (state !== phase) throw Error('未进入 ' + phase + '，实际为 ' + state);
    await body.locator('.quick-choice-overlay .quick-choice-card').first().click({ timeout: 8000 });
    await snap(page, phase + '-selected');
  }
  await page.waitForFunction(() => document.querySelector('.page.is-active .arena-view-quick-report'),
    null, { timeout: 30000 });
  await snap(page, '05-quick-settlement');
  const final = await page.evaluate(async () => {
    const P = await import('/src/core/progress.js');
    return { cr:P.get().cr, history:P.get().quickChallengeRecords,
      heading:document.querySelector('.page.is-active .arena-body')?.innerText.slice(0,480) };
  });
  assert.ok(final.heading && final.heading.length > 25, '快赛结束没有结算页面');
  return { before, after, final };
});
await scenario('formal-school-cutting-real-pointer', async page => {
  const body = page.locator('.page[data-page="arena"].is-active');
  await snap(page, '06-formal-setup');
  const edge = body.locator('.hub-branch').filter({ hasText: '锋刃' });
  assert.ok(await edge.count(), '未出现锋刃流派');
  await edge.click();
  await body.getByRole('button', { name: '开始挑战' }).click();
  await body.locator('.formal-sweep-canvas').waitFor({ timeout: 12000 });
  await snap(page, '07-formal-sweep-before');
  const before = await body.locator('.formal-sweep-hud .cut-count').innerText();
  // 正式切割是另一套实现，只画固定线段；模拟多次实际鼠标滑切。
  for (let row=0; row<2; row++) {
    const y=.30+row*.22;
    for (let col=0; col<3; col++) {
      const x=.18+col*.32;
      await swipe(page, '.page.is-active .formal-sweep-canvas', x-.12,y,x+.12,y);
    }
  }
  await page.waitForTimeout(350);
  await snap(page, '08-formal-sweep-after');
  const state = await page.evaluate(async () => {
    const Game = (await import('/src/app/game.js')).default;
    return {
      counter: document.querySelector('.page.is-active .formal-sweep-hud .cut-count')?.innerText || null,
      match: Game.formalMatch && { done:Game.formalMatch.done,
        tests:Game.formalMatch.definition?.tests, index:Game.formalMatch.session?.index,
        results:Game.formalMatch.session?.entries?.map(e=>({name:e.name,status:e.status})) },
      arenaText: document.querySelector('.page.is-active .arena-body')?.innerText.slice(0,500),
    };
  });
  assert.ok(parseCounter(state.counter) > parseCounter(before)
    || state.match?.session?.index > 0
    || state.match?.results?.some(x=>x.status === 'complete'),
    '正式切割手势无法完成任何命中');
  // 一局正式测试的整场结束至少必须有 UI 出口，不靠篡改状态。
  const abandon = body.getByRole('button', { name: '放弃剩余测试' });
  if (await abandon.count()) await abandon.click();
  await snap(page, '09-formal-after-abandon');
  return { before, state };
});
report.summary = {
  passed: report.cases.filter(x=>x.status==='PASS').length,
  failed: report.cases.filter(x=>x.status==='FAIL').length,
  jsErrors: report.errors.length, httpFailures:report.httpFailures.length,
};
fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2));
console.log('ARENA_PLAYTEST_SUMMARY', JSON.stringify(report.summary));
await browser.close();
if (report.summary.failed || report.summary.jsErrors || report.summary.httpFailures) process.exitCode = 1;
