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
  await page.screenshot({ path: file, fullPage: false, animations: 'allow', timeout: 5500 })
    .catch(e => report.issues.push({ kind:'SCREENSHOT_TIMEOUT', file:name, error:String(e).slice(0,240) }));
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
  // 赛事为 Canvas2D：允许 GPU 降级继续玩。旧条件 __FORGE_PREP.ready
  // 只有全套 HDR/Shader 通过才为 true，且 #boot 会在 340ms 后移除，
  // 因此不能用它作为赛事 UI 是否可玩的判据。
  try {
    await page.waitForFunction(() => {
      const boot = document.querySelector('#boot');
      return document.querySelector('.page[data-page="home"]')
        && (!boot || boot.classList.contains('is-gone'));
    }, null, { timeout: 90000 });
  } catch (error) {
    const diagnosis = await page.evaluate(() => ({
      title:document.title, boot:document.querySelector('#boot')?.outerHTML.slice(0,450),
      note:document.querySelector('#bootNote')?.textContent,
      prep:window.__FORGE_PREP || null,
      page:document.body.innerText.slice(0,650),
    })).catch(e => ({error:String(e)}));
    report.issues.push({label,kind:'BOOT_BLOCK',diagnosis});
    await snap(page,label+'-boot-blocked');
    throw Error('游戏启动未退出加载屏：'+JSON.stringify(diagnosis).slice(0,900)+'; '+String(error));
  }
  const prep = await page.evaluate(() => window.__FORGE_PREP || null);
  if (prep?.ready === false)
    report.issues.push({label,kind:'GPU_PREP_DEGRADED',problems:prep.problems,readyStages:prep.readyStages});
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
  console.log('QUICK_SWIPES', JSON.stringify({before,after}));
  assert.ok(after && (after.kills > before.kills || after.score > before.score || after.targets.some(t=>t.progress > 0)),
    '画布接收到实际滑切但没有命中、伤害或得分');
  // 真实经过完整45秒，不调用 core.tick 不改时间；选择浮层也通过真实按钮。
  for (const phase of ['route-choice', 'finale-choice']) {
    try {
      await page.waitForFunction(p => window.__FORGE_ARENA?.run?.phase === p
        || window.__FORGE_ARENA?.run?.done, phase, { timeout: 42000 });
    } catch(e) {
      const diagnostic = await page.evaluate(() => {
        const r=window.__FORGE_ARENA?.run;const c=window.__FORGE_ARENA?.canvas;
        return {run:r&&{phase:r.phase,elapsed:r.elapsed,remaining:r.remaining,score:r.score,
          kills:r.kills,paused:r.paused,done:r.done,targets:r.targets?.length,log:r.log?.slice(-4)},
          canvas:c&&{connected:c.isConnected,width:c.width,height:c.height},
          title:document.querySelector('.page.is-active .arena-body')?.innerText.slice(0,350)};
      });
      console.log('QUICK_PHASE_TIMEOUT',phase,JSON.stringify(diagnostic));
      report.issues.push({kind:'QUICK_PHASE_TIMEOUT',phase,diagnostic});
      await snap(page,phase+'-timeout');
      throw e;
    }
    const state = await page.evaluate(() => window.__FORGE_ARENA?.run?.phase);
    if (state !== phase) throw Error('未进入 ' + phase + '，实际为 ' + state);
    await body.locator('.quick-choice-overlay .quick-choice-card').first().click({ timeout: 8000 });

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
  const edge = body.locator('.hub-branch').filter({ hasText: '锋刃' });
  assert.ok(await edge.count(), '未出现锋刃流派');
  await edge.click();
  await body.getByRole('button', { name: '开始挑战' }).click();
  await body.locator('.quick-canvas').waitFor({ timeout: 12000 });
  const before = await page.evaluate(async () => {
    const Game=(await import('/src/app/game.js')).default;
    const r=window.__FORGE_ARENA?.run;
    return { task:Game.formalTask() && {kind:Game.formalTask().kind,
      rule:Game.formalTask().rule, sequence:Game.formalTask().sequence},
      stage:r&&{phase:r.phase,mode:r.mode,total:r.total,targets:r.targets?.map(t=>({x:t.x,y:t.y,type:t.type}))},
    };
  });
  console.log('FORMAL_INITIAL',JSON.stringify(before));
  assert.equal(before.task?.kind,'cutting');
  assert.equal(before.task.rule.kind,'sweep');
  assert.ok(before.task.sequence?.length>=6,'正式赛空靶生成');
  assert.equal(before.stage?.total,45,'正式赛没有复用完整45秒切割');
  assert.equal(before.stage?.mode,'formal');
  assert.ok(before.stage.targets.length>=3);
  for (const t of before.stage.targets) {
    await swipe(page, '.page.is-active .quick-canvas',Math.max(.01,t.x-.16),t.y,Math.min(.99,t.x+.16),t.y);
  }
  const after = await page.evaluate(() => {
    const r=window.__FORGE_ARENA.run;
    return {score:r.score,kills:r.kills,progress:r.targets.map(t=>t.progress),
      temporaryDamage:r.damage};
  });
  assert.ok(after.score>0||after.progress.some(x=>x>0),
    '正式赛虽然进入画布，但真实操作没有触发切割');
  console.log('FORMAL_REAL_POINTER',JSON.stringify(after));
  for (const phase of ['route-choice','finale-choice']) {
    await page.waitForFunction(p=>window.__FORGE_ARENA?.run?.phase===p,
      phase,{timeout:65000});
    await body.locator('.quick-choice-overlay .quick-choice-card').first().click({timeout:12000});
  }
  // waitForFunction 的 predicate 必须同步返回布尔值；不能返回 async Promise，
  // 否则 Promise 被当作 truthy，提前在倒计时还没结束时检查成绩。
  await page.waitForFunction(() => {
    const root=document.querySelector('.page.is-active');
    return root?.querySelector('.formal-test-stage')
      || root?.querySelector('.arena-view-quick-report');
  },null,{timeout:70000});
  const result=await page.evaluate(async()=>{
    const Game=(await import('/src/app/game.js')).default;
    return {index:Game.formalMatch.session.index, done:Game.formalMatch.done,
      formId:Game.formalMatch.id, stage:window.__FORGE_ARENA?.run&&{
        phase:window.__FORGE_ARENA.run.phase,done:window.__FORGE_ARENA.run.done,score:window.__FORGE_ARENA.run.score,
        reason:window.__FORGE_ARENA.run.result?.reason
      }, 
      entries:Game.formalMatch.session.entries.map(e=>({kind:e.kind,status:e.status,result:e.result&&{
        score:e.result.score,measure:e.result.raw.measure,detail:e.result.detail
      }})),
      text:document.querySelector('.page.is-active .arena-body')?.innerText.slice(0,500)};
  });
  console.log('FORMAL_FINAL_STATE',JSON.stringify(result));
  assert.equal(result.entries[0].status,'complete','正式赛切割未推进至下项');
  assert.ok(result.entries[0].result.measure>0,'真实切割后操作质量仍是0');
  await snap(page,'09-formal-next-project');
  // 真实点击放弃剩余项，检查完整赛后结算而非无意义的0/0自动结束。
  const abandon=body.getByRole('button',{name:'放弃剩余测试'});
  if(await abandon.count()) await abandon.click();
  await body.locator('.arena-view-quick-report').waitFor({timeout:12000});
  await snap(page,'10-formal-settlement');
  return {before,after,result};
});
report.summary = {
  passed: report.cases.filter(x=>x.status==='PASS').length,
  failed: report.cases.filter(x=>x.status==='FAIL').length,
  jsErrors: report.errors.length, httpFailures:report.httpFailures.length,
};
fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2));
console.log('ARENA_PLAYTEST_SUMMARY', JSON.stringify(report.summary));
console.log('ARENA_PLAYTEST_ISSUES', JSON.stringify(report.issues));
console.log('ARENA_PLAYTEST_ERRORS', JSON.stringify(report.errors));
await browser.close();
if (report.summary.failed || report.summary.jsErrors || report.summary.httpFailures) process.exitCode = 1;
