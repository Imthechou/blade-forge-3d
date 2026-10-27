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
  const fullMotion = label === 'six-target-material-gallery-and-touch-response';
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'zh-CN',
    reducedMotion: fullMotion ? 'no-preference' : 'reduce',
  });
  // 测试存档只在隔离浏览器上下文；永远不写实际玩家存档。
  await context.addInitScript(({record,fullMotion}) => {
    localStorage.setItem('bladeforge.save', JSON.stringify({
      version: 1, cr: 2000, collection: [record],
      settings: { tutorialSeen: true, sound: false,
        motion: fullMotion ? 'full' : 'reduced', hintsSeen: {} },
    }));
  }, {record:blade,fullMotion});
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
      stage:r&&{phase:r.phase,mode:r.mode,total:r.total,
        encounter:r.encounter&&{tier:r.encounter.tier,rank:r.encounter.rank,
          quota:r.encounter.stages.warmup.quota,spawned:r.stageSpawned},
        targets:r.targets?.map(t=>({x:t.x,y:t.y,type:t.type,difficulty:t.difficulty}))},
    };
  });
  console.log('FORMAL_INITIAL',JSON.stringify(before));
  assert.equal(before.task?.kind,'cutting');
  assert.equal(before.task.rule.kind,'sweep');
  assert.equal(before.task.rule.seconds,45,'正式赛规则与实际45秒计时必须一致');
  assert.ok(before.task.sequence?.length>=6,'正式赛空靶生成');
  assert.equal(before.stage?.total,45,'正式赛没有复用完整45秒切割');
  assert.equal(before.stage?.encounter?.tier,'school','流派赛未接入独立关卡配额');
  assert.equal(before.stage.encounter.quota,6,'学徒赛初始投放配额不对');
  assert.ok(before.stage.targets.every(t=>['foam','rope'].includes(t.type)&&t.difficulty===1),
    '学徒赛开场应该仅有固定强度的泡棉/绳束');
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
/**
 * 全国赛 / 三刀巅峰赛并不复用单刀赛的 Game.formalMatch。
 * 这里通过实际 UI 路由 + 真实 PointerEvent 验证各自的赛事派发确实接到共享画布。
 * 完整45秒赛程/正式项目入账在上一条单刀场景已覆盖。
 */
async function assertUnifiedFirstCut(page, label) {
  const stage = page.locator('.page.is-active .quick-canvas');
  await stage.waitFor({timeout:18000});
  const before=await page.evaluate(()=>{
    const r=window.__FORGE_ARENA?.run;
    return r&&{unified:r.unifiedFormalCut,mode:r.mode,total:r.total,kills:r.kills,score:r.score,
      encounter:r.encounter&&{tier:r.encounter.tier,rank:r.encounter.rank,
        quota:r.encounter.stages.warmup.quota,spawned:r.stageSpawned},
      targets:r.targets?.map(t=>({type:t.type,x:t.x,y:t.y,progress:t.progress,difficulty:t.difficulty}))};
  });
  assert.ok(before?.unified && before.mode==='formal' && before.total===45,
    label+' 并未使用正式赛统一切割引擎');
  assert.ok(before.targets?.length>=3,label+' 首帧未投放靶具');
  const expected=label==='全国赛' ? {tier:'national',rank:5,quota:8}
    : {tier:'apex',rank:10,quota:10};
  assert.equal(before.encounter?.tier,expected.tier,label+' 未接赛级');
  assert.equal(before.encounter?.rank,expected.rank,label+' 赛级错误');
  assert.equal(before.encounter?.quota,expected.quota,label+' 初始靶具数配置未生效');
  assert.ok(before.targets.every(t=>t.difficulty===1),label+' 单靶强度被赛事级别修改');
  const t=before.targets[0];
  await swipe(page,'.page.is-active .quick-canvas',Math.max(.02,t.x-.14),t.y,Math.min(.98,t.x+.14),t.y);
  const after=await page.evaluate(()=>{
    const r=window.__FORGE_ARENA?.run;
    return r&&{kills:r.kills,score:r.score,progress:r.targets?.map(t=>t.progress)};
  });
  assert.ok(after && (after.score>before.score||after.progress.some(v=>v>0)),
    label+' 完整画布不能实际切割');
  return {before,after};
}
await scenario('national-opening-real-cut', async page=>{
  const setup=await page.evaluate(async()=>{
    const Game=(await import('/src/app/game.js')).default;
    const P=await import('/src/core/progress.js');
    const id=P.get().collection[0].id;
    const a=Game.startNationalMatch({bladeId:id,seed:243});
    if(!a.ok)return{error:a.reason};
    const b=Game.nationalStartRound();
    if(!b.ok)return{error:b.reason};
    (await import('/src/ui/router.js')).go('arena');
    return {tier:Game.nationalMatch.tier,round:Game.nationalMatch.roundIndex};
  });
  assert.ok(!setup.error,JSON.stringify(setup));
  const result=await assertUnifiedFirstCut(page,'全国赛');
  return {setup,result};
});
await scenario('apex-opening-real-cut', async page=>{
  const setup=await page.evaluate(async()=>{
    const Game=(await import('/src/app/game.js')).default;
    const P=await import('/src/core/progress.js');
    const store=P.get();
    const base=store.collection[0];
    const blades=[base,{...base,id:'arena-apex-blade-2',bladeName:'巅峰测试刀二'},
      {...base,id:'arena-apex-blade-3',bladeName:'巅峰测试刀三'}];
    store.collection=blades;
    P.persist();
    const a=Game.startApexMatch({bladeIds:blades.map(b=>b.id),seed:178});
    if(!a.ok)return{error:a.reason};
    const b=Game.apexDispatch(blades[0].id);
    if(!b.ok)return{error:b.reason};
    (await import('/src/ui/router.js')).go('arena');
    return{tier:Game.apexMatch.tier,round:Game.apexMatch.roundIndex};
  });
  assert.ok(!setup.error,JSON.stringify(setup));
  const result=await assertUnifiedFirstCut(page,'巅峰赛');
  return {setup,result};
});

/** 美术实机验收：只在隔离测试上下文排列六个已有靶具，绝不更改玩家玩法或真实存档。 */
await scenario('six-target-material-gallery-and-touch-response', async page => {
  const body=page.locator('.page[data-page="arena"].is-active');
  await body.getByRole('button',{name:'快速挑战'}).click();
  await body.getByRole('button',{name:'开始自由快赛'}).click();
  await body.locator('.quick-canvas').waitFor({timeout:10000});
  const before=await page.evaluate(async()=>{
    const core=await import('/src/core/arenaChallenge.js');
    const r=window.__FORGE_ARENA.run;
    const sample=r.targets[0];
    const types=['foam','rope','wood','plastic','ice','metal'];
    r.targets=types.map((type,i)=>({
      ...sample,id:'material-gallery-'+i,type,slot:i%3,row:Math.floor(i/3),
      x:[.19,.50,.81][i%3],y:[.34,.58][Math.floor(i/3)],layout:'stream',
      progress:0,alive:true,cuts:[],lastAngle:null,layer:0,variation:0,
      difficulty:1,armorLeft:core.MATERIALS[type].armor*.6,createdAt:r.elapsed,
    }));
    r.nextWaveAt=Number.MAX_SAFE_INTEGER;
    // 美术验收用隔离舞台：避免8秒时的路线选择删除测试摆放的靶具。
    r.phase='finale';r.finale={id:'safe',name:'美术验收',bonus:1};r.elapsed=30.1;r.remaining=14.9;
    return {motion:(await import('/src/platform/motion.js')).mode(),
      names:r.targets.map(t=>core.MATERIALS[t.type].name),
      types:r.targets.map(t=>t.type), targets:r.targets.map(t=>({x:t.x,y:t.y,type:t.type}))};
  });
  await page.waitForFunction(()=>window.__FORGE_SPRITES?.status()?.status==='ready',
    null,{timeout:12000});
  const spriteState=await page.evaluate(()=>window.__FORGE_SPRITES.status());
  assert.equal(spriteState.width,1536);
  assert.equal(spriteState.height,1280);
  await page.waitForTimeout(180);
  await snap(page,'11-six-material-design-gallery');
  const snapshots=[];
  for(const t of before.targets) {
      const {x,y}=t;
      const bb=await page.locator('.page.is-active .quick-canvas').boundingBox();
      assert.ok(bb);
      await page.mouse.move(bb.x+bb.width*Math.max(.01,x-.16),bb.y+bb.height*y);
      await page.mouse.down();
      // 一帧完整横切，立即读取尚未被560ms清理器回收的实际冲击事件。
      await page.mouse.move(bb.x+bb.width*Math.min(.99,x+.16),bb.y+bb.height*y,{steps:1});
      const outcome=await page.evaluate(type=>{
        const r=window.__FORGE_ARENA.run;
        const e=window.__FORGE_ARENA.effects;
        return {type,score:r.score,kills:r.kills,
          contacts:e.bursts.filter(b=>b.type===type).slice(-1).map(b=>({
            flash:b.flashMs,hitstop:b.holdMs,shake:b.shakePx,
            recoil:b.recoilPx,particles:b.particleCount,event:b.event,
          }))};
      },t.type);
      snapshots.push(outcome);
      await page.mouse.up();
  }
  console.log('SIX_MATERIAL_IMPACTS',JSON.stringify(snapshots));
  await snap(page,'12-six-material-slicing-feedback');
  assert.equal(before.types.length,6);
  assert.equal(before.motion,'full','六材命中特效必须在完整动效模式下验收');
  assert.ok(snapshots.every(x=>x.contacts.length>0),'部分材质没有命中特效');
  assert.ok(snapshots.every(x=>x.contacts[0].flash>0),'闪白反馈丢失');
  assert.ok(snapshots.every(x=>x.contacts[0].particles>0),'碎屑反馈丢失');
  return {spriteState,before,snapshots};
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
