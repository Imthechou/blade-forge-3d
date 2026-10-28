/** V3 actual browser/PointerEvent acceptance; virtual clock only accelerates secondary cases. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadPlaywright,browserExecutable} from './lib/browser.mjs';
import {sampleBlade} from './arena-v3-simulate.mjs';
const {chromium}=await loadPlaywright();
const out=path.resolve(process.env.ARENA_QA_OUT || 'arena-playtest');fs.mkdirSync(out,{recursive:true});
let server=null;
const base=process.env.FORGE_URL || 'http://127.0.0.1:8123/';
if(!process.env.FORGE_URL) {
  const {createGameServer}=createRequire(import.meta.url)('../serve.cjs');server=createGameServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8123,'127.0.0.1',resolve);});
}
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const report={version:'arena-3',cases:[],errors:[],requestFailures:[]};
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),timeout:15000});}
async function newGame(name,{width=390,height=844,virtual=true}={}) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2,recordVideo:{dir:path.join(out,'videos'),size:{width,height}},locale:'zh-CN',reducedMotion:'reduce'});
  const records=[sampleBlade(150),{...sampleBlade(150),id:'blade-b',bladeName:'破甲刀'},{...sampleBlade(150),id:'blade-c',bladeName:'综合刀'}];
  await context.addInitScript(records=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,cr:2000,collection:records,settings:{tutorialSeen:true,sound:false,motion:'reduced',hintsSeen:{}}})),records);
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({name,error:String(e)}));
  page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))report.requestFailures.push({name,url:r.url(),error:r.failure()?.errorText});});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{const boot=document.querySelector('#boot');return document.querySelector('.page[data-page="home"]')&&(!boot||boot.classList.contains('is-gone'));},null,{timeout:60000});
  await page.evaluate(async()=> (await import('/src/ui/router.js')).go('arena'));
  if(virtual){await page.clock.install({time:new Date('2026-10-28T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-28T00:00:00.200Z'));}
  return {page,context,virtual};
}
async function choose(page,virtual) {
  const cards=page.locator('[data-augment-id]');
  if(await cards.count()) {
    const data=await page.evaluate(()=>({elapsed:__FORGE_ARENA.run.elapsed,health:__FORGE_ARENA.run.health,types:__FORGE_ARENA.run.offers}));
    if(virtual)await page.clock.fastForward(600);else await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.elapsed),data.elapsed);
    const preference=['sanmai','tempering','smithsoul','unbroken','cladsteel','pickings','whetstone','quenchheat','noself','layerbreak','weakmap','longblade','piercing'];
    const selected=[...data.types].sort((a,b)=>(preference.indexOf(a)<0?99:preference.indexOf(a))-(preference.indexOf(b)<0?99:preference.indexOf(b)))[0];
    await page.locator(`[data-augment-id="${selected}"]`).click({force:true});
    if(virtual)await page.clock.fastForward(20);
    return true;
  }
  return false;
}
async function pointerCut(page) {
  const state=await page.evaluate(()=>{
    const r=globalThis.__FORGE_ARENA?.run;
    if(!r||r.done||r.phase.endsWith('-choice'))return null;
    const t=r.targets.filter(t=>t.alive && (r.health>r.maxHealth*.45 || t.type==='foam'||t.type==='rope')).sort((a,b)=>({foam:50,rope:70,wood:160,plastic:220,ice:250,metal:460}[b.type]-{foam:50,rope:70,wood:160,plastic:220,ice:250,metal:460}[a.type]))[0];
    return t?{target:t,elapsed:r.elapsed,rowTargets:r.targets.filter(n=>n.alive && Math.abs(n.y-t.y)<.012).length,healthy:r.health>r.maxHealth*.5}:null;
  });
  if(!state)return;
  const {target:t}=state;
  const angle={foam:Math.PI*.77,rope:0,wood:Math.PI*.47,plastic:0,ice:Math.PI*.25,metal:0}[t.type];
  const box=await page.locator('.quick-canvas').boundingBox();assert.ok(box?.height>50);
  const p=(d)=>[box.x+(t.x+Math.cos(angle)*d)*box.width,box.y+(t.y+Math.sin(angle)*d)*box.height];
  const row=angle===0 && state.rowTargets>1 && state.healthy;
  const start=row?[box.x+box.width*.02,box.y+box.height*t.y]:p(-.13);
  const end=row?[box.x+box.width*.98,box.y+box.height*t.y]:p(.13);
  await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(...end,{steps:row?18:5});await page.mouse.up();
}
async function playRound(page,virtual,{capture=false}={}) {
  await page.locator('.quick-canvas').waitFor();
  let loops=0,firstRunId=null;
  while(loops++<350) {
    if(virtual)await page.clock.fastForward(35);else await page.waitForTimeout(30);
    const state=await page.evaluate(()=>{const r=globalThis.__FORGE_ARENA?.run;return r?{id:r.id,done:r.done,elapsed:r.elapsed,phase:r.phase}:null;});
    if(!state)throw Error('Missing arena run');
    firstRunId ||=state.id;
    if(state.id!==firstRunId)break;
    if(state.done)break;
    if(await choose(page,virtual))continue;
    await pointerCut(page);
    if(capture&&loops===8)await screenshot(page,'v3-stage');
    if(virtual)await page.clock.fastForward(220);
  }
  const r=await page.evaluate(()=>globalThis.__FORGE_ARENA?.run?.result);
  assert.ok(r,'No settled round');assert.equal(r.total,45);assert.equal(r.choicesMade,3);assert.equal(r.reason,'time',JSON.stringify({score:r.score,health:r.health,kills:r.kills,log:r.log.slice(-3)}));
  assert.ok(r.kills>20);assert.ok(r.metrics.emptySeconds<1);
  assert.equal(await page.locator('.quick-canvas').count(),0,'result still showing running canvas');
  return r;
}
async function scenario(name,fn,options) {
  if(process.env.ARENA_CASE && !new RegExp(process.env.ARENA_CASE).test(name))return;
  const env=await newGame(name,options);
  try{const data=await fn(env);report.cases.push({name,status:'PASS',data});console.log('PASS',name,JSON.stringify(data));}
  catch(error){report.cases.push({name,status:'FAIL',error:String(error.stack)});await screenshot(env.page,name+'-failure').catch(()=>{});console.error('FAIL',name,String(error));}
  finally{await env.context.close();}
}
try {
  await scenario('quick-45s-real-pointer',async({page,virtual})=>{
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});
    await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    if(virtual)await page.clock.fastForward(30);else await page.waitForTimeout(150);
    await screenshot(page,'v3-augment');
    const r=await playRound(page,virtual,{capture:true});
    await screenshot(page,'v3-quick-report');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bladeforge.save')));
    assert.ok(stored.quickChallengeRecords.byChallenge['quick:v3:free']);
    return {score:r.score,kills:r.kills,choices:r.choicesMade,empty:r.metrics.emptySeconds};
  },{virtual:process.env.ARENA_REALTIME==='1'?false:true});
  await scenario('school-six-branches',async({page,virtual})=>{
    const results=[];
    for(const branch of ['锻压','锋刃','精密','淬彩','复合','过载']) {
      await page.getByRole('button',{name:new RegExp('^'+({锻压:'锤',锋刃:'刃',精密:'准',淬彩:'彩',复合:'复',过载:'载'}[branch]))}).filter({hasText:branch}).click({force:true});
      await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
      const r=await playRound(page,virtual);
      assert.ok(await page.getByText('分项成绩（权重来自赛事定义）').count());
      results.push({branch,score:r.score,choices:r.choicesMade});
      await page.getByRole('button',{name:'再打一场',exact:true}).click({force:true});
    }
    return results;
  });
  await scenario('national-five-rounds',async({page,virtual})=>{
    await page.getByRole('button',{name:'全国大赛',exact:true}).click({force:true});
    // Player entry uses the same Game orchestration; no fabricated scores or direct core mutation.
    const launch=page.getByRole('button',{name:/开始.*全国|参加.*全国|开始本届/}).last();
    if(await launch.count())await launch.click({force:true});else throw Error('National launch button missing: '+await page.locator('.arena-body').innerText());
    const results=[];
    for(let i=0;i<5;i++) {
      const button=page.getByRole('button',{name:/开始第.*轮/}).last();
      await button.click({force:true});
      const r=await playRound(page,virtual);results.push({score:r.score,choices:r.choicesMade});
      const m=await page.evaluate(async()=>(await import('/src/app/game.js')).default.nationalMatch);
      assert.ok(!m.done||m.result.champion,'national bot eliminated at '+i);
    }
    await screenshot(page,'v3-national-report');return results;
  });
  await scenario('apex-three-blades',async({page,virtual})=>{
    await page.getByRole('button',{name:'三刀巅峰',exact:true}).click({force:true});
    for(const name of ['均值150','破甲刀','综合刀'])await page.locator('.arena-team-list button').filter({hasText:name}).click({force:true});
    await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
    const results=[];
    for(let i=0;i<3;i++) {
      const button=page.locator('.arena-team-list button').first();await button.click({force:true});
      const r=await playRound(page,virtual);results.push({score:r.score,choices:r.choicesMade});
    }
    const m=await page.evaluate(async()=>(await import('/src/app/game.js')).default.apexMatch);
    assert.equal(m.usedBladeIds.length,3);assert.equal(new Set(m.usedBladeIds).size,3);assert.equal(m.result.rounds,3);
    await screenshot(page,'v3-apex-report');return results;
  });
  await scenario('small-screen-choice-pause-resume',async({page,virtual})=>{
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    await page.clock.fastForward(40);await screenshot(page,'v3-small-choice');
    assert.equal(await page.locator('[data-augment-id]').count(),3);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await choose(page,virtual);
    await page.getByRole('button',{name:'暂停',exact:true}).click({force:true});
    const at=await page.evaluate(()=>__FORGE_ARENA.run.elapsed);await page.clock.fastForward(1500);assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.elapsed),at);
    await page.locator('.quick-pause-overlay .quick-choice-card').first().click({force:true});await page.clock.fastForward(35);await page.clock.fastForward(300);
    assert.ok(await page.evaluate(()=>__FORGE_ARENA.run.elapsed)>at);
    return {overflow:false,pauseFreezes:true};
  },{width:320,height:568});
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();if(server)await new Promise(r=>server.close(r));
}
assert.equal(report.errors.length,0,JSON.stringify(report.errors));
assert.ok(report.cases.every(c=>c.status==='PASS'),JSON.stringify(report.cases.filter(c=>c.status!=='PASS')));
