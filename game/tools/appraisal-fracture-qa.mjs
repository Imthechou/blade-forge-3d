import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable,baseUrl} from './lib/browser.mjs';
const out=process.env.FRACTURE_QA_OUT||'unified-ux-evidence/fracture-live';fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright(),browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:320,height:667},isMobile:true,hasTouch:true});
await context.addInitScript(()=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,settings:{tutorialSeen:true,sound:false,motion:'reduced'}})));
const page=await context.newPage(),report={errors:[],actions:[]};page.on('pageerror',e=>report.errors.push(String(e)));
try{
 await page.goto(baseUrl);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
 await page.evaluate(async()=>{const G=(await import('/src/app/game.js')).default;G.startForge({seed:12});(await import('/src/ui/router.js')).go('forge');});
 for(let i=0;i<35;i++){
  const state=await page.evaluate(async()=>{const r=(await import('/src/app/game.js')).default.run;return {phase:r.phase,fractured:r.fractured,stage:r.stageIndex,count:r.hammer?.count,card:[...r.candidates].sort((a,b)=>(b.riskDeltaPoints||0)-(a.riskDeltaPoints||0))[0]?.id};});report.actions.push(state);
  if(state.fractured){await page.waitForTimeout(1200);report.fractured=state;break;}
  if(state.phase==='select'){await page.locator(`[data-card-id="${state.card}"]`).click();await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();}
  else if(state.phase==='hammer'){await page.locator('.hammer-stage-hit').click();await page.waitForTimeout(100);}
  else throw Error('Unexpected phase '+state.phase);
 }
 assert.ok(report.fractured,'Seeded high-risk UI forge must fracture');assert.deepEqual(report.errors,[]);
 for(const width of [320,375]){
  await page.setViewportSize({width,height:667});
  await page.screenshot({path:out+'/'+width+'-fractured.png'});
  const bounds=await page.locator('.ap-actions .btn').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,x:r.x,right:r.right,height:r.height,scroll:n.scrollWidth,client:n.clientWidth};}));
  assert.equal(bounds.length,2);
  assert.ok(bounds.every(b=>b.x>=0&&b.right<=width&&b.height>=44&&b.scroll<=b.client),JSON.stringify(bounds));
  report['buttons'+width]=bounds;
 }
 await page.getByRole('button',{name:'再锻一把',exact:true}).click();
 await page.locator('.dcard').first().waitFor({timeout:60000});
 assert.equal(await page.evaluate(async()=>(await import('/src/app/game.js')).default.run.stageIndex),0);
 report.reforgeStarted=true;
}catch(e){report.failure=String(e.stack);console.error(report.failure);process.exitCode=1;await page.screenshot({path:out+'/failure.png'});}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
