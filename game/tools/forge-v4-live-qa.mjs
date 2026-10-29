/** Browser evidence: real GLB S4 hammer and S7 pointer trace in mobile Chromium. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright,browserExecutable,baseUrl } from './lib/browser.mjs';
const out=path.resolve('forge-v4-evidence');fs.mkdirSync(out,{recursive:true});
const report={cases:[],errors:[],requests:[]};
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true,
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
let page;
const shot=async name=>page.screenshot({path:path.join(out,name+'.png'),timeout:30000});
try{
 for(const [width,height] of [[390,844],[360,640]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN'});

   // Deterministic isolated save: avoid bootstrap's delayed (360ms) first-run
   // modal masking the whole forge stage after the initial dismissal check.
   // The UI test suite covers that dialog separately.
   await context.addInitScript(() => {
     if (!localStorage.getItem('bladeforge.save'))
       localStorage.setItem('bladeforge.save',JSON.stringify({
         version:1,cr:0,collection:[],settings:{tutorialSeen:true,sound:false,motion:'reduced'}
       }));
   });
   page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(String(e)));
   page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))report.errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)report.requests.push({status:r.status(),url:r.url()});});
   await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__FORGE_PREP?.ready,null,{timeout:120000});
   // Onboarding is a real modal and intercepts taps; close it before playtesting.
   const guide=page.getByRole('dialog',{name:'新手引导'});
   if(await guide.count())await guide.getByRole('button',{name:'关闭'}).click();
   await page.locator('.sheet-mask').waitFor({state:'detached',timeout:5000}).catch(()=>{});
   await page.evaluate(async()=>{
     const G=(await import('/src/app/game.js')).default;
     const F=await import('/src/core/forge.js');
     G.startForge({seed:123});G.run.rng=()=>.9999;
     for(let i=0;i<4;i++)F.confirmCard(G.run,G.run.candidates[0]);
     (await import('/src/ui/router.js')).go('forge');
     (await import('/src/ui/pages/forge.js')).render();
   });
   await page.locator('.hammer-stage-hit').waitFor({timeout:45000});
   await shot(width+'-hammer-start');
   for(let i=0;i<10;i++)await page.locator('.hammer-stage-hit').click({position:{x:170,y:235},force:true});
   const hammer=await page.evaluate(async()=>{const r=(await import('/src/app/game.js')).default.run;
      return {phase:r.phase,count:r.hammer.count,risk:r.risk.current,gained:r.hammer.statGained};});
   assert.equal(hammer.phase,'hammer');assert.equal(hammer.count,10);
   assert.ok(hammer.gained>=50&&hammer.gained<=80);
   await shot(width+'-hammer-ten');report.cases.push({width,hammer});
   await page.evaluate(async()=>{
     const G=(await import('/src/app/game.js')).default;
     const F=await import('/src/core/forge.js');
     const C=await import('/src/core/cards.js');
     F.endHammer(G.run);
     G.run.stageIndex=6;G.run.stageId='S7';G.run.phase='select';C.rollCandidates(G.run);
     F.confirmCard(G.run,G.run.candidates[0]);
     (await import('/src/ui/pages/forge.js')).render();G.syncStage();
   });
   await page.locator('.edge-stage-canvas').waitFor({timeout:45000});
   await page.waitForTimeout(1100);
   const points=await page.evaluate(async()=>{
     const s=(await import('/src/render/index.js')).getStage();
     const {bladeContourProjection}=await import('/src/ui/bladeEdgeProjection.js');
     return {model:s.modelId,path:bladeContourProjection(s,document.querySelector('#forgeStage').clientWidth,document.querySelector('#forgeStage').clientHeight)};
   });
   assert.ok(points.model&&points.path?.length===48,'actual GLB blade projection required');
   await shot(width+'-edge-before');
   const b=await page.locator('.edge-stage-canvas').boundingBox();
   assert.ok(b.height>=240&&b.width>=300);
   // The new S7 should not punish a short accidental touch or an OS-level
   // cancellation. Each deliberate full pass still counts against three tries.
   await page.mouse.move(b.x+points.path[0].x,b.y+points.path[0].y);
   await page.mouse.down();await page.mouse.up();
   assert.match(await page.locator('.edge-simple-hud').innerText(),/0\\s*\\/\\s*3/,'short touch must not cost an attempt');
   await page.evaluate(({x,y})=>{
     const c=document.querySelector('.edge-stage-canvas'),r=c.getBoundingClientRect();
     const base={bubbles:true,cancelable:true,clientX:r.x+x,clientY:r.y+y,pointerId:77,pointerType:'touch',isPrimary:true};
     c.dispatchEvent(new PointerEvent('pointerdown',base));
     c.dispatchEvent(new PointerEvent('pointercancel',base));
   },points.path[0]);
   assert.match(await page.locator('.edge-simple-hud').innerText(),/0\\s*\\/\\s*3/,'cancelled gesture must not cost an attempt');

   async function trace(){
     await page.mouse.move(b.x+points.path[0].x,b.y+points.path[0].y);
     await page.mouse.down();
     for(let i=1;i<points.path.length;i++)await page.mouse.move(b.x+points.path[i].x,b.y+points.path[i].y,{steps:3});
     await page.mouse.up();
   }
   await trace();await shot(width+'-edge-attempt-1');
   assert.ok((await page.locator('.edge-simple-hint').innerText()).includes('×1.12'));
   const used=width===360?3:1;
   for(let i=2;i<=used;i++){
     await page.getByRole('button',{name:/再描一次/}).click();
     await trace();await shot(width+'-edge-attempt-'+i);
   }
   assert.ok(await page.getByRole('button',{name:'完成开刃'}).isEnabled());
   await page.getByRole('button',{name:'完成开刃'}).click();
   const edge=await page.evaluate(async()=>{
     const r=(await import('/src/app/game.js')).default.run;
     return {fit:r.edge?.fit,sharp:r.edge?.sharp,multiplier:r.edge?.multiplier,attempts:r.edge?.attempts};
   });
   assert.ok(edge.fit>.8,'real contour must be traceable with mouse/touch');
   assert.equal(edge.attempts,used);assert.equal(edge.multiplier,used===1?1.12:1);
   assert.ok(edge.sharp>75);
   report.cases.push({width,model:points.model,edge});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
}catch(e){report.failure=String(e.stack||e);console.error(report.failure);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{report.ok=!report.failure;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
