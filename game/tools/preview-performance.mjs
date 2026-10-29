/** Compare identical warmed card previews against main on the same CI machine. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from './lib/browser.mjs';
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const results=[];
try {
 for(const [name,url] of [['main','http://127.0.0.1:8124/'],['pr','http://127.0.0.1:8123/']]) {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,settings:{tutorialSeen:true,sound:false,motion:'reduced'}})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
  await page.evaluate(async()=>{const G=(await import('/src/app/game.js')).default;G.startForge({seed:123});await G.prewarmCandidates();(await import('/src/ui/router.js')).go('forge');});
  const samples=[],ids=[];
  for(let i=0;i<18;i++) {
   const result=await page.evaluate(async index=>{const card=document.querySelectorAll('.dcard')[index%3],id=card.dataset.cardId,start=performance.now();card.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {id,ms:performance.now()-start};},i);
   ids.push(result.id);if(i>=6)samples.push(result.ms);
  }
  const sorted=samples.slice().sort((a,b)=>a-b);results.push({name,cardIds:[...new Set(ids)],p50:sorted[6],p95:sorted[11],samples,errors});
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.deepEqual(results[0].cardIds,results[1].cardIds);
 // SwiftShader is CPU rendering, not a phone frame-rate claim. Allow scheduling noise.
 const out=path.resolve('unified-ux-evidence');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview-performance.json'),JSON.stringify({method:'same runner, same seed/cards, two RAFs after DOM click, six warmups; CPU SwiftShader, DPR1',results},null,2));
 console.log(JSON.stringify(results.map(({name,p50,p95})=>({name,p50,p95}))));
 assert.ok(results[1].p50<=Math.max(150,results[0].p50*1.5),'material preview median regressed');
}finally{await browser.close();}
