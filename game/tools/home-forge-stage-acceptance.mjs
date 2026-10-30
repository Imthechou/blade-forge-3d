/** Focused WebGL + Playwright regression for home and forge stage UI. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable, baseUrl } from './lib/browser.mjs';

const output = path.resolve('home-forge-stage-evidence');
fs.mkdirSync(output, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  executablePath: browserExecutable(), headless: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage','--ignore-gpu-blocklist'],
});
const report = { cases: [], errors: [], requests: [], testedAt: new Date().toISOString() };
let page;
const capture = async name => page.screenshot({ path: path.join(output, name + '.png'), timeout: 25000 });
const check = async (name, fn) => {
  const detail = await fn();
  report.cases.push({ name, ok: true, detail });
  console.log('PASS', name);
};
const camera = async () => page.evaluate(async () => {
  const stage = (await import('/src/render/index.js')).getStage();
  return stage.viewer?.camera?.position.toArray() ?? null;
});
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const awaitModel = async () => {
  await page.evaluate(async () => {
    const s = (await import('/src/render/index.js')).getStage();
    await s.waitForModel();
    if (s.viewer?._compilePromise) await s.viewer._compilePromise;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(async () => {
    const s = (await import('/src/render/index.js')).getStage();
    return !!s.viewer?.root && s.viewer.renderer.info.render.triangles > 0;
  }, null, { timeout: 90000 });
};

try {
  for (const [w,h] of [[390,844],[320,568]]) {
    const context = await browser.newContext({
      viewport: {width:w, height:h}, isMobile:true, hasTouch:true,
      deviceScaleFactor:1, locale:'zh-CN', reducedMotion:'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('bladeforge.save', JSON.stringify({
        version:1, cr:1000, settings:{ tutorialSeen:true, sound:false, motion:'reduced' },
      }));
    });
    page = await context.newPage();
    page.on('pageerror', err => report.errors.push({width:w,error:String(err)}));
    page.on('console', msg => {
      if (msg.type() === 'error') report.errors.push({width:w,error:msg.text()});
    });
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('favicon'))
        report.requests.push({width:w,url:response.url(),status:response.status()});
    });

    // A hash left behind by an old unfinished forge must not render a ghost-Tangdao page.
    await page.goto(baseUrl + '#/forge', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__FORGE_PREP?.ready && !document.querySelector('#boot'), null, {timeout:120000});
    await check(w + ': stale forge route and home navigation', async () => {
      assert.equal(await page.locator('.page[data-page="home"].is-active').count(), 1);
      assert.equal(await page.evaluate(() => location.hash), '#/home');
      assert.equal(await page.locator('.home-entry-btn').count(), 3);
      assert.equal(await page.getByRole('button', {name:'图鉴',exact:true}).count(), 0);
      await page.getByRole('button',{name:'工坊',exact:true}).click();
      await page.getByRole('tab', {name:'图鉴',exact:true}).waitFor({timeout:15000});
      assert.equal(await page.locator('.page[data-page="workshop"] [role="tab"]').count(), 4);
      assert.equal(await page.getByRole('tab',{name:'图鉴',exact:true}).count(), 1);
      await page.getByRole('button',{name:'返回首页',exact:true}).click();
      assert.equal(await page.locator('.forge-pad > .btn').count(), 0);
      const visual = await page.locator('.home-showcase').evaluate(node => getComputedStyle(node, '::after').content);
      assert.ok(visual === 'none' || visual === 'normal', 'oval pseudo-element should be absent: ' + visual);
      return { entryButtons:3, oval:visual };
    });
    await capture(w + '-home');

    await page.getByRole('button',{name:'开始锻刀',exact:true}).click();
    await page.locator('.dcard').first().waitFor({timeout:120000});
    await awaitModel();
    await check(w + ': stage chips, free orbit, reset control', async () => {
      assert.equal(await page.locator('.stage-badge b').innerText(),'01');
      assert.equal(await page.locator('.stage-badge span').innerText(),'开炉配方');
      assert.equal(await page.locator('.stage-question').count(),0);
      assert.match(await page.locator('.stage-badge i').innerText(),/1\/2.*原料/);
      assert.equal(await page.locator('#forgeStage .stage-inspect-reset').count(),1);
      assert.equal(await page.locator('.stage-inspect-toggle').count(),0);
      const chips = await page.locator('.stage-badge,.stage-traits').evaluateAll(
        nodes => nodes.map(n => {const b=n.getBoundingClientRect();return {y:b.y,height:b.height};}));
      assert.equal(chips.length,2);
      // 五屏状态下配方直选按钮占据上缘：短屏允许辅助 chip 换行，但不能覆盖模型操作。
      assert.ok(chips.every(x => x.y>=0&&x.height>=32), JSON.stringify(chips));
      assert.equal(await page.locator('.stage-progress .sp-dot').count(),5);
      const live = await page.evaluate(async()=> {
        const stage=(await import('/src/render/index.js')).getStage();
        return {rotate:stage.viewer.controls.enableRotate,zoom:stage.viewer.controls.enableZoom,
          touch:stage.viewer.renderer.domElement.style.touchAction};
      });
      assert.ok(live.rotate && live.zoom && live.touch === 'none', JSON.stringify(live));
      return {chips,live};
    });
    await capture(w + '-forge-initial');

    const before = await camera();
    const stageBox = await page.locator('#forgeStage canvas').boundingBox();
    assert.ok(before && stageBox);
    await page.mouse.move(stageBox.x+stageBox.width*.45,stageBox.y+stageBox.height*.5);
    await page.mouse.down();
    await page.mouse.move(stageBox.x+stageBox.width*.75,stageBox.y+stageBox.height*.63,{steps:15});
    await page.mouse.up();
    await page.waitForTimeout(220); // allow OrbitControls damping to settle
    const moved = await camera();
    assert.ok(distance(before,moved)>.05, '3D orbit did not respond to dragging');
    await capture(w + '-dragged');
    await page.getByRole('button',{name:'复位3D刀具视角'}).click();
    await page.waitForTimeout(220);
    const reset = await camera();
    assert.ok(distance(before,reset)<.3, 'reset should restore the current stage camera preset');
    report.cases.push({name:w+': drag then reset',ok:true,delta:distance(before,moved),residual:distance(before,reset)});
    await capture(w + '-reset');

    await page.locator('.dcard').first().click();
    await awaitModel();
    await check(w + ': card preview is bar-only, with no value row', async () => {
      const grid = page.locator('.stat-grid.is-comparing');
      assert.equal(await grid.count(),1);
      assert.equal(await grid.locator('.stat-cell-val').count(),0);
      assert.equal(await grid.locator('.stat-cell-meter').count(),6);
      const contents=await grid.locator('.stat-cell-meter i').evaluateAll(nodes => nodes.map(
        el => getComputedStyle(el).width));
      return {bars:contents};
    });
    await capture(w + '-card-preview');
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.requests,[]);
} catch(err) {
  report.failure=String(err.stack||err);
  console.error(report.failure);
  process.exitCode=1;
  if(page) await capture('failure').catch(()=>{});
} finally {
  fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(report,null,2));
  await browser.close();
}
