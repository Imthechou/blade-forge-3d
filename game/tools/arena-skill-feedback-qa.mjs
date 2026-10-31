/** Real Chromium input: transient skill feedback must expire without another hit. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable,baseUrl} from './lib/browser.mjs';
import {sampleBlade} from './arena-v3-simulate.mjs';
const out=path.resolve(process.env.ARENA_QA_OUT||'arena-skill-evidence');fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={engine:'Chromium software WebGL, simulated mobile; no physical device',cases:[],errors:[]};
try {
 for(const width of [320,375]) {
  const context=await browser.newContext({viewport:{width,height:667},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(blade=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,collection:[blade],settings:{tutorialSeen:true,sound:false,motion:'reduced'}})),{...sampleBlade(150),tags:{precision:4},knifeType:'knife_tangdao',knifeTypeId:'tangdao',seed:123});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(baseUrl);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
  await page.evaluate(async()=>(await import('/src/ui/pages/arena.js')).openTournament());
  await page.getByRole('button',{name:'快速挑战',exact:true}).click();
  await page.getByRole('button',{name:'开始自由快赛',exact:true}).click();
  const canvas=page.locator('.quick-canvas');await canvas.waitFor();
  await page.waitForFunction(()=>__FORGE_ARENA.run.targets.some(t=>t.alive));
  const box=await canvas.boundingBox();
  const target=await page.evaluate(()=>{const t=__FORGE_ARENA.run.targets.find(t=>t.alive);return {x:t.x,y:t.y};});
  await page.mouse.move(box.x+(target.x-.15)*box.width,box.y+target.y*box.height);await page.mouse.down();
  await page.mouse.move(box.x+(target.x+.15)*box.width,box.y+target.y*box.height,{steps:16});await page.mouse.up();
  const proc=page.locator('.quick-forge-activated');await proc.waitFor({state:'visible',timeout:5000});
  const label=await proc.innerText();await page.screenshot({path:path.join(out,`${width}-hit.png`)});
  await page.waitForTimeout(1600);await page.screenshot({path:path.join(out,`${width}-idle.png`)});
  const visible=await proc.isVisible();
  const frameTimes=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];let previous=0;
    const frame=now=>{if(previous)samples.push(now-previous);previous=now;
      if(samples.length<120)requestAnimationFrame(frame);
      else {const sorted=[...samples].sort((a,b)=>a-b);resolve({samples:120,p50:sorted[60],p95:sorted[114],max:sorted.at(-1),fps:1000/(samples.reduce((a,b)=>a+b,0)/samples.length),heapBytes:performance.memory?.usedJSHeapSize??null});}};
    requestAnimationFrame(frame);
  }));
  report.cases.push({width,label,visibleAfter1600ms:visible,frameTimes});
  assert.equal(visible,false,'Transient skill proc must expire while permanent skill chips remain');
  assert.ok(await page.locator('.quick-forge-skill').count());
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
} catch(e){report.failure=String(e.stack);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
