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
   page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(String(e)));
   page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))report.errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)report.requests.push({status:r.status(),url:r.url()});});
   await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__FORGE_PREP?.ready,null,{timeout:120000});
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
     const {bladeEdgeProjection}=await import('/src/ui/bladeEdgeProjection.js');
     return {model:s.modelId,path:bladeEdgeProjection(s,document.querySelector('#forgeStage').clientWidth,document.querySelector('#forgeStage').clientHeight)};
   });
   assert.ok(points.model&&points.path?.length===24,'actual GLB blade projection required');
   await shot(width+'-edge-before');
   const b=await page.locator('.edge-stage-canvas').boundingBox();
   assert.ok(b.height>=240&&b.width>=300);
   await page.mouse.move(b.x+points.path.at(-1).x,b.y+points.path.at(-1).y);
   await page.mouse.down();
   for(let i=22;i>=0;i--)await page.mouse.move(b.x+points.path[i].x,b.y+points.path[i].y,{steps:2});
   await page.mouse.up();await shot(width+'-edge-traced');
   assert.ok(await page.getByRole('button',{name:'完成开刃'}).isEnabled(),'must accept a full 3D trace');
   await page.getByRole('button',{name:'完成开刃'}).click();
   const edge=await page.evaluate(async()=>{const r=(await import('/src/app/game.js')).default.run;
     return {tier:r.edge?.tier,sharpness:r.stats.sharpness,phase:r.phase};});
   assert.equal(edge.tier,'perfect');assert.ok(edge.sharpness>=128);
   report.cases.push({width,model:points.model,edge});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
}catch(e){report.failure=String(e.stack||e);console.error(report.failure);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{report.ok=!report.failure;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
