/** Real WebGL + pointer-flow acceptance for the spatial UI. Uses isolated saves only. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable, baseUrl } from './lib/browser.mjs';
import { sampleBlade } from './arena-v3-simulate.mjs';
const out = path.resolve(process.env.UI_QA_OUT || 'spatial-ui-evidence');
fs.mkdirSync(out, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'] });
const report = { cases: [], errors: [], failures: [], testedAt: new Date().toISOString() };
let current;
async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), timeout: 20000 }); }
async function check(name, fn) {
  try { const detail = await fn(); report.cases.push({ name, ok: true, detail }); console.log('PASS', name); }
  catch (e) { report.cases.push({ name, ok: false, error: String(e.stack) }); throw e; }
}
async function fit(page, selector) {
  const b = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(b && b.width > 0 && b.height > 0, selector + ' missing');
  assert.ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1, JSON.stringify({selector,b,viewport}));
  return b;
}
async function centered(page, selector) {
  await page.waitForFunction(selector => { const n=document.querySelector(selector); if(!n)return false; const b=n.getBoundingClientRect(); return Math.abs(b.x+b.width/2-innerWidth/2)<3 && Math.abs(b.y+b.height/2-innerHeight/2)<3; },selector,{timeout:4000});
  // Geometry alone passes while the 220ms modal entrance is still transparent.
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector);
    const overlay = node?.closest('.sheet-mask, .quick-choice-overlay');
    return overlay && Number(getComputedStyle(overlay).opacity) >= .95;
  }, selector, {timeout:4000});
  const b = await fit(page, selector), v = page.viewportSize();
  assert.ok(Math.abs(b.x + b.width / 2 - v.width / 2) < 3, 'dialog horizontal center');
  assert.ok(Math.abs(b.y + b.height / 2 - v.height / 2) < 3, 'dialog vertical center');
  return b;
}
async function route(page, name) { await page.evaluate(async name => (await import('/src/ui/router.js')).go(name), name); }
try {
  for (const [width, height] of [[390,844],[360,640],[430,932],[1280,900]]) {
    const context = await browser.newContext({ viewport: {width,height}, locale:'zh-CN', deviceScaleFactor:1,
      isMobile:width<500, hasTouch:true });
    const identity = {knifeType:'knife_tangdao',knifeTypeId:'tangdao',rarity:'rare',rarityName:'稀有',qualityName:'精制',history:[],seed:123};
    const blades = [{...sampleBlade(150),...identity,tags:{cold:4,precision:2},score:320,bladeName:'冷镜唐刀'}, {...sampleBlade(100),...identity,id:'spatial-b',score:220,bladeName:'拉丝唐刀'}];
    await context.addInitScript(blades => { if (!localStorage.getItem('bladeforge.save')) localStorage.setItem('bladeforge.save', JSON.stringify({version:1,cr:2000,collection:blades,settings:{tutorialSeen:true,sound:false,motion:'reduced'}})); }, blades);
    const page = current = await context.newPage();
    page.on('pageerror', e => report.errors.push({width,error:String(e)}));
    page.on('console', m => { if(m.type()==='error' && !m.text().includes('favicon')) report.errors.push({width,error:m.text()}); });
    page.on('response', r => { if(r.status()>=400) report.failures.push({width,status:r.status(),url:r.url()}); });
    await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:120000});
    await check(`${width}: home, real GL and no goal card`,async()=>{
      const detail = await page.evaluate(async()=>({webgl:(await import('/src/platform/env.js')).env.hasWebGL,prep:window.__FORGE_PREP,
        canvas:!!document.querySelector('#homeStage canvas'),overflow:document.documentElement.scrollWidth>innerWidth}));
      assert.ok(detail.webgl && detail.canvas,'real WebGL required');
      assert.equal(detail.prep.problems.length,0);
      assert.equal(detail.overflow,false);
      assert.equal(await page.locator('.home-goal').count(),0);
      await fit(page,'.home-start'); await shot(page,`${width}-home`);
      return {webgl:detail.webgl,prepMs:detail.prep.elapsedMs};
    });
    await check(`${width}: centered glass modal and keyboard escape`,async()=>{
      await page.getByRole('button',{name:'设置',exact:true}).click();
      const b = await centered(page,'.sheet');
      assert.ok(await page.locator('#app').evaluate(n=>n.inert));
      await page.getByRole('button',{name:'关闭',exact:true}).press('Shift+Tab');
      assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.sheet')));
      await shot(page,`${width}-settings`);
      await page.keyboard.press('Escape');
      await page.locator('.sheet-mask').waitFor({state:'detached'});
      assert.equal(await page.locator('#app').evaluate(n=>n.inert),false);
      return b;
    });
    await page.getByRole('button',{name:'开始锻刀',exact:true}).click();
    await page.locator('.dcard').first().waitFor({timeout:45000});
    await check(`${width}: preview is reversible and CTA always visible`,async()=>{
      await fit(page,'.page.is-active .actions .btn--primary');
      const cards = page.locator('.page.is-active .dcard');
      for(let i=0;i<3;i++) await fit(page,`.page.is-active .dcard:nth-child(${i+1})`);
      const before = await page.evaluate(async()=>JSON.stringify((await import('/src/app/game.js')).default.run.ledger));
      await cards.first().click();
      await page.locator('.stage-preview:not([hidden])').waitFor();
      assert.ok(await cards.first().getAttribute('aria-pressed')==='true');
      assert.equal(await page.evaluate(async()=>JSON.stringify((await import('/src/app/game.js')).default.run.ledger)),before);
      // Card faces carry strategy only; precise before/after numbers live on the preview rail.
      assert.equal(await cards.first().locator('.dcard-dirs,.chip--risk').count(),0);
      assert.equal(await page.locator('.stat-grid.is-comparing .stat-cell').count(),6);
      const riskText=await page.locator('.forge-rail .risk-value').innerText();
      assert.ok(riskText.includes('→'), 'risk delta should show before and after');
      await page.locator('.stage-traits').click();
      await centered(page,'.sheet');
      assert.ok(await page.locator('.sheet .build-entry').count()>=1);
      await shot(page,`${width}-forge-build`);
      await page.keyboard.press('Escape');await page.locator('.sheet-mask').waitFor({state:'detached'});
      await cards.first().click();
      assert.ok(await page.getByRole('button',{name:'选择工艺卡',exact:true}).isDisabled());
      await cards.nth(1).click();
      await page.getByRole('button',{name:/详情$/}).nth(1).click();
      await centered(page,'.sheet');
      await page.keyboard.press('Escape');await page.locator('.sheet-mask').waitFor({state:'detached'});
      await shot(page,`${width}-forge-preview`);
      const stage=await page.locator('#forgeStage').boundingBox();
      return {stageRatio:stage.height/(height-62)};
    });
    if(width===390) {
      await check('S1-S9 actual selections, S4 hit and S7 trace to archived appraisal',async()=>{
        // Deterministic app-created fixture. Every stage is then driven by actual DOM/pointer inputs.
        await page.evaluate(async()=>{ const G=(await import('/src/app/game.js')).default; G.startForge({seed:123}); await G.prewarmCandidates(); (await import('/src/ui/pages/forge.js')).render(); });
        for(let i=0;i<14;i++) {
          const state=await page.evaluate(async()=>{const r=(await import('/src/app/game.js')).default.run;return {phase:r.phase,index:r.stageIndex,candidates:r.candidates?.map(c=>({id:c.id,risk:c.riskDeltaPoints||0}))};});
          if(state.phase==='appraise'||state.phase==='fractured')break;
          await fit(page,'#forgeStage');
          if(state.phase==='select') {
            const c=state.candidates.sort((a,b)=>a.risk-b.risk)[0];
            await page.locator(`[data-card-id="${c.id}"]`).click();
            await fit(page,'.page.is-active .actions .btn--primary');
            await shot(page,`flow-s${state.index+1}`);
            await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();
          } else if(state.phase==='hammer') {
            await page.locator('.hammer-stage-hit').click({position:{x:100,y:130}});
            await shot(page,'flow-hammer');
            await page.getByRole('button',{name:/收手/}).click();
          } else if(state.phase==='edge') {
            await page.waitForTimeout(850);
            const points=await page.evaluate(async()=>{
              const s=(await import('/src/render/index.js')).getStage();
              return (await import('/src/ui/bladeEdgeProjection.js')).bladeContourProjection(
                s,document.querySelector('#forgeStage').clientWidth,document.querySelector('#forgeStage').clientHeight);
            });
            assert.ok(points?.length===48,'actual 3D blade projection required');
            const b=await page.locator('.edge-stage-canvas').boundingBox();
            await page.mouse.move(b.x+points[0].x,b.y+points[0].y);
            await page.mouse.down();
            for(let j=1;j<points.length;j++)
              await page.mouse.move(b.x+points[j].x,b.y+points[j].y,{steps:3});
            await page.mouse.up();await shot(page,'flow-edge');
            await page.getByRole('button',{name:'完成开刃'}).click();
          }
        }
        await page.locator('.page[data-page="appraise"].is-active').waitFor({timeout:45000});
        await page.locator('.ap-skip').waitFor({state:'detached',timeout:10000});
        const rec=await page.evaluate(async()=>(await import('/src/app/game.js')).default.record);
        assert.ok(rec&&!rec.fractured,'seed must complete a real blade');
        await fit(page,'.ap-try');await shot(page,'390-appraise');
        assert.equal(await page.locator('.ap-sec[data-step="top"] .ap-final-score').count(),1);
        assert.equal(await page.locator('.ap-stat-v.is-score').innerText(),String(rec.score));
        await page.reload();await page.waitForFunction(()=>window.__FORGE_PREP?.ready,null,{timeout:120000});
        const found=await page.evaluate(async id=>(await import('/src/core/progress.js')).collection().some(b=>b.id===id),rec.id);
        assert.ok(found,'archive survives refresh');
        return {score:rec.score,edge:rec.edge?.tier};
      });
    }
    await check(`${width}: collection cards, compare selection, modal`,async()=>{
      await page.evaluate(async()=>(await import('/src/ui/pages/workshop.js')).openTab('collection'));
      await page.locator('.ws-collection-grid').waitFor();
      // A green test must show real archived PBR knives, not unfinished loading labels.
      await page.waitForFunction(() => {
        const thumbs = [...document.querySelectorAll('.ws-collection-grid .blade-thumb')].slice(0, 2);
        return thumbs.length === 2 && thumbs.every(n => n.dataset.state === 'ready'
          && n.querySelector('img.blade-thumb-image')?.complete
          && n.querySelector('img.blade-thumb-image')?.naturalWidth > 0);
      }, null, { timeout: 70000 });
      const readyThumbnails = await page.locator('.ws-collection-grid .blade-thumb[data-state="ready"] img').count();
      assert.ok(readyThumbnails >= 2, 'two real collection thumbnails must render before visual acceptance');
      await shot(page,`${width}-collection`);
      const columns=await page.locator('.ws-collection-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
      assert.equal(columns,2);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'collection must not overflow the viewport');
      await page.getByRole('button',{name:'加入比较',exact:true}).first().click();
      await page.getByRole('button',{name:'加入比较',exact:true}).first().click();
      // Compare selection re-renders every card; cached thumbnails must survive detached DOM mounting.
      await page.waitForFunction(() => {
        const thumbs = [...document.querySelectorAll('.ws-collection-grid .blade-thumb')].slice(0, 2);
        return thumbs.length === 2 && thumbs.every(n => n.dataset.state === 'ready'
          && n.querySelector('img.blade-thumb-image')?.complete
          && n.querySelector('img.blade-thumb-image')?.naturalWidth > 0);
      }, null, {timeout:8000});
      await page.getByRole('button',{name:'比较这两把',exact:true}).click();
      await centered(page,'.sheet');await shot(page,`${width}-compare`);
      await page.keyboard.press('Escape');await page.locator('.sheet-mask').waitFor({state:'detached'});
    });
    await check(`${width}: arena modes and centered augment`,async()=>{
      await page.evaluate(async()=>(await import('/src/ui/pages/arena.js')).openTournament());
      await shot(page,`${width}-arena`);
      await page.evaluate(async()=>(await import('/src/ui/pages/arena.js')).openQuickChallenge('mean-150'));
      await page.getByRole('button',{name:'开始自由快赛',exact:true}).click();
      await page.locator('[data-augment-id]').first().waitFor();
      await centered(page,'.quick-choice-panel');
      await shot(page,`${width}-augment`);
      const before=await page.evaluate(()=>window.__FORGE_ARENA.run.elapsed);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>window.__FORGE_ARENA.run.elapsed),before);
      await page.locator('[data-augment-id]').first().click();
      await page.locator('.quick-choice-overlay').waitFor({state:'detached'});
      await fit(page,'.quick-hud');
      const traitsView = await page.evaluate(() => ({
        id: window.__FORGE_ARENA?.run?.blade?.id,
        params: window.__FORGE_ARENA?.run?.params?.forgeTraits,
        ribbon: !!document.querySelector('.quick-forge-skills'),
      }));
      assert.ok(traitsView.ribbon && traitsView.params?.length >= 2,
        'cutting arena must show acquired forging traits: ' + JSON.stringify(traitsView));
      await shot(page,`${width}-cutting`);
      await page.getByRole('button',{name:'暂停',exact:true}).click();
      await centered(page,'.quick-choice-panel');
      await page.getByRole('button',{name:/继续挑战/}).click();
      assert.equal(await page.locator('.quick-choice-overlay').count(),0);
    });
    await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);
} catch(e) {
  report.failure=String(e.stack);process.exitCode=1;console.error(report.failure);
  if(current)await shot(current,'failure').catch(()=>{});
} finally {
  report.ok=!report.failure;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
}
